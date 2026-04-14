/**
 * 원자재 재고 관리 API (원자재.md, 기본규칙.md)
 * - 목록(flatten), 엑셀, 등록(업체/BNK), 단건조회, 수정, 삭제(플래그), 페이지네이션
 * - 위험도: 부족(red), 확보필요(orange), 안전(green), 일부과잉(lightbrown), 과잉위험(darkbrown)
 */
import express, { Router } from 'express';
import { sendXlsx } from '../lib/excel-export.js';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { optionalSqlDateRange } from '../lib/dateUtils.js';
import { getAllCodeMaps } from '../lib/config-codes.js';
import XLSX from 'xlsx';

const router = Router();
const SNAPSHOTS_TABLE = 'stock_snapshots';
const LINES_TABLE = 'stock_snapshot_lines';
const BNK_WAREHOUSES_TABLE = 'bnk_warehouses';
const SUPPLIER_WAREHOUSES_TABLE = 'supplier_warehouses';
const SUPPLIERS_TABLE = 'raw_material_suppliers';
const RAW_MATERIALS_TABLE = 'raw_materials';
const TYPES_TABLE = 'material_types';

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

// ── 코드 정규화 맵 (Excel 표기 → config manager 값) ──
const VEHICLE_NORM = {
  'ME1a': 'ME1A', 'CN7 PE': 'CN7PE', 'RG3 PE': 'RG3PE', 'NX4 PE': 'NX4PE',
  'RG3 PE EV': 'RG3PE EV', 'JK1 PE': 'JK1 PE',
};
const PART_NORM = {
  'Main': 'MAIN', 'Main FRT': 'MAIN FRT', 'Main RR': 'MAIN RR',
  'Main/FRT': 'MAIN FRT', 'Main/RR': 'MAIN RR',
  'A/Rest': 'A/REST', 'A/Rest FRT': 'A/REST FRT', 'A/Rest RR': 'A/REST RR',
  'A/Rest UPR FRT': 'A/REST UPR FRT',
  'A/REST UPR RR': 'A/Rest UPR RR', // config manager에 A/Rest UPR RR 로 등록됨
  'A/REST/FRT': 'A/REST FRT', 'A/REST/RR': 'A/REST RR',
  'CTR/FRT': 'CTR FRT', 'CTR/RR': 'CTR RR',
  'UPR/FRT': 'UPR FRT', 'UPR/RR': 'UPR RR',
  'UPR F': 'UPR FRT', 'UPR R': 'UPR RR',
  'UPR  FRT': 'UPR FRT', 'UPR  RR': 'UPR RR', 'UPR  4CVT': 'UPR 4CVT',
  'H/INR': 'H/INNER',
};
function normCode(v, map) { if (!v) return ''; const s = String(v).trim(); return map[s] || s; }

/**
 * 현진엠아이 Excel 파서
 * 시트: 재고수량
 * 헤더(행2): 제품코드 | 차종 | 적용부 | 칼라코드 | 색상 | 상,하지 | 두께 | 폭 | 상지재고수량 | 하지재고수량
 */
function parseHyunjin(wb) {
  const sheet = wb.Sheets['재고수량'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(3); // 데이터는 행3부터
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r[1]) continue; // 차종 없으면 skip
    const vehicle = normCode(r[1], VEHICLE_NORM);
    const part = normCode(r[2], PART_NORM);
    const color = String(r[4] || '').trim(); // 색상
    const kind = String(r[5] || '').trim(); // 상,하지
    const sangjiQty = Number(r[8]) || 0;
    const hajiQty = Number(r[9]) || 0;

    const thickness = Number(r[6]) || null;
    const width = Number(r[7]) || null;

    if (kind.includes('상지') && sangjiQty > 0) {
      items.push({ rowNum: i + 4, vehicle, part, color, kind: '상지', thickness, width, quantity: sangjiQty });
    }
    if (kind.includes('하지') && hajiQty > 0) {
      items.push({ rowNum: i + 4, vehicle, part, color, kind: '하지', thickness, width, quantity: hajiQty });
    }
    if (!kind.includes('상지') && !kind.includes('하지')) {
      if (sangjiQty > 0) items.push({ rowNum: i + 4, vehicle, part, color, kind: '상지', thickness, width, quantity: sangjiQty });
      if (hajiQty > 0) items.push({ rowNum: i + 4, vehicle, part, color, kind: '하지', thickness, width, quantity: hajiQty });
    }
  }
  return items;
}

/**
 * 협성 Excel 파서
 * 시트: 재고현황(상지), 재고현황(하지)
 * 헤더(행3): NO | 품목 | 자재코드 | 생산일자 | 차종 | 부위 | 색상 | 두께 | 폭 | 재고량(m) | LOT
 */
function parseHyupsung(wb) {
  const items = [];
  for (const [sheetName, kind] of [['재고현황(상지)', '상지'], ['재고현황(하지)', '하지']]) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(4); // 데이터는 행4부터
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const vehicle = normCode(r[4], VEHICLE_NORM);
      const part = normCode(r[5], PART_NORM);
      const color = String(r[6] || '').trim();
      const thickness = Number(r[7]) || null;
      const width = Number(r[8]) || null;
      const quantity = Number(r[9]) || 0;
      if (!vehicle || !color || quantity <= 0) continue;
      items.push({ rowNum: i + 5, vehicle, part, color, kind, thickness, width, quantity });
    }
  }
  return items;
}

/**
 * 엑셀 업로드 — 업체별 원자재 재고 일괄 등록 (xlsx)
 * POST /api/material-stock/upload-excel
 * query: supplierId, stockDate, updatedBy
 * body: binary xlsx
 */
router.post('/upload-excel', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const { supplierId, stockDate, updatedBy } = req.query;
    if (!supplierId) return res.status(400).json({ error: '업체를 선택해 주세요.' });
    if (!stockDate) return res.status(400).json({ error: '재고 기준일을 입력해 주세요.' });
    if (!updatedBy) return res.status(400).json({ error: '등록자 정보가 필요합니다.' });

    const sid = parseInt(supplierId, 10);
    const pool = getPool();

    // 업체 이름 조회
    const [supplierRows] = await pool.query(
      `SELECT name FROM \`${SUPPLIERS_TABLE}\` WHERE id = ? AND deleted = 'N'`, [sid]
    );
    if (!supplierRows.length) return res.status(400).json({ error: '업체를 찾을 수 없습니다.' });
    const supplierName = supplierRows[0].name;

    // xlsx 파싱
    const wb = XLSX.read(req.body, { type: 'buffer' });

    // 업체에 따라 파서 선택
    let parsedItems;
    if (supplierName.includes('현진')) {
      parsedItems = parseHyunjin(wb);
    } else if (supplierName.includes('협성')) {
      parsedItems = parseHyupsung(wb);
    } else {
      return res.status(400).json({ error: `"${supplierName}" 업체의 엑셀 파서가 아직 등록되지 않았습니다. 현진, 협성만 지원됩니다.` });
    }

    if (parsedItems.length === 0) return res.status(400).json({ error: '재고가 있는 데이터가 없습니다.' });

    // config manager 코드 맵 가져오기
    const { vehicleMap, partMap, colorMap } = await getAllCodeMaps();

    // 원자재 DB 맵: vehicle_code|part_code|color_code|kind|thickness|width → id
    const [rmRows] = await pool.query(
      `SELECT rm.id, rm.vehicle_code, rm.part_code, rm.color_code, rm.kind_id, rm.thickness, rm.width, mt.name AS kind
       FROM \`${RAW_MATERIALS_TABLE}\` rm
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE rm.deleted = 'N'`
    );
    // 두께+폭까지 포함한 정밀 매칭 맵
    const rmMapFull = {};
    // 두께+폭 없이 차종+적용부+색상+종류만으로 매칭 (fallback)
    const rmMapBase = {};
    for (const rm of rmRows) {
      const baseKey = `${rm.vehicle_code || ''}|${rm.part_code || ''}|${rm.color_code || ''}|${rm.kind || ''}`;
      const fullKey = `${baseKey}|${rm.thickness}|${rm.width}`;
      rmMapFull[fullKey] = rm.id;
      rmMapBase[baseKey] = rm.id;
    }

    const errors = [];
    const lines = [];

    for (const item of parsedItems) {
      const rowErrors = [];

      // config manager 코드 검증
      if (item.vehicle && !vehicleMap[item.vehicle]) {
        rowErrors.push(`차종 "${item.vehicle}" config manager에 없음`);
      }
      if (item.part && !partMap[item.part]) {
        rowErrors.push(`적용부 "${item.part}" config manager에 없음`);
      }
      if (item.color && !colorMap[item.color]) {
        rowErrors.push(`색상 "${item.color}" config manager에 없음`);
      }

      // 원자재 매칭 (두께+폭 정밀 매칭 → fallback 기본 매칭)
      const baseKey = `${item.vehicle}|${item.part}|${item.color}|${item.kind}`;
      const fullKey = `${baseKey}|${item.thickness}|${item.width}`;
      const rmId = rmMapFull[fullKey] || rmMapBase[baseKey];
      if (!rmId) {
        rowErrors.push(`원자재 매칭 안됨 (${item.vehicle} ${item.part} ${item.color} ${item.kind})`);
      }

      if (rowErrors.length > 0) {
        errors.push({ row: item.rowNum, name: `${item.vehicle} ${item.part} ${item.color} ${item.kind}`, errors: rowErrors });
      } else {
        lines.push({ raw_material_id: rmId, quantity: item.quantity });
      }
    }

    // 같은 원자재 중복 시 수량 합산
    const mergedMap = new Map();
    for (const l of lines) {
      mergedMap.set(l.raw_material_id, (mergedMap.get(l.raw_material_id) || 0) + l.quantity);
    }
    const mergedLines = [...mergedMap.entries()].map(([raw_material_id, quantity]) => ({ raw_material_id, quantity }));

    let inserted = 0;
    if (mergedLines.length > 0) {
      const [result] = await pool.query(
        `INSERT INTO \`${SNAPSHOTS_TABLE}\` (snapshot_type, supplier_id, stock_date, updated_by)
         VALUES ('supplier', ?, ?, ?)`,
        [sid, String(stockDate).trim().slice(0, 10), String(updatedBy).trim()]
      );
      const snapshotId = result.insertId;
      const lineRows = mergedLines.map(l => [snapshotId, l.raw_material_id, l.quantity]);
      await pool.query(
        `INSERT INTO \`${LINES_TABLE}\` (snapshot_id, raw_material_id, quantity) VALUES ?`,
        [lineRows]
      );
      inserted = lines.length;
    }

    res.json({ inserted, errors, totalRows: parsedItems.length });
  } catch (err) {
    logger.error('material-stock upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: `업로드에 실패했습니다: ${err.message}` });
  }
});

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
    const range = optionalSqlDateRange(startDate, endDate);
    let where = "WHERE ss.deleted = 'N'";
    const params = [];
    if (range) {
      where += ' AND ss.stock_date >= ? AND ss.stock_date <= ?';
      params.push(range.from, range.to);
    }
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
      where += ' AND ss.supplier_id = ?';
      params.push(sid);
    }

    const sql = `
      SELECT ss.id AS snapshot_id, ss.snapshot_type, ss.stock_date, ss.supplier_id,
        sl.raw_material_id, sl.quantity,
        rm.name AS raw_material_name, mt.name AS raw_material_kind,
        rm.vehicle_code, rm.vehicle_name, rm.part_code, rm.part_name, rm.color_code, rm.color,
        rm.thickness, rm.width,
        rm.supplier_safety_stock, rm.bnk_warehouse_safety_stock,
        sup.name AS supplier_name
      FROM \`${SNAPSHOTS_TABLE}\` ss
      INNER JOIN \`${LINES_TABLE}\` sl ON sl.snapshot_id = ss.id
      INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = sl.raw_material_id
      LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
      LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = ss.supplier_id AND sup.deleted = 'N'
      ${where}
      ORDER BY ss.stock_date DESC, ss.id DESC, sl.raw_material_id
    `;
    const [rows] = await getPool().query(sql, params);
    const withRisk = applyRiskToList(rows);

    const headers = [['재고 기준일', '원자재', '업체 종류', '재고 수량', '안전재고', '위험도']];
    const data = withRisk.map(r => {
      const kindName = r.kind || r.raw_material_name;
      const safe = r.snapshot_type === 'bnk' ? r.bnk_warehouse_safety_stock : r.supplier_safety_stock;
      return [
        r.stock_date ? new Date(r.stock_date).toISOString().slice(0, 10) : '',
        kindName || r.raw_material_name,
        r.snapshot_type === 'bnk' ? '비엔케이' : '원자재',
        r.quantity,
        safe,
        r.risk_label,
      ];
    });
    sendXlsx(res, headers, data, 'material_stock.xlsx');
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
    const range = optionalSqlDateRange(startDate, endDate);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = "WHERE ss.deleted = 'N'";
    const params = [];
    if (range) {
      where += ' AND ss.stock_date >= ? AND ss.stock_date <= ?';
      params.push(range.from, range.to);
    }
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
      where += ' AND ss.supplier_id = ?';
      params.push(sid);
    }

    const listSql = `
      SELECT ss.id AS snapshot_id, ss.snapshot_type, ss.stock_date, ss.supplier_id,
        sl.id AS line_id, sl.raw_material_id, sl.quantity,
        rm.name AS raw_material_name, mt.name AS raw_material_kind,
        rm.vehicle_code, rm.vehicle_name, rm.part_code, rm.part_name, rm.color_code, rm.color,
        rm.thickness, rm.width,
        rm.supplier_safety_stock, rm.bnk_warehouse_safety_stock,
        sup.name AS supplier_name
      FROM \`${SNAPSHOTS_TABLE}\` ss
      INNER JOIN \`${LINES_TABLE}\` sl ON sl.snapshot_id = ss.id
      INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = sl.raw_material_id
      LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
      LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = ss.supplier_id AND sup.deleted = 'N'
      ${where}
      ORDER BY ss.stock_date DESC, ss.id DESC, sl.raw_material_id
      LIMIT ? OFFSET ?
    `;
    const countSql = `
      SELECT COUNT(*) AS total
      FROM \`${SNAPSHOTS_TABLE}\` ss
      INNER JOIN \`${LINES_TABLE}\` sl ON sl.snapshot_id = ss.id
      LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = ss.supplier_id AND sup.deleted = 'N'
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
      `SELECT ss.*, sup.name AS supplier_name
       FROM \`${SNAPSHOTS_TABLE}\` ss
       LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = ss.supplier_id AND sup.deleted = 'N'
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
    const { snapshotType, supplierId, stockDate, lines = [], updatedBy } = req.body || {};
    if (!stockDate || String(stockDate).trim() === '') return res.status(400).json({ error: '재고 기준일은 필수입니다.' });
    if (!updatedBy || String(updatedBy).trim() === '') return res.status(400).json({ error: '수정자는 필수입니다.' });
    const lineList = Array.isArray(lines) ? lines.filter((l) => l.raw_material_id && (l.quantity != null && l.quantity !== '')) : [];
    if (lineList.length === 0) return res.status(400).json({ error: '원자재 재고 정보를 1건 이상 입력해 주세요.' });

    const type = snapshotType === 'bnk' ? 'bnk' : 'supplier';
    if (type === 'supplier') {
      const sid = parseInt(supplierId, 10);
      if (Number.isNaN(sid) || sid < 1) return res.status(400).json({ error: '업체를 선택해 주세요.' });
      const [sup] = await getPool().query(
        `SELECT id FROM \`${SUPPLIERS_TABLE}\` WHERE id = ? AND deleted = 'N'`,
        [sid]
      );
      if (!sup.length) return res.status(400).json({ error: '선택한 업체를 찾을 수 없습니다.' });
    }

    const [result] = await getPool().query(
      `INSERT INTO \`${SNAPSHOTS_TABLE}\` (snapshot_type, supplier_id, stock_date, updated_by)
       VALUES (?, ?, ?, ?)`,
      [
        type,
        type === 'supplier' ? parseInt(supplierId, 10) : null,
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
      `SELECT ss.*, sup.name AS supplier_name
       FROM \`${SNAPSHOTS_TABLE}\` ss
       LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = ss.supplier_id AND sup.deleted = 'N'
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
    const { supplierId, stockDate, lines, updatedBy } = req.body || {};

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
    if (supplierId !== undefined) {
      updates.push('supplier_id = ?');
      params.push(supplierId != null && String(supplierId).trim() !== '' ? parseInt(supplierId, 10) : null);
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
      `SELECT ss.*, sup.name AS supplier_name
       FROM \`${SNAPSHOTS_TABLE}\` ss
       LEFT JOIN \`${SUPPLIERS_TABLE}\` sup ON sup.id = ss.supplier_id AND sup.deleted = 'N'
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

// ── 개별 라인 수량 수정 ──
router.patch('/lines/:lineId', async (req, res) => {
  try {
    const lineId = parseInt(req.params.lineId, 10);
    if (Number.isNaN(lineId)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const { quantity, updatedBy } = req.body || {};
    if (quantity == null || quantity === '') return res.status(400).json({ error: '수량을 입력해 주세요.' });
    const [existing] = await getPool().query(
      `SELECT sl.id, sl.snapshot_id FROM \`${LINES_TABLE}\` sl
       INNER JOIN \`${SNAPSHOTS_TABLE}\` ss ON ss.id = sl.snapshot_id AND ss.deleted = 'N'
       WHERE sl.id = ?`, [lineId]
    );
    if (!existing.length) return res.status(404).json({ error: '재고 라인을 찾을 수 없습니다.' });
    await getPool().query(`UPDATE \`${LINES_TABLE}\` SET quantity = ? WHERE id = ?`, [Number(quantity) || 0, lineId]);
    if (updatedBy) {
      await getPool().query(`UPDATE \`${SNAPSHOTS_TABLE}\` SET updated_by = ? WHERE id = ?`, [String(updatedBy).trim(), existing[0].snapshot_id]);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('material-stock line update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

// ── 개별 라인 삭제 ──
router.delete('/lines/:lineId', async (req, res) => {
  try {
    const lineId = parseInt(req.params.lineId, 10);
    if (Number.isNaN(lineId)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [existing] = await getPool().query(
      `SELECT sl.id, sl.snapshot_id FROM \`${LINES_TABLE}\` sl
       INNER JOIN \`${SNAPSHOTS_TABLE}\` ss ON ss.id = sl.snapshot_id AND ss.deleted = 'N'
       WHERE sl.id = ?`, [lineId]
    );
    if (!existing.length) return res.status(404).json({ error: '재고 라인을 찾을 수 없습니다.' });
    await getPool().query(`DELETE FROM \`${LINES_TABLE}\` WHERE id = ?`, [lineId]);
    if (updatedBy) {
      await getPool().query(`UPDATE \`${SNAPSHOTS_TABLE}\` SET updated_by = ? WHERE id = ?`, [String(updatedBy).trim(), existing[0].snapshot_id]);
    }
    // 라인이 모두 삭제되면 스냅샷도 삭제
    const [[{ cnt }]] = await getPool().query(`SELECT COUNT(*) as cnt FROM \`${LINES_TABLE}\` WHERE snapshot_id = ?`, [existing[0].snapshot_id]);
    if (cnt === 0) {
      await getPool().query(`UPDATE \`${SNAPSHOTS_TABLE}\` SET deleted = 'Y', updated_by = ? WHERE id = ?`, [updatedBy, existing[0].snapshot_id]);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('material-stock line delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
