/**
 * 재고 현황 매트릭스 API
 * - /raw       원자재: rows=raw_materials, cols=업체창고(동적) + BNK 경주/울산
 * - /semi      반제품: rows=master_semi_products, cols=경주/울산
 * - /finished  완제품: rows=master_finished_products, cols=울산 + 납품처(동적)
 *
 * 수량 소스
 * - 업체 창고 재고: stock_snapshots(type=supplier) + stock_snapshot_lines (raw_material_id 기준)
 * - BNK 공장 재고: daily_inventory (process_type prefix gj_/us_ 기준, 복합키 매칭)
 * - 납품처 재고: 현재 별도 테이블 없음 → 0 으로 반환 (추후 확장)
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();

const norm = (v) => (v == null ? '' : String(v).trim().toUpperCase());
const normNum = (v) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v).trim() : String(n);
};
const keyOf = (r) => [
  norm(r.vehicle_code),
  norm(r.part_code),
  norm(r.color_code),
  normNum(r.thickness),
  normNum(r.width),
].join('|');

// ── 최신 스냅샷 라인 집계 (업체 창고별) ──
async function fetchSupplierStock(pool) {
  const [rows] = await pool.query(`
    SELECT ss.supplier_warehouse_id AS wh_id,
           sl.raw_material_id        AS rm_id,
           sl.quantity               AS qty
    FROM stock_snapshots ss
    INNER JOIN (
      SELECT supplier_warehouse_id, MAX(stock_date) AS max_date
      FROM stock_snapshots
      WHERE snapshot_type = 'supplier' AND deleted = 'N'
      GROUP BY supplier_warehouse_id
    ) latest
      ON latest.supplier_warehouse_id = ss.supplier_warehouse_id
     AND latest.max_date              = ss.stock_date
    INNER JOIN stock_snapshot_lines sl ON sl.snapshot_id = ss.id
    WHERE ss.snapshot_type = 'supplier' AND ss.deleted = 'N'
  `);
  const map = {}; // { [whId]: { [rmId]: qty } }
  for (const r of rows) {
    if (!map[r.wh_id]) map[r.wh_id] = {};
    map[r.wh_id][r.rm_id] = Number(r.qty) || 0;
  }
  return map;
}

// ── 최신 daily_inventory 집계 (복합키 × factory) ──
async function fetchFactoryStock(pool, processFilter) {
  const filter = processFilter
    ? `AND d.process_type IN (${processFilter.map(() => '?').join(',')})`
    : '';
  const params = processFilter || [];
  const [rows] = await pool.query(
    `SELECT d.process_type, d.vehicle_code, d.part_code, d.color_code,
            d.thickness, d.width, d.quantity
     FROM daily_inventory d
     INNER JOIN (
       SELECT process_type, vehicle_code, part_code, color_code, thickness, width,
              MAX(stock_date) AS max_date
       FROM daily_inventory
       GROUP BY process_type, vehicle_code, part_code, color_code, thickness, width
     ) latest
       ON latest.process_type  = d.process_type
      AND latest.vehicle_code  = d.vehicle_code
      AND latest.part_code     = d.part_code
      AND latest.color_code    = d.color_code
      AND COALESCE(latest.thickness,'') = COALESCE(d.thickness,'')
      AND COALESCE(latest.width,'')     = COALESCE(d.width,'')
      AND latest.max_date       = d.stock_date
     WHERE d.vehicle_code <> '_BULK' ${filter}`,
    params
  );
  // key -> { gj: qty, us: qty }
  const map = {};
  for (const r of rows) {
    const k = keyOf(r);
    if (!map[k]) map[k] = { gj: 0, us: 0 };
    const factory = r.process_type.startsWith('us_') ? 'us' : 'gj';
    map[k][factory] += Number(r.quantity) || 0;
  }
  return map;
}

// ── GET /raw ──
router.get('/raw', async (_req, res) => {
  try {
    const pool = getPool();
    const [warehouses] = await pool.query(`
      SELECT sw.id, sw.name AS warehouse_name, s.name AS supplier_name
      FROM supplier_warehouses sw
      JOIN raw_material_suppliers s ON s.id = sw.supplier_id AND s.deleted = 'N'
      WHERE sw.deleted = 'N'
      ORDER BY s.name, sw.name`);

    const [materials] = await pool.query(`
      SELECT rm.id, rm.kind_id, mt.name AS kind_name, rm.name AS material_name,
             rm.vehicle_code, rm.part_code, rm.color_code, rm.color,
             rm.thickness, rm.width, rm.supplier_safety_stock
      FROM raw_materials rm
      LEFT JOIN material_types mt ON mt.id = rm.kind_id
      WHERE rm.deleted = 'N'
      ORDER BY mt.sort_order, rm.vehicle_code, rm.part_code, rm.color_code`);

    const supplierStock = await fetchSupplierStock(pool);
    const factoryStock = await fetchFactoryStock(pool);

    const rows = materials.map((m) => {
      const k = keyOf(m);
      const fs = factoryStock[k] || { gj: 0, us: 0 };
      const supplier_qty = {};
      for (const w of warehouses) {
        supplier_qty[w.id] = supplierStock[w.id]?.[m.id] || 0;
      }
      return {
        id: m.id,
        kind_name: m.kind_name,
        material_name: m.material_name,
        vehicle_code: m.vehicle_code,
        part_code: m.part_code,
        color_code: m.color_code,
        thickness: m.thickness,
        width: m.width,
        safety_stock: m.supplier_safety_stock,
        supplier_qty,
        gj_qty: fs.gj,
        us_qty: fs.us,
      };
    });

    res.json({
      warehouses: warehouses.map((w) => ({
        id: w.id,
        supplier_name: w.supplier_name,
        warehouse_name: w.warehouse_name,
      })),
      rows,
      total: rows.length,
    });
  } catch (err) {
    logger.error('inventory-matrix raw error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '원자재 재고 현황 조회에 실패했습니다.' });
  }
});

// ── 최신 product-stock 집계 (product_id × factory) ──
async function fetchLatestSemiStock(pool) {
  const [rows] = await pool.query(`
    SELECT s.product_id, s.factory, s.quantity
    FROM semi_product_stock s
    INNER JOIN (
      SELECT product_id, factory, MAX(stock_date) AS max_date
      FROM semi_product_stock GROUP BY product_id, factory
    ) latest
      ON latest.product_id = s.product_id
     AND latest.factory    = s.factory
     AND latest.max_date   = s.stock_date`);
  const map = {}; // { [product_id]: { gj, us } }
  for (const r of rows) {
    if (!map[r.product_id]) map[r.product_id] = { gj: 0, us: 0 };
    map[r.product_id][r.factory] = Number(r.quantity) || 0;
  }
  return map;
}

async function fetchLatestFinishedStock(pool) {
  const [rows] = await pool.query(`
    SELECT f.product_id, f.quantity
    FROM finished_product_stock f
    INNER JOIN (
      SELECT product_id, MAX(stock_date) AS max_date
      FROM finished_product_stock GROUP BY product_id
    ) latest
      ON latest.product_id = f.product_id
     AND latest.max_date   = f.stock_date`);
  const map = {};
  for (const r of rows) map[r.product_id] = Number(r.quantity) || 0;
  return map;
}

// ── GET /semi ──
router.get('/semi', async (_req, res) => {
  try {
    const pool = getPool();
    const [products] = await pool.query(`
      SELECT id, semi_type, vehicle_code, part_code, color_code, color_name,
             thickness, width, ratio, safety_stock, production_time
      FROM master_semi_products
      WHERE deleted = 'N'
      ORDER BY semi_type, vehicle_code, part_code, color_code`);

    const stockMap = await fetchLatestSemiStock(pool);

    const rows = products.map((p) => {
      const fs = stockMap[p.id] || { gj: 0, us: 0 };
      return {
        id: p.id,
        semi_type: p.semi_type,
        vehicle_code: p.vehicle_code,
        part_code: p.part_code,
        color_code: p.color_code,
        color_name: p.color_name,
        thickness: p.thickness,
        width: p.width,
        ratio: p.ratio,
        safety_stock: p.safety_stock,
        production_time: p.production_time,
        gj_qty: fs.gj,
        us_qty: fs.us,
      };
    });

    res.json({ rows, total: rows.length });
  } catch (err) {
    logger.error('inventory-matrix semi error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '반제품 재고 현황 조회에 실패했습니다.' });
  }
});

// ── GET /finished ──
router.get('/finished', async (_req, res) => {
  try {
    const pool = getPool();
    const [affiliates] = await pool.query(
      "SELECT id, name FROM delivery_affiliates WHERE deleted='N' ORDER BY name"
    );
    const [products] = await pool.query(`
      SELECT id, code, vehicle_code, part_code, color_code, color_name,
             two_width, thickness, ratio, width, \`length\`, memo,
             safety_stock, production_time, supplier
      FROM master_finished_products
      WHERE deleted = 'N'
      ORDER BY vehicle_code, part_code, color_code`);

    const finishedStockMap = await fetchLatestFinishedStock(pool);

    const rows = products.map((p) => {
      const us_qty = finishedStockMap[p.id] || 0;
      const affiliate_qty = {};
      for (const a of affiliates) affiliate_qty[a.id] = 0;
      return {
        id: p.id,
        code: p.code,
        vehicle_code: p.vehicle_code,
        part_code: p.part_code,
        color_code: p.color_code,
        color_name: p.color_name,
        two_width: p.two_width,
        thickness: p.thickness,
        ratio: p.ratio,
        width: p.width,
        length: p.length,
        memo: p.memo,
        safety_stock: p.safety_stock,
        production_time: p.production_time,
        us_qty,
        affiliate_qty,
      };
    });

    res.json({
      affiliates: affiliates.map((a) => ({ id: a.id, name: a.name })),
      rows,
      total: rows.length,
    });
  } catch (err) {
    logger.error('inventory-matrix finished error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '완제품 재고 현황 조회에 실패했습니다.' });
  }
});

export default router;
