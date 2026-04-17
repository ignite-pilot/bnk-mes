/**
 * 완제품 / 반제품 일자별 재고 관리 API
 * - 마스터(master_finished_products / master_semi_products) 기준으로 행을 구성
 * - 일자별 수량을 stock 테이블에 UPSERT
 *
 * 완제품: finished_product_stock(product_id, stock_date, quantity)
 * 반제품: semi_product_stock(product_id, stock_date, factory, quantity)
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { sendXlsx } from '../lib/excel-export.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

function dateRange(start, end) {
  const out = [];
  const d = new Date(start);
  const last = new Date(end);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ── GET /finished?start=...&end=... ──
router.get('/finished', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: 'start/end 날짜 형식 오류' });
    const pool = getPool();
    const [products] = await pool.query(`
      SELECT id, code, vehicle_code, part_code, color_code, color_name,
             two_width, thickness, ratio, width, \`length\`, memo, safety_stock
      FROM master_finished_products
      WHERE deleted = 'N'
      ORDER BY vehicle_code, part_code, color_code`);

    const [stocks] = await pool.query(
      `SELECT product_id, DATE_FORMAT(stock_date,'%Y-%m-%d') AS stock_date, quantity
       FROM finished_product_stock WHERE stock_date BETWEEN ? AND ?`,
      [start, end]
    );
    const dates = dateRange(start, end);
    const dataMap = {};
    for (const s of stocks) {
      if (!dataMap[s.product_id]) dataMap[s.product_id] = {};
      dataMap[s.product_id][s.stock_date] = Number(s.quantity) || 0;
    }
    const rows = products.map((p) => {
      const qty = dataMap[p.id] || {};
      const row = {
        id: p.id, code: p.code,
        vehicle_code: p.vehicle_code, part_code: p.part_code, color_code: p.color_code,
        two_width: p.two_width, thickness: p.thickness, ratio: p.ratio,
        width: p.width, length: p.length, memo: p.memo,
        _safety: p.safety_stock,
      };
      for (const dt of dates) row[`d_${dt}`] = qty[dt] ?? null;
      return row;
    });
    res.json({ rows, dates, total: rows.length });
  } catch (err) {
    logger.error('product-stock finished get error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '완제품 재고 조회 실패' });
  }
});

// ── POST /finished  body: [{product_id, stock_date, quantity}] ──
router.post('/finished', async (req, res) => {
  try {
    const list = Array.isArray(req.body?.items) ? req.body.items : [];
    if (list.length === 0) return res.json({ updated: 0 });
    const updatedBy = req.body?.updatedBy || null;
    const values = [];
    for (const it of list) {
      if (!it.product_id || !isDate(it.stock_date)) continue;
      values.push([it.product_id, it.stock_date, Number(it.quantity) || 0, updatedBy]);
    }
    if (values.length === 0) return res.json({ updated: 0 });
    await getPool().query(
      `INSERT INTO finished_product_stock (product_id, stock_date, quantity, updated_by)
       VALUES ?
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_by = VALUES(updated_by)`,
      [values]
    );
    res.json({ updated: values.length });
  } catch (err) {
    logger.error('product-stock finished upsert error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '완제품 재고 저장 실패' });
  }
});

// ── GET /semi?start=&end=&factory=gj|us ──
router.get('/semi', async (req, res) => {
  try {
    const { start, end } = req.query;
    const factory = req.query.factory === 'us' ? 'us' : 'gj';
    if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: 'start/end 날짜 형식 오류' });
    const pool = getPool();
    const [products] = await pool.query(`
      SELECT id, semi_type, vehicle_code, part_code, color_code, color_name,
             thickness, width, ratio, safety_stock
      FROM master_semi_products
      WHERE deleted = 'N'
      ORDER BY semi_type, vehicle_code, part_code, color_code`);
    const [stocks] = await pool.query(
      `SELECT product_id, DATE_FORMAT(stock_date,'%Y-%m-%d') AS stock_date, quantity
       FROM semi_product_stock
       WHERE stock_date BETWEEN ? AND ? AND factory = ?`,
      [start, end, factory]
    );
    const dates = dateRange(start, end);
    const dataMap = {};
    for (const s of stocks) {
      if (!dataMap[s.product_id]) dataMap[s.product_id] = {};
      dataMap[s.product_id][s.stock_date] = Number(s.quantity) || 0;
    }
    const rows = products.map((p) => {
      const qty = dataMap[p.id] || {};
      const row = {
        id: p.id, semi_type: p.semi_type,
        vehicle_code: p.vehicle_code, part_code: p.part_code, color_code: p.color_code,
        thickness: p.thickness, width: p.width, ratio: p.ratio,
        _safety: p.safety_stock,
      };
      for (const dt of dates) row[`d_${dt}`] = qty[dt] ?? null;
      return row;
    });
    res.json({ rows, dates, factory, total: rows.length });
  } catch (err) {
    logger.error('product-stock semi get error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '반제품 재고 조회 실패' });
  }
});

// ── POST /semi  body: { factory, items:[{product_id,stock_date,quantity}] } ──
router.post('/semi', async (req, res) => {
  try {
    const factory = req.body?.factory === 'us' ? 'us' : 'gj';
    const list = Array.isArray(req.body?.items) ? req.body.items : [];
    const updatedBy = req.body?.updatedBy || null;
    if (list.length === 0) return res.json({ updated: 0 });
    const values = [];
    for (const it of list) {
      if (!it.product_id || !isDate(it.stock_date)) continue;
      values.push([it.product_id, it.stock_date, factory, Number(it.quantity) || 0, updatedBy]);
    }
    if (values.length === 0) return res.json({ updated: 0 });
    await getPool().query(
      `INSERT INTO semi_product_stock (product_id, stock_date, factory, quantity, updated_by)
       VALUES ?
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_by = VALUES(updated_by)`,
      [values]
    );
    res.json({ updated: values.length });
  } catch (err) {
    logger.error('product-stock semi upsert error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '반제품 재고 저장 실패' });
  }
});

// ── GET /semi/template ──
router.get('/semi/template', async (req, res) => {
  try {
    const pool = getPool();
    const [products] = await pool.query(`
      SELECT semi_type, vehicle_code, part_code, color_code
      FROM master_semi_products
      WHERE deleted = 'N'
      ORDER BY semi_type, vehicle_code, part_code, color_code`);

    const today = new Date().toISOString().slice(0, 10);
    const data = [
      ['날짜', today, '※ 형식: YYYY-MM-DD  |  경주 수량·울산 수량은 숫자만 입력'],
      ['종류', '차종', '적용부', '칼라', '경주 수량', '울산 수량'],
      ...products.map((p) => [p.semi_type, p.vehicle_code, p.part_code, p.color_code, '', '']),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, '반제품재고');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const { buildXlsxFilename } = await import('../lib/excel-export.js');
    const filename = encodeURIComponent(buildXlsxFilename('반제품 재고 업로드 템플릿'));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.send(buf);
  } catch (err) {
    logger.error('product-stock semi template error', { error: err.message });
    res.status(500).json({ error: '템플릿 다운로드 실패' });
  }
});

// ── POST /semi/upload ──
router.post('/semi/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일 없음' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // 1행: ['날짜', <날짜값>]
    const rawDateHeader = data[0]?.[1];
    let stockDate = '';
    if (rawDateHeader instanceof Date) {
      stockDate = rawDateHeader.toISOString().slice(0, 10);
    } else {
      stockDate = String(rawDateHeader || '').trim();
    }
    if (!isDate(stockDate)) return res.status(400).json({ error: '1행에 날짜(YYYY-MM-DD)를 입력하세요' });

    const pool = getPool();
    const [products] = await pool.query(
      'SELECT id, semi_type, vehicle_code, part_code, color_code FROM master_semi_products WHERE deleted = \'N\''
    );
    const nk = (v) => String(v || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const lookup = new Map();
    for (const p of products) {
      lookup.set(`${nk(p.semi_type)}|${nk(p.vehicle_code)}|${nk(p.part_code)}|${nk(p.color_code)}`, p.id);
    }

    const updatedBy = req.body?.updatedBy || null;
    const values = [];
    const skippedKeys = [];
    // 2행=헤더, 3행~=데이터  컬럼: 종류|차종|적용부|칼라|경주수량|울산수량
    for (let i = 2; i < data.length; i++) {
      const [semiType, vehicleCode, partCode, colorCode, gjQty, usQty] = data[i];
      if (!vehicleCode && !partCode) continue;
      const key = `${nk(semiType)}|${nk(vehicleCode)}|${nk(partCode)}|${nk(colorCode)}`;
      const productId = lookup.get(key);
      if (!productId) { skippedKeys.push(key); continue; }

      if (gjQty !== '' && gjQty != null) values.push([productId, stockDate, 'gj', Number(gjQty) || 0, updatedBy]);
      if (usQty !== '' && usQty != null) values.push([productId, stockDate, 'us', Number(usQty) || 0, updatedBy]);
    }

    if (values.length === 0) return res.json({ updated: 0, skipped: data.length - 2, skippedKeys });

    await pool.query(
      `INSERT INTO semi_product_stock (product_id, stock_date, factory, quantity, updated_by)
       VALUES ?
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_by = VALUES(updated_by)`,
      [values]
    );
    res.json({ updated: values.length, skipped: data.length - 2 - values.length, skippedKeys });
  } catch (err) {
    logger.error('product-stock semi upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '엑셀 업로드 실패' });
  }
});

// ── GET /finished/template ──
router.get('/finished/template', async (req, res) => {
  try {
    const pool = getPool();
    const [products] = await pool.query(`
      SELECT vehicle_code, part_code, color_code
      FROM master_finished_products
      WHERE deleted = 'N'
      ORDER BY vehicle_code, part_code, color_code`);

    const today = new Date().toISOString().slice(0, 10);
    const data = [
      ['날짜', today, '※ 형식: YYYY-MM-DD (예: 2026-04-17)'],
      ['차종', '적용부', '칼라', '수량'],
      ...products.map((p) => [p.vehicle_code, p.part_code, p.color_code, '']),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 35 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, '완제품재고');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const { buildXlsxFilename } = await import('../lib/excel-export.js');
    const filename = encodeURIComponent(buildXlsxFilename('완제품 재고 업로드 템플릿'));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.send(buf);
  } catch (err) {
    logger.error('product-stock finished template error', { error: err.message });
    res.status(500).json({ error: '템플릿 다운로드 실패' });
  }
});

// ── POST /finished/upload ──
router.post('/finished/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일 없음' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // 1행: ['날짜', <날짜값>]
    const rawDateHeader = data[0]?.[1];
    let stockDate = '';
    if (rawDateHeader instanceof Date) {
      stockDate = rawDateHeader.toISOString().slice(0, 10);
    } else {
      stockDate = String(rawDateHeader || '').trim();
    }
    if (!isDate(stockDate)) return res.status(400).json({ error: '1행에 날짜(YYYY-MM-DD)를 입력하세요' });

    const pool = getPool();
    const [products] = await pool.query(
      'SELECT id, vehicle_code, part_code, color_code FROM master_finished_products WHERE deleted = \'N\''
    );
    const nk = (v) => String(v || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const lookup = new Map();
    for (const p of products) {
      lookup.set(`${nk(p.vehicle_code)}|${nk(p.part_code)}|${nk(p.color_code)}`, p.id);
    }

    const updatedBy = req.body?.updatedBy || null;
    const values = [];
    const skippedKeys = [];
    // 2행=헤더, 3행~=데이터
    for (let i = 2; i < data.length; i++) {
      const [vehicleCode, partCode, colorCode, rawQty] = data[i];
      if (!vehicleCode && !partCode) continue;
      const key = `${nk(vehicleCode)}|${nk(partCode)}|${nk(colorCode)}`;
      const productId = lookup.get(key);
      if (!productId) { skippedKeys.push(key); continue; }
      if (rawQty === '' || rawQty == null) continue;

      const quantity = Number(rawQty) || 0;
      values.push([productId, stockDate, quantity, updatedBy]);
    }

    if (values.length === 0) return res.json({ updated: 0, skipped: data.length - 2, skippedKeys });

    await pool.query(
      `INSERT INTO finished_product_stock (product_id, stock_date, quantity, updated_by)
       VALUES ?
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_by = VALUES(updated_by)`,
      [values]
    );
    res.json({ updated: values.length, skipped: data.length - 2 - values.length, skippedKeys });
  } catch (err) {
    logger.error('product-stock finished upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '엑셀 업로드 실패' });
  }
});

export default router;
