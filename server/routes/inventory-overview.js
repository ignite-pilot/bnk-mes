/**
 * 재고 현황 API — 통합관리 재고 시트 기반
 * - 목록 조회 (검색/페이지네이션)
 * - 엑셀 업로드 (통합관리 재고 시트 파싱)
 * - 개별 수량 인라인 수정
 * - 엑셀 다운로드
 */
import express, { Router } from 'express';
import { sendXlsx } from '../lib/excel-export.js';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import XLSX from 'xlsx';

const router = Router();
const TABLE = 'inventory_overview';

// ── 정규화 맵 ──
const VN = {
  'ME1a': 'ME1A', 'CN7 PE': 'CN7PE', 'RG3 PE': 'RG3PE', 'NX4 PE': 'NX4PE',
  'RG3 PE EV': 'RG3PE EV',
};
const PN = {
  'Main': 'MAIN', 'Main FRT': 'MAIN FRT', 'Main RR': 'MAIN RR',
  'Main/FRT': 'MAIN FRT', 'Main/RR': 'MAIN RR',
  'A/Rest': 'A/REST', 'A/Rest FRT': 'A/REST FRT', 'A/Rest RR': 'A/REST RR',
  'A/Rest UPR FRT': 'A/REST UPR FRT', 'A/REST/FRT': 'A/REST FRT',
  'CTR/FRT': 'CTR FRT', 'CTR/RR': 'CTR RR',
  'UPR/FRT': 'UPR FRT', 'UPR/RR': 'UPR RR',
  'UPR F': 'UPR FRT', 'UPR R': 'UPR RR',
  'UPR  FRT': 'UPR FRT', 'UPR  RR': 'UPR RR', 'UPR  4CVT': 'UPR 4CVT',
  'H/INR': 'H/INNER',
};
function norm(v, m) { if (!v) return ''; const s = String(v).trim().replace(/\n/g, ' '); return m[s] || s; }
function safeNum(v) { if (v == null) return null; const n = Number(v); return (!Number.isNaN(n) && isFinite(n)) ? n : null; }
/** 수량용: 정수로 반올림, 부동소수점 오차(-0.x)는 0으로 처리 */
function safeQty(v) { const n = safeNum(v); if (n == null) return 0; const r = Math.round(n); return r === -0 ? 0 : r; }

// ── 통합관리 재고 시트 파서 ──
function parseOverviewSheet(wb) {
  const sheet = wb.Sheets['통합관리 재고'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 헤더는 행2(인덱스2): 차종|부위|칼라|완제품코드|업체|두폭|두께|배율|폭|길이|경주상지|경주표지|울산표지|하지|폼총수량|미처리폼|프라이머|완제품
  const JUNK = new Set(['차종', '합계', '']);
  const items = [];
  let prevVehicle = '', prevPart = '';
  let sortOrder = 0;

  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    // 차종/부위는 병합셀이므로 이전 값 유지
    if (r[0] && !JUNK.has(String(r[0]).trim())) prevVehicle = norm(r[0], VN);
    if (r[1] && !JUNK.has(String(r[1]).trim())) prevPart = norm(r[1], PN);

    const color = r[2] ? String(r[2]).trim() : '';
    if (!color || JUNK.has(color)) continue;

    sortOrder++;
    items.push({
      rowNum: i + 1,
      sort_order: sortOrder,
      vehicle_code: prevVehicle,
      part_code: prevPart,
      color_code: color,
      product_code: r[3] ? String(r[3]).trim() : null,
      supplier: r[4] ? String(r[4]).trim() : null,
      two_width: safeNum(r[5]),
      thickness: safeNum(r[6]),
      ratio: safeNum(r[7]),
      width: safeNum(r[8]),
      length: safeNum(r[9]),
      qty_gj_sangji: safeQty(r[10]),
      qty_gj_pyoji: safeQty(r[11]),
      qty_us_pyoji: safeQty(r[12]),
      qty_haji: safeQty(r[13]),
      qty_foam_total: safeQty(r[14]),
      qty_foam_raw: safeQty(r[15]),
      qty_primer: safeQty(r[16]),
      qty_finished: safeNum(r[17]) != null ? Math.round(Number(r[17])) : 0,
    });
  }
  return items;
}

// ── 목록 조회 ──
router.get('/', async (req, res) => {
  try {
    const { vehicleCode = '', partCode = '', colorCode = '', page = 1, limit = 20 } = req.query;
    const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10)));
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * limitNum;

    let where = "WHERE deleted = 'N'";
    const params = [];
    if (vehicleCode) { where += ' AND vehicle_code = ?'; params.push(vehicleCode); }
    if (partCode) { where += ' AND part_code = ?'; params.push(partCode); }
    if (colorCode) { where += ' AND color_code LIKE ?'; params.push(`%${colorCode}%`); }

    const [rows] = await getPool().query(
      `SELECT * FROM \`${TABLE}\` ${where} ORDER BY sort_order, id LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [[{ total }]] = await getPool().query(
      `SELECT COUNT(*) as total FROM \`${TABLE}\` ${where}`, params
    );
    res.json({ list: rows, total: Number(total), page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('inventory-overview list error', { error: err.message });
    res.status(500).json({ error: '목록 조회에 실패했습니다.' });
  }
});

// ── 엑셀 업로드 ──
router.post('/upload-excel', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const { updatedBy, stockDate } = req.query;
    if (!updatedBy) return res.status(400).json({ error: '등록자 정보가 필요합니다.' });

    const wb = XLSX.read(req.body, { type: 'buffer' });
    const items = parseOverviewSheet(wb);
    if (items.length === 0) return res.status(400).json({ error: '파싱된 데이터가 없습니다.' });

    const pool = getPool();
    const dateVal = stockDate ? String(stockDate).trim().slice(0, 10) : null;

    // 기존 데이터 전체 삭제 후 재입력 (전체 교체 방식)
    await pool.query(`DELETE FROM \`${TABLE}\` WHERE deleted = 'N'`);

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH).map(item => [
        item.vehicle_code, item.part_code, item.color_code,
        item.product_code, item.supplier,
        item.two_width, item.thickness, item.ratio, item.width, item.length,
        item.qty_gj_sangji, item.qty_gj_pyoji, item.qty_us_pyoji, item.qty_haji,
        item.qty_foam_total, item.qty_foam_raw, item.qty_primer, item.qty_finished,
        dateVal, String(updatedBy).trim(), 'N', item.sort_order,
      ]);
      const [result] = await pool.query(
        `INSERT INTO \`${TABLE}\` (vehicle_code, part_code, color_code,
          product_code, supplier, two_width, thickness, ratio, width, \`length\`,
          qty_gj_sangji, qty_gj_pyoji, qty_us_pyoji, qty_haji,
          qty_foam_total, qty_foam_raw, qty_primer, qty_finished,
          stock_date, updated_by, deleted, sort_order) VALUES ?`,
        [batch]
      );
      inserted += result.affectedRows;
    }

    res.json({ inserted, totalRows: items.length });
  } catch (err) {
    logger.error('inventory-overview upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: `업로드에 실패했습니다: ${err.message}` });
  }
});

// ── 개별 수량 수정 ──
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    const allowedFields = [
      'qty_gj_sangji', 'qty_gj_pyoji', 'qty_us_pyoji', 'qty_haji',
      'qty_foam_total', 'qty_foam_raw', 'qty_primer', 'qty_finished',
    ];
    const { field, value, updatedBy } = req.body || {};
    if (!allowedFields.includes(field)) return res.status(400).json({ error: '수정할 수 없는 필드입니다.' });

    const updates = [`\`${field}\` = ?`, 'updated_by = ?'];
    const params = [Number(value) || 0, String(updatedBy || '').trim(), id];

    await getPool().query(
      `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = 'N'`,
      params
    );
    const [rows] = await getPool().query(`SELECT * FROM \`${TABLE}\` WHERE id = ?`, [id]);
    res.json(rows[0] || {});
  } catch (err) {
    logger.error('inventory-overview update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

// ── 엑셀 다운로드 ──
router.get('/export-excel', async (req, res) => {
  try {
    const { vehicleCode = '', partCode = '', colorCode = '' } = req.query;
    let where = "WHERE deleted = 'N'";
    const params = [];
    if (vehicleCode) { where += ' AND vehicle_code = ?'; params.push(vehicleCode); }
    if (partCode) { where += ' AND part_code = ?'; params.push(partCode); }
    if (colorCode) { where += ' AND color_code LIKE ?'; params.push(`%${colorCode}%`); }

    const [rows] = await getPool().query(
      `SELECT * FROM \`${TABLE}\` ${where} ORDER BY sort_order, id`, params
    );

    const headers = [['차종', '부위', '칼라', '완제품코드', '업체', '두폭', '두께', '배율', '폭', '길이', '경주상지(M)', '경주표지(M)', '울산표지(M)', '하지(M)', '폼총수량(M)', '미처리폼(M)', '프라이머(M)', '완제품(EA)', '재고기준일']];
    const data = (rows || []).map(r => []);
    sendXlsx(res, headers, data, '재고현황');
  } catch (err) {
    logger.error('inventory-overview export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

export default router;
