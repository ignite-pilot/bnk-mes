/**
 * 원자재 업체 창고 정보 API (원자재.md, 기본규칙.md)
 * - 목록(검색: 공급 업체, 창고 이름, 기간 default 1주), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 삭제는 플래그만, 목록은 deleted=N만, 등록/수정/삭제 시 수정일자·수정자 갱신
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { toStartOfDayString, toEndOfDayString } from '../lib/dateUtils.js';

const router = Router();
const TABLE = 'supplier_warehouses';
const JUNCTION_TABLE = 'warehouse_raw_materials';
const SUPPLIERS_TABLE = 'raw_material_suppliers';

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start, end };
}

const LIST_SELECT = `SELECT w.id, w.supplier_id, s.name AS supplier_name, w.name, w.address, w.postal_code, w.address_detail, w.updated_at, w.updated_by
  FROM \`${TABLE}\` w
  INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = w.supplier_id AND s.deleted = 'N'`;

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/material-warehouses/export-excel?supplierId=&warehouseName=&startDate=&endDate=
 */
router.get('/export-excel', async (req, res) => {
  try {
    const { supplierId = '', warehouseName = '', startDate, endDate } = req.query;
    const { start, end } = defaultDateRange();
    const from = toStartOfDayString(startDate ? new Date(startDate) : start);
    const to = toEndOfDayString(endDate ? new Date(endDate) : end);

    let where = 'WHERE w.deleted = ? AND w.updated_at >= ? AND w.updated_at <= ?';
    const params = ['N', from, to];
    const sid = parseInt(supplierId, 10);
    if (!Number.isNaN(sid) && sid > 0) {
      where += ' AND w.supplier_id = ?';
      params.push(sid);
    }
    if (warehouseName && String(warehouseName).trim()) {
      where += ' AND w.name LIKE ?';
      params.push(`%${String(warehouseName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY w.id DESC`,
      params
    );
    const safeRows = Array.isArray(rows) ? rows : [];

    const BOM = '\uFEFF';
    const header = '원자재 공급 업체,창고 이름,우편번호,주소,상세주소,수정일자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = safeRows
      .map(
        (r) =>
          [
            toCsvCell(r.supplier_name),
            toCsvCell(r.name),
            toCsvCell(r.postal_code),
            toCsvCell(r.address),
            toCsvCell(r.address_detail),
            toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.updated_by),
          ].join(',')
      )
      .join('\n');
    const csv = BOM + header + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="supplier_warehouses.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('material-warehouse export error', { error: err.message, stack: err.stack });
    let message = '엑셀 다운로드에 실패했습니다.';
    if (process.env.NODE_ENV !== 'production') {
      message = `엑셀 다운로드 실패: ${err.message}`;
    } else if (err.code === 'ER_NO_SUCH_TABLE') {
      message = '엑셀 다운로드에 실패했습니다. (DB 테이블 없음: npm run setup:supplier-warehouses 실행 후 서버 재시작)';
    }
    res.status(500).json({
      error: message,
      detail: err.message,
    });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만, 검색: 공급 업체, 창고 이름, 기간 default 1주)
 * GET /api/material-warehouses?supplierId=&warehouseName=&startDate=&endDate=&page=1&limit=20
 */
router.get('/', async (req, res) => {
  try {
    const { supplierId = '', warehouseName = '', startDate, endDate, page = 1, limit = 20 } = req.query;
    const { start, end } = defaultDateRange();
    const from = toStartOfDayString(startDate ? new Date(startDate) : start);
    const to = toEndOfDayString(endDate ? new Date(endDate) : end);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE w.deleted = ? AND w.updated_at >= ? AND w.updated_at <= ?';
    const params = ['N', from, to];
    const sid = parseInt(supplierId, 10);
    if (!Number.isNaN(sid) && sid > 0) {
      where += ' AND w.supplier_id = ?';
      params.push(sid);
    }
    if (warehouseName && String(warehouseName).trim()) {
      where += ' AND w.name LIKE ?';
      params.push(`%${String(warehouseName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY w.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` w INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = w.supplier_id AND s.deleted = 'N' ${where}`,
      params
    );
    const total = (countRows && countRows[0] && countRows[0].total) != null ? Number(countRows[0].total) : 0;
    res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('material-warehouse list error', { error: err.message, stack: err.stack });
    let message = '목록 조회에 실패했습니다.';
    if (process.env.NODE_ENV !== 'production') {
      message = `목록 조회 실패: ${err.message}`;
    } else if (err.code === 'ER_NO_SUCH_TABLE') {
      message = '목록 조회에 실패했습니다. (DB 테이블 없음: npm run setup:supplier-warehouses 실행 후 서버 재시작)';
    }
    res.status(500).json({
      error: message,
      detail: err.message,
    });
  }
});

/**
 * 단건 조회 (보관 원자재 id 목록 포함)
 * GET /api/material-warehouses/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE w.id = ? AND w.deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '창고를 찾을 수 없습니다.' });
    const [idsRows] = await getPool().query(
      `SELECT raw_material_id FROM \`${JUNCTION_TABLE}\` WHERE warehouse_id = ?`,
      [id]
    );
    const ids = Array.isArray(idsRows) ? idsRows : [];
    const warehouse = { ...rows[0], raw_material_ids: ids.map((r) => r.raw_material_id) };
    res.json(warehouse);
  } catch (err) {
    logger.error('material-warehouse get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/material-warehouses
 * 필수: supplier_id(공급 업체), name(창고 이름), address(주소), updatedBy(수정자)
 * 선택: postal_code, address_detail, raw_material_ids[]
 */
router.post('/', async (req, res) => {
  try {
    const {
      supplier_id,
      name,
      address,
      postal_code = null,
      address_detail = null,
      raw_material_ids = [],
      updatedBy = null,
    } = req.body || {};

    const supplierId = supplier_id != null ? parseInt(supplier_id, 10) : NaN;
    if (Number.isNaN(supplierId) || supplierId < 1) {
      return res.status(400).json({ error: '원자재 공급 업체는 필수입니다.' });
    }
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '창고 이름은 필수입니다.' });
    }
    if (!address || String(address).trim() === '') {
      return res.status(400).json({ error: '주소는 필수입니다.' });
    }
    if (updatedBy == null || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }

    const [supplierCheck] = await getPool().query(
      `SELECT id FROM \`${SUPPLIERS_TABLE}\` WHERE id = ? AND deleted = ?`,
      [supplierId, 'N']
    );
    if (!supplierCheck.length) {
      return res.status(400).json({ error: '선택한 공급 업체를 찾을 수 없습니다.' });
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (supplier_id, name, address, postal_code, address_detail, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        supplierId,
        String(name).trim(),
        String(address).trim(),
        postal_code != null ? String(postal_code).trim() : null,
        address_detail != null ? String(address_detail).trim() : null,
        updatedByTrimmed,
      ]
    );
    const warehouseId = result.insertId;

    const materialIds = Array.isArray(raw_material_ids)
      ? raw_material_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    if (materialIds.length > 0) {
      await getPool().query(
        `INSERT INTO \`${JUNCTION_TABLE}\` (warehouse_id, raw_material_id) VALUES ?`,
        [materialIds.map((mid) => [warehouseId, mid])]
      );
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE w.id = ?`, [warehouseId]);
    const [idsRows] = await getPool().query(
      `SELECT raw_material_id FROM \`${JUNCTION_TABLE}\` WHERE warehouse_id = ?`,
      [warehouseId]
    );
    const ids = Array.isArray(idsRows) ? idsRows : [];
    res.status(201).json({ ...rows[0], raw_material_ids: ids.map((r) => r.raw_material_id) });
  } catch (err) {
    logger.error('material-warehouse create error', { error: err.message });
    res.status(500).json({ error: '등록에 실패했습니다.' });
  }
});

/**
 * 수정 (공급 업체, 창고 이름, 주소, 보관 원자재)
 * PATCH /api/material-warehouses/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const {
      supplier_id,
      name,
      address,
      postal_code,
      address_detail,
      raw_material_ids,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '창고를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (supplier_id !== undefined) {
      const sid = parseInt(supplier_id, 10);
      if (Number.isNaN(sid) || sid < 1) return res.status(400).json({ error: '원자재 공급 업체는 필수입니다.' });
      const [sc] = await getPool().query(
        `SELECT id FROM \`${SUPPLIERS_TABLE}\` WHERE id = ? AND deleted = ?`,
        [sid, 'N']
      );
      if (!sc.length) return res.status(400).json({ error: '선택한 공급 업체를 찾을 수 없습니다.' });
      updates.push('supplier_id = ?');
      params.push(sid);
    }
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '창고 이름은 필수입니다.' });
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (address !== undefined) {
      if (String(address).trim() === '') return res.status(400).json({ error: '주소는 필수입니다.' });
      updates.push('address = ?');
      params.push(String(address).trim());
    }
    if (postal_code !== undefined) {
      updates.push('postal_code = ?');
      params.push(postal_code != null ? String(postal_code).trim() : null);
    }
    if (address_detail !== undefined) {
      updates.push('address_detail = ?');
      params.push(address_detail != null ? String(address_detail).trim() : null);
    }
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length === 0 && raw_material_ids === undefined) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    if (updates.length > 0) {
      params.push(id);
      await getPool().query(
        `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
        [...params, 'N']
      );
    }

    if (raw_material_ids !== undefined) {
      await getPool().query(`DELETE FROM \`${JUNCTION_TABLE}\` WHERE warehouse_id = ?`, [id]);
      const materialIds = Array.isArray(raw_material_ids)
        ? raw_material_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
        : [];
      if (materialIds.length > 0) {
        await getPool().query(
          `INSERT INTO \`${JUNCTION_TABLE}\` (warehouse_id, raw_material_id) VALUES ?`,
          [materialIds.map((mid) => [id, mid])]
        );
      }
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE w.id = ?`, [id]);
    const [idsRows] = await getPool().query(
      `SELECT raw_material_id FROM \`${JUNCTION_TABLE}\` WHERE warehouse_id = ?`,
      [id]
    );
    const ids = Array.isArray(idsRows) ? idsRows : [];
    res.json({ ...rows[0], raw_material_ids: ids.map((r) => r.raw_material_id) });
  } catch (err) {
    logger.error('material-warehouse update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

/**
 * 삭제 (플래그만 변경, 수정일자·수정자 갱신)
 * DELETE /api/material-warehouses/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '창고를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('material-warehouse delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
