/**
 * 원자재 재고 관리 API (원자재.md, 기본규칙.md)
 * - 목록(flatten), 엑셀, 등록(업체/BNK), 단건조회, 수정, 삭제(플래그), 페이지네이션
 * - 위험도: 부족(red), 확보필요(orange), 안전(green), 일부과잉(lightbrown), 과잉위험(darkbrown)
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { toStartOfDayString, toEndOfDayString } from '../lib/dateUtils.js';

const router = Router();
const SNAPSHOTS_TABLE = 'stock_snapshots';
const LINES_TABLE = 'stock_snapshot_lines';
const BNK_WAREHOUSES_TABLE = 'bnk_warehouses';
const SUPPLIER_WAREHOUSES_TABLE = 'supplier_warehouses';
const SUPPLIERS_TABLE = 'raw_material_suppliers';
const RAW_MATERIALS_TABLE = 'raw_materials';
const TYPES_TABLE = 'material_types';

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start, end };
}

function getRiskLevel(quantity, safeStock, snapshotType) {
  const q = Number(quantity) || 0;
  const safe = Number(safeStock);
  if (safe == null || safe <= 0) return { level: 'safe', label: '안전', color: 'green' };
  const ratio = q / safe;
  if (ratio < 0.5) return { level: 'shortage', label: '재고 부족 위험', color: 'red' };
  if (ratio < 0.85) return { level: 'need', label: '재고 확보 필요', color: 'orange' };
  if (ratio < 1.15) return { level: 'safe', label: '안전', color: 'green' };
  if (ratio < 1.5) return { level: 'excess_low', label: '일부 공급 과잉', color: 'lightbrown' };
  return { level: 'excess_high', label: '재고 과잉 위험', color: 'darkbrown' };
}

function applyRiskToList(rows) {
  return (rows || []).map((r) => {
    const safe = r.snapshot_type === 'bnk' ? r.bnk_warehouse_safety_stock : r.supplier_safety_stock;
    const risk = getRiskLevel(r.quantity, safe, r.snapshot_type);
    return { ...r, risk_level: risk.level, risk_label: risk.label, risk_color: risk.color };
  });
}

router.get('/bnk-warehouses', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, name FROM \`${BNK_WAREHOUSES_TABLE}\` WHERE deleted = 'N' ORDER BY name`,
      []
    );
    res.json({ list: rows || [] });
  } catch (err) {
    logger.error('material-stock bnk-warehouses error', { error: err.message });
    res.status(500).json({ error: '비엔케이 창고 목록 조회에 실패했습니다.', detail: err.message });
  }
});

router.get('/export-excel', async (req, res) => {
  try {
    const { type = '', supplierId = '', warehouseName = '', rawMaterialIds = '', startDate, endDate } = req.query;
    const { start, end } = defaultDateRange();
    const fromStr = toStartOfDayString(startDate ? new Date(startDate) : start);
    const toStr = toEndOfDayString(endDate ? new Date(endDate) : end);

    let where = "WHERE ss.deleted = 'N' AND ss.stock_date >= ? AND ss.stock_date <= ?";
    const params = [fromStr, toStr];
    if (type === 'supplier') {
      where += " AND ss.snapshot_type = 'supplier'";
    } else if (type === 'bnk') {
      where += " AND ss.snapshot_type = 'bnk'";
    }
    const materialIds = rawMaterialIds
      ? rawMaterialIds.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    if (materialIds.length) {
      where += ` AND sl.raw_material_id IN (${materialIds.map(() => '?').join(',')})`;
      params.push(...materialIds);
    }
    const sid = parseInt(supplierId, 10);
    if (!Number.isNaN(sid) && sid > 0) {
      where += ' AND sup.id = ?';
      params.push(sid);
    }
    if (warehouseName && String(warehouseName).trim()) {
      const like = `%${String(warehouseName).trim()}%`;
      where += ' AND (sw.name LIKE ? OR bw.name LIKE ?)';
      params.push(like, like);
    }

    const sql = `
      SELECT ss.id AS snapshot_id, ss.snapshot_type, ss.stock_date, ss.supplier_warehouse_id, ss.bnk_warehouse_id,
        sl.raw_material_id, sl.quantity,
        rm.name AS raw_material_name, mt.name AS raw_material_kind,
        rm.supplier_safety_stock, rm.bnk_warehouse_safety_stock,
        sw.name AS supplier_warehouse_name, sup.name AS supplier_name,
        bw.name AS bnk_warehouse_name
      FROM \`${SNAPSHOTS_TABLE}\` ss
      INNER JOIN \`${LINES_TABLE}\` sl ON sl.snapshot_id = ss.id
      INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = sl.raw_material_id
      LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
      LEFT JOIN \`${SUPPLIER_WAREHOUSES_TABLE}\` sw ON sw.id = ss.supplier_warehouse_id AND sw.deleted = 'N'
      LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = sw.supplier_id AND sup.deleted = 'N'
      LEFT JOIN \`${BNK_WAREHOUSES_TABLE}\` bw ON bw.id = ss.bnk_warehouse_id AND bw.deleted = 'N'
      ${where}
      ORDER BY ss.stock_date DESC, ss.id DESC, sl.raw_material_id
    `;
    const [rows] = await getPool().query(sql, params);
    const withRisk = applyRiskToList(rows);

    const BOM = '\uFEFF';
    const header = '재고 기준일,원자재,업체 종류,재고 수량,안전재고,위험도\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = withRisk
      .map((r) => {
        const safe = r.snapshot_type === 'bnk' ? r.bnk_warehouse_safety_stock : r.supplier_safety_stock;
        const kindName = [r.raw_material_kind, r.raw_material_name].filter(Boolean).join(' / ');
        return [
          toCsvCell(r.stock_date ? new Date(r.stock_date).toISOString().slice(0, 10) : ''),
          toCsvCell(kindName || r.raw_material_name),
          toCsvCell(r.snapshot_type === 'bnk' ? '비엔케이' : '원자재'),
          toCsvCell(r.quantity),
          toCsvCell(safe),
          toCsvCell(r.risk_label),
        ].join(',');
      })
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="material_stock.csv"');
    res.send(BOM + header + body);
  } catch (err) {
    logger.error('material-stock export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.', detail: err.message });
  }
});

function toDateString(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

router.get('/', async (req, res) => {
  try {
    const { type = '', supplierId = '', warehouseName = '', rawMaterialIds = '', startDate, endDate, page = 1, limit = 20 } = req.query;
    const { start, end } = defaultDateRange();
    const fromStr = toStartOfDayString(startDate ? new Date(startDate) : start);
    const toStr = toEndOfDayString(endDate ? new Date(endDate) : end);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = "WHERE ss.deleted = 'N' AND ss.stock_date >= ? AND ss.stock_date <= ?";
    const params = [fromStr, toStr];
    if (type === 'supplier') where += " AND ss.snapshot_type = 'supplier'";
    else if (type === 'bnk') where += " AND ss.snapshot_type = 'bnk'";
    const materialIds = rawMaterialIds
      ? rawMaterialIds.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    if (materialIds.length) {
      where += ` AND sl.raw_material_id IN (${materialIds.map(() => '?').join(',')})`;
      params.push(...materialIds);
    }
    const sid = parseInt(supplierId, 10);
    if (!Number.isNaN(sid) && sid > 0) {
      where += ' AND sup.id = ?';
      params.push(sid);
    }
    if (warehouseName && String(warehouseName).trim()) {
      const like = `%${String(warehouseName).trim()}%`;
      where += ' AND (sw.name LIKE ? OR bw.name LIKE ?)';
      params.push(like, like);
    }

    const listSql = `
      SELECT ss.id AS snapshot_id, ss.snapshot_type, ss.stock_date, ss.supplier_warehouse_id, ss.bnk_warehouse_id,
        sl.raw_material_id, sl.quantity,
        rm.name AS raw_material_name, mt.name AS raw_material_kind,
        rm.supplier_safety_stock, rm.bnk_warehouse_safety_stock,
        sw.name AS supplier_warehouse_name, sup.name AS supplier_name,
        bw.name AS bnk_warehouse_name
      FROM \`${SNAPSHOTS_TABLE}\` ss
      INNER JOIN \`${LINES_TABLE}\` sl ON sl.snapshot_id = ss.id
      INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = sl.raw_material_id
      LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
      LEFT JOIN \`${SUPPLIER_WAREHOUSES_TABLE}\` sw ON sw.id = ss.supplier_warehouse_id AND sw.deleted = 'N'
      LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = sw.supplier_id AND sup.deleted = 'N'
      LEFT JOIN \`${BNK_WAREHOUSES_TABLE}\` bw ON bw.id = ss.bnk_warehouse_id AND bw.deleted = 'N'
      ${where}
      ORDER BY ss.stock_date DESC, ss.id DESC, sl.raw_material_id
      LIMIT ? OFFSET ?
    `;
    const countSql = `
      SELECT COUNT(*) AS total
      FROM \`${SNAPSHOTS_TABLE}\` ss
      INNER JOIN \`${LINES_TABLE}\` sl ON sl.snapshot_id = ss.id
      LEFT JOIN \`${SUPPLIER_WAREHOUSES_TABLE}\` sw ON sw.id = ss.supplier_warehouse_id AND sw.deleted = 'N'
      LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = sw.supplier_id AND sup.deleted = 'N'
      LEFT JOIN \`${BNK_WAREHOUSES_TABLE}\` bw ON bw.id = ss.bnk_warehouse_id AND bw.deleted = 'N'
      ${where}
    `;
    const [rows] = await getPool().query(listSql, [...params, limitNum, offset]);
    const [countRows] = await getPool().query(countSql, params);
    const total = (countRows && countRows[0] && countRows[0].total) != null ? Number(countRows[0].total) : 0;
    const withRisk = applyRiskToList(rows);
    res.json({ list: withRisk, total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('material-stock list error', { error: err.message, stack: err.stack });
    let message = '목록 조회에 실패했습니다.';
    if (err.code === 'ER_NO_SUCH_TABLE') {
      message = '재고 관련 DB 테이블이 없습니다. 터미널에서 npm run setup:material-stock 을 실행한 뒤 서버를 재시작해 주세요.';
    }
    res.status(500).json({ error: message, detail: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [snap] = await getPool().query(
      `SELECT ss.*, sw.name AS supplier_warehouse_name, sup.name AS supplier_name, sup.id AS supplier_id,
        bw.name AS bnk_warehouse_name
       FROM \`${SNAPSHOTS_TABLE}\` ss
       LEFT JOIN \`${SUPPLIER_WAREHOUSES_TABLE}\` sw ON sw.id = ss.supplier_warehouse_id AND sw.deleted = 'N'
       LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = sw.supplier_id AND sup.deleted = 'N'
       LEFT JOIN \`${BNK_WAREHOUSES_TABLE}\` bw ON bw.id = ss.bnk_warehouse_id AND bw.deleted = 'N'
       WHERE ss.id = ? AND ss.deleted = 'N'`,
      [id]
    );
    if (!snap.length) return res.status(404).json({ error: '재고 데이터를 찾을 수 없습니다.' });
    const [lines] = await getPool().query(
      `SELECT sl.raw_material_id, sl.quantity, rm.name AS raw_material_name, mt.name AS raw_material_kind
       FROM \`${LINES_TABLE}\` sl
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = sl.raw_material_id
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE sl.snapshot_id = ?`,
      [id]
    );
    const linesList = Array.isArray(lines) ? lines : [];
    res.json({ ...snap[0], lines: linesList });
  } catch (err) {
    logger.error('material-stock get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { snapshotType, supplierWarehouseId, bnkWarehouseId, stockDate, lines = [], updatedBy } = req.body || {};
    if (!stockDate || String(stockDate).trim() === '') return res.status(400).json({ error: '재고 기준일은 필수입니다.' });
    if (!updatedBy || String(updatedBy).trim() === '') return res.status(400).json({ error: '수정자는 필수입니다.' });
    const lineList = Array.isArray(lines) ? lines.filter((l) => l.raw_material_id && (l.quantity != null && l.quantity !== '')) : [];
    if (lineList.length === 0) return res.status(400).json({ error: '원자재 재고 정보를 1건 이상 입력해 주세요.' });

    const type = snapshotType === 'bnk' ? 'bnk' : 'supplier';
    if (type === 'supplier') {
      const wid = parseInt(supplierWarehouseId, 10);
      if (Number.isNaN(wid) || wid < 1) return res.status(400).json({ error: '원자재 업체 창고를 선택해 주세요.' });
      const [wh] = await getPool().query(
        `SELECT id FROM \`${SUPPLIER_WAREHOUSES_TABLE}\` WHERE id = ? AND deleted = 'N'`,
        [wid]
      );
      if (!wh.length) return res.status(400).json({ error: '선택한 창고를 찾을 수 없습니다.' });
    } else {
      const wid = parseInt(bnkWarehouseId, 10);
      if (Number.isNaN(wid) || wid < 1) return res.status(400).json({ error: '비엔케이 창고를 선택해 주세요.' });
      const [wh] = await getPool().query(
        `SELECT id FROM \`${BNK_WAREHOUSES_TABLE}\` WHERE id = ? AND deleted = 'N'`,
        [wid]
      );
      if (!wh.length) return res.status(400).json({ error: '선택한 창고를 찾을 수 없습니다.' });
    }

    const [result] = await getPool().query(
      `INSERT INTO \`${SNAPSHOTS_TABLE}\` (snapshot_type, supplier_warehouse_id, bnk_warehouse_id, stock_date, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        type,
        type === 'supplier' ? parseInt(supplierWarehouseId, 10) : null,
        type === 'bnk' ? parseInt(bnkWarehouseId, 10) : null,
        String(stockDate).trim().slice(0, 10),
        String(updatedBy).trim(),
      ]
    );
    const snapshotId = result.insertId;
    const lineRows = lineList.map((l) => [
      snapshotId,
      parseInt(l.raw_material_id, 10),
      Number(l.quantity) || 0,
    ]);
    await getPool().query(
      `INSERT INTO \`${LINES_TABLE}\` (snapshot_id, raw_material_id, quantity) VALUES ?`,
      [lineRows]
    );
    const [snap] = await getPool().query(
      `SELECT ss.*, sw.name AS supplier_warehouse_name, sup.name AS supplier_name,
        bw.name AS bnk_warehouse_name
       FROM \`${SNAPSHOTS_TABLE}\` ss
       LEFT JOIN \`${SUPPLIER_WAREHOUSES_TABLE}\` sw ON sw.id = ss.supplier_warehouse_id AND sw.deleted = 'N'
       LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = sw.supplier_id AND sup.deleted = 'N'
       LEFT JOIN \`${BNK_WAREHOUSES_TABLE}\` bw ON bw.id = ss.bnk_warehouse_id AND bw.deleted = 'N'
       WHERE ss.id = ?`,
      [snapshotId]
    );
    const [linesRes] = await getPool().query(
      `SELECT sl.raw_material_id, sl.quantity, rm.name AS raw_material_name, mt.name AS raw_material_kind
       FROM \`${LINES_TABLE}\` sl
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = sl.raw_material_id
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE sl.snapshot_id = ?`,
      [snapshotId]
    );
    res.status(201).json({ ...snap[0], lines: linesRes || [] });
  } catch (err) {
    logger.error('material-stock create error', { error: err.message });
    res.status(500).json({ error: '등록에 실패했습니다.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const { supplierWarehouseId, bnkWarehouseId, stockDate, lines, updatedBy } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${SNAPSHOTS_TABLE}\` WHERE id = ? AND deleted = 'N'`,
      [id]
    );
    if (!existing.length) return res.status(404).json({ error: '재고 데이터를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (stockDate !== undefined && String(stockDate).trim() !== '') {
      updates.push('stock_date = ?');
      params.push(String(stockDate).trim().slice(0, 10));
    }
    if (supplierWarehouseId !== undefined) {
      updates.push('supplier_warehouse_id = ?');
      params.push(supplierWarehouseId != null && String(supplierWarehouseId).trim() !== '' ? parseInt(supplierWarehouseId, 10) : null);
    }
    if (bnkWarehouseId !== undefined) {
      updates.push('bnk_warehouse_id = ?');
      params.push(bnkWarehouseId != null && String(bnkWarehouseId).trim() !== '' ? parseInt(bnkWarehouseId, 10) : null);
    }
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length > 0) {
      params.push(id);
      await getPool().query(
        `UPDATE \`${SNAPSHOTS_TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = 'N'`,
        params
      );
    }
    if (lines !== undefined && Array.isArray(lines)) {
      await getPool().query(`DELETE FROM \`${LINES_TABLE}\` WHERE snapshot_id = ?`, [id]);
      const lineList = lines.filter((l) => l.raw_material_id && (l.quantity != null && l.quantity !== ''));
      if (lineList.length > 0) {
        await getPool().query(
          `INSERT INTO \`${LINES_TABLE}\` (snapshot_id, raw_material_id, quantity) VALUES ?`,
          [lineList.map((l) => [id, parseInt(l.raw_material_id, 10), Number(l.quantity) || 0])]
        );
      }
    }
    const [snap] = await getPool().query(
      `SELECT ss.*, sw.name AS supplier_warehouse_name, sup.name AS supplier_name, bw.name AS bnk_warehouse_name
       FROM \`${SNAPSHOTS_TABLE}\` ss
       LEFT JOIN \`${SUPPLIER_WAREHOUSES_TABLE}\` sw ON sw.id = ss.supplier_warehouse_id AND sw.deleted = 'N'
       LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = sw.supplier_id AND sup.deleted = 'N'
       LEFT JOIN \`${BNK_WAREHOUSES_TABLE}\` bw ON bw.id = ss.bnk_warehouse_id AND bw.deleted = 'N'
       WHERE ss.id = ?`,
      [id]
    );
    const [linesRes] = await getPool().query(
      `SELECT sl.raw_material_id, sl.quantity, rm.name AS raw_material_name, mt.name AS raw_material_kind
       FROM \`${LINES_TABLE}\` sl
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = sl.raw_material_id
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE sl.snapshot_id = ?`,
      [id]
    );
    res.json({ ...snap[0], lines: linesRes || [] });
  } catch (err) {
    logger.error('material-stock update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${SNAPSHOTS_TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '재고 데이터를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('material-stock delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
