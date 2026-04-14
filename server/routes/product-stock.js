/**
 * 완제품 / 반제품 일자별 재고 관리 API
 * - 마스터(master_finished_products / master_semi_products) 기준으로 행을 구성
 * - 일자별 수량을 stock 테이블에 UPSERT
 *
 * 완제품: finished_product_stock(product_id, stock_date, quantity)
 * 반제품: semi_product_stock(product_id, stock_date, factory, quantity)
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();

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

export default router;
