/**
 * 일별 재고 관리 API
 * - 공장별 공정 탭 (경주 6개, 울산 5개)
 * - 제품 키: 차종+적용부+칼라+완제품코드+두폭+두께+배율+폭+길이
 * - 기간별 조회: 가로축 날짜, 세로축 제품
 * - 셀 직접 입력 (UPSERT)
 * - 재고 현황용 최신값 조회
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { getAllCodeMaps } from '../lib/config-codes.js';

const router = Router();
const TABLE = 'daily_inventory';

const PROCESS_TYPES = {
  // 경주 공장 — 원자재
  gj_sangji:      { label: '상지',            factory: 'gj', category: '원자재', unit: 'M' },
  gj_foam:        { label: '폼',              factory: 'gj', category: '원자재', unit: 'M' },
  gj_primer:      { label: '프라이머',         factory: 'gj', category: '원자재', unit: 'M' },
  // 경주 공장 — 반제품
  gj_pyoji:       { label: '표지',            factory: 'gj', category: '반제품', unit: 'M' },
  gj_foam_primer: { label: '폼 프라이머',      factory: 'gj', category: '반제품', unit: 'M' },
  // 울산 공장 — 원자재
  us_haji:        { label: '하지',            factory: 'us', category: '반제품', unit: 'M' },
  us_foam_raw:    { label: '미처리 폼',        factory: 'us', category: '원자재', unit: 'M' },
  // 울산 공장 — 반제품
  us_pyoji:       { label: '표지',            factory: 'us', category: '반제품', unit: 'M' },
  us_foam_primer: { label: '폼 프라이머',      factory: 'us', category: '반제품', unit: 'M' },
  // 울산 공장 — 완제품
  us_finished:    { label: '완제품',           factory: 'us', category: '완제품', unit: 'EA' },
};

const SPEC_COLS = 'product_code, two_width, thickness, ratio, width, `length`, memo';
const SPEC_KEYS = ['product_code', 'two_width', 'thickness', 'ratio', 'width', 'length', 'memo'];

function makeKey(r) {
  return [r.vehicle_code, r.part_code, r.color_code, ...SPEC_KEYS.map(k => r[k] || '')].join('|');
}

function specParams(obj) {
  return SPEC_KEYS.map(k => obj[k] || null);
}

// ── 공정 타입 목록 ──
router.get('/process-types', (req, res) => {
  const { factory } = req.query;
  let entries = Object.entries(PROCESS_TYPES);
  if (factory) entries = entries.filter(([, v]) => v.factory === factory);
  const list = entries.map(([key, v]) => ({ key, ...v }));
  res.json({ list });
});

// ── 공정별 일별 재고 조회 ──
router.get('/', async (req, res) => {
  try {
    const { processType, startDate, endDate } = req.query;
    if (!processType || !PROCESS_TYPES[processType]) {
      return res.status(400).json({ error: '공정 타입을 선택해 주세요.' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '조회 기간을 입력해 주세요.' });
    }

    const pool = getPool();

    // 1. 해당 공정에 등록된 제품 목록
    const [products] = await pool.query(
      `SELECT DISTINCT vehicle_code, part_code, color_code, ${SPEC_COLS}
       FROM \`${TABLE}\`
       WHERE process_type = ?
       ORDER BY vehicle_code, part_code, color_code`,
      [processType]
    );

    // 2. 기간 내 일별 데이터
    const [rows] = await pool.query(
      `SELECT vehicle_code, part_code, color_code, ${SPEC_COLS}, stock_date, quantity
       FROM \`${TABLE}\`
       WHERE process_type = ? AND stock_date >= ? AND stock_date <= ?
       ORDER BY stock_date`,
      [processType, startDate, endDate]
    );

    // 3. 각 제품의 현재고 (가장 최근 날짜의 값)
    const [latestRows] = await pool.query(
      `SELECT d.vehicle_code, d.part_code, d.color_code, ${SPEC_KEYS.map(k => 'd.' + (k === 'length' ? '`length`' : k)).join(', ')}, d.quantity, d.stock_date
       FROM \`${TABLE}\` d
       INNER JOIN (
         SELECT process_type, vehicle_code, part_code, color_code, ${SPEC_COLS}, MAX(stock_date) AS max_date
         FROM \`${TABLE}\`
         WHERE process_type = ?
         GROUP BY process_type, vehicle_code, part_code, color_code, ${SPEC_COLS}
       ) latest ON d.process_type = latest.process_type
         AND d.vehicle_code = latest.vehicle_code
         AND d.part_code = latest.part_code
         AND d.color_code = latest.color_code
         AND COALESCE(d.product_code,'') = COALESCE(latest.product_code,'')
         AND COALESCE(d.two_width,'') = COALESCE(latest.two_width,'')
         AND COALESCE(d.thickness,'') = COALESCE(latest.thickness,'')
         AND COALESCE(d.ratio,'') = COALESCE(latest.ratio,'')
         AND COALESCE(d.width,'') = COALESCE(latest.width,'')
         AND COALESCE(d.\`length\`,'') = COALESCE(latest.\`length\`,'')
         AND COALESCE(d.memo,'') = COALESCE(latest.memo,'')
         AND d.stock_date = latest.max_date
       WHERE d.process_type = ?`,
      [processType, processType]
    );

    // 날짜 목록 생성
    const dates = [];
    const d = new Date(startDate);
    const end = new Date(endDate);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    // 데이터 매핑
    const dataMap = {};
    for (const r of rows) {
      const key = makeKey(r);
      if (!dataMap[key]) dataMap[key] = {};
      dataMap[key][new Date(r.stock_date).toISOString().slice(0, 10)] = r.quantity;
    }

    const latestMap = {};
    for (const r of latestRows) {
      const key = makeKey(r);
      latestMap[key] = { quantity: r.quantity, date: new Date(r.stock_date).toISOString().slice(0, 10) };
    }

    res.json({ products, dates, dataMap, latestMap, processType });
  } catch (err) {
    logger.error('daily-inventory list error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

// ── 셀 입력/수정 (UPSERT) ──
router.post('/upsert', async (req, res) => {
  try {
    const { processType, vehicleCode, partCode, colorCode, stockDate, quantity, updatedBy, ...specs } = req.body || {};
    if (!processType || !PROCESS_TYPES[processType]) return res.status(400).json({ error: '공정 타입이 필요합니다.' });
    if (!vehicleCode || !partCode || !colorCode) return res.status(400).json({ error: '차종/적용부/칼라가 필요합니다.' });
    if (!stockDate) return res.status(400).json({ error: '날짜가 필요합니다.' });

    await getPool().query(
      `INSERT INTO \`${TABLE}\` (process_type, vehicle_code, part_code, color_code, ${SPEC_COLS}, stock_date, quantity, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_by = VALUES(updated_by)`,
      [processType, vehicleCode, partCode, colorCode,
       specs.productCode || null, specs.twoWidth || null, specs.thickness || null, specs.ratio || null, specs.width || null, specs.length || null, specs.memo || null,
       stockDate, Number(quantity) || 0, String(updatedBy || '').trim()]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('daily-inventory upsert error', { error: err.message });
    res.status(500).json({ error: '저장에 실패했습니다.' });
  }
});

// ── 일괄 입력 (여러 셀 한번에) ──
router.post('/bulk-upsert', async (req, res) => {
  try {
    const { items = [], updatedBy } = req.body || {};
    if (!items.length) return res.status(400).json({ error: '입력할 데이터가 없습니다.' });

    const pool = getPool();
    let saved = 0;
    for (const item of items) {
      const { processType, vehicleCode, partCode, colorCode, stockDate, quantity } = item;
      if (!processType || !vehicleCode || !partCode || !colorCode || !stockDate) continue;
      await pool.query(
        `INSERT INTO \`${TABLE}\` (process_type, vehicle_code, part_code, color_code, ${SPEC_COLS}, stock_date, quantity, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_by = VALUES(updated_by)`,
        [processType, vehicleCode, partCode, colorCode,
         item.productCode || null, item.twoWidth || null, item.thickness || null, item.ratio || null, item.width || null, item.length || null, item.memo || null,
         stockDate, Number(quantity) || 0, String(updatedBy || '').trim()]
      );
      saved++;
    }
    res.json({ saved });
  } catch (err) {
    logger.error('daily-inventory bulk-upsert error', { error: err.message });
    res.status(500).json({ error: '저장에 실패했습니다.' });
  }
});

// ── 제품 추가 (새 행) ──
router.post('/add-product', async (req, res) => {
  try {
    const { processType, vehicleCode, partCode, colorCode, updatedBy, ...specs } = req.body || {};
    if (!processType || !PROCESS_TYPES[processType]) return res.status(400).json({ error: '공정 타입이 필요합니다.' });
    if (!vehicleCode || !partCode || !colorCode) return res.status(400).json({ error: '차종/적용부/칼라를 모두 입력해 주세요.' });

    // config manager 코드 검증
    const { vehicleMap, partMap, colorMap } = await getAllCodeMaps();
    const errors = [];
    if (!vehicleMap[vehicleCode]) errors.push(`차종 "${vehicleCode}"`);
    if (!partMap[partCode]) errors.push(`적용부 "${partCode}"`);
    if (!colorMap[colorCode]) errors.push(`칼라 "${colorCode}"`);
    if (errors.length > 0) return res.status(400).json({ error: `config manager에 등록되지 않은 코드: ${errors.join(', ')}` });

    const today = new Date().toISOString().slice(0, 10);
    await getPool().query(
      `INSERT INTO \`${TABLE}\` (process_type, vehicle_code, part_code, color_code, ${SPEC_COLS}, stock_date, quantity, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by)`,
      [processType, vehicleCode, partCode, colorCode,
       specs.productCode || null, specs.twoWidth || null, specs.thickness || null, specs.ratio || null, specs.width || null, specs.length || null, specs.memo || null,
       today, String(updatedBy || '').trim()]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('daily-inventory add-product error', { error: err.message });
    res.status(500).json({ error: '추가에 실패했습니다.' });
  }
});

// ── 재고 현황용: 모든 공정의 최신 재고 ──
router.get('/overview', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT d.process_type, d.vehicle_code, d.part_code, d.color_code,
              ${SPEC_KEYS.map(k => 'd.' + (k === 'length' ? '`length`' : k)).join(', ')}, d.quantity, d.stock_date
       FROM \`${TABLE}\` d
       INNER JOIN (
         SELECT process_type, vehicle_code, part_code, color_code, ${SPEC_COLS}, MAX(stock_date) AS max_date
         FROM \`${TABLE}\`
         GROUP BY process_type, vehicle_code, part_code, color_code, ${SPEC_COLS}
       ) latest ON d.process_type = latest.process_type
         AND d.vehicle_code = latest.vehicle_code
         AND d.part_code = latest.part_code
         AND d.color_code = latest.color_code
         AND COALESCE(d.product_code,'') = COALESCE(latest.product_code,'')
         AND COALESCE(d.two_width,'') = COALESCE(latest.two_width,'')
         AND COALESCE(d.thickness,'') = COALESCE(latest.thickness,'')
         AND COALESCE(d.ratio,'') = COALESCE(latest.ratio,'')
         AND COALESCE(d.width,'') = COALESCE(latest.width,'')
         AND COALESCE(d.\`length\`,'') = COALESCE(latest.\`length\`,'')
         AND COALESCE(d.memo,'') = COALESCE(latest.memo,'')
         AND d.stock_date = latest.max_date`
    );

    // 제품별로 공정 수량 합치기
    const OVERVIEW_FIELDS = {};
    for (const [key] of Object.entries(PROCESS_TYPES)) {
      OVERVIEW_FIELDS[key] = `qty_${key}`;
    }

    const map = {};
    for (const r of rows) {
      const key = makeKey(r);
      if (!map[key]) {
        map[key] = {
          vehicle_code: r.vehicle_code, part_code: r.part_code, color_code: r.color_code,
          product_code: r.product_code, two_width: r.two_width, thickness: r.thickness,
          ratio: r.ratio, width: r.width, length: r.length, memo: r.memo,
        };
        for (const f of Object.values(OVERVIEW_FIELDS)) {
          map[key][f] = 0;
        }
      }
      const f = OVERVIEW_FIELDS[r.process_type];
      if (f) map[key][f] = r.quantity;
    }

    // _BULK 항목은 별도 분리
    const allItems = Object.values(map);
    const bulkItem = allItems.find(r => r.vehicle_code === '_BULK');
    const bulk = {};
    if (bulkItem) {
      for (const [pt, field] of Object.entries(OVERVIEW_FIELDS)) {
        if (bulkItem[field]) bulk[pt] = { qty: bulkItem[field], label: PROCESS_TYPES[pt]?.label || pt };
      }
    }

    const list = allItems
      .filter(r => r.vehicle_code !== '_BULK')
      .sort((a, b) =>
        a.vehicle_code.localeCompare(b.vehicle_code) ||
        a.part_code.localeCompare(b.part_code) ||
        a.color_code.localeCompare(b.color_code)
      );

    // 마스터에서 안전재고 조회
    const [fpSS] = await pool.query(
      "SELECT vehicle_code, part_code, color_code, two_width, thickness, ratio, width, `length`, memo, safety_stock FROM master_finished_products WHERE deleted='N' AND safety_stock IS NOT NULL AND safety_stock > 0"
    );
    const ssMap = {};
    for (const r of fpSS) {
      ssMap[makeKey(r)] = r.safety_stock;
    }
    // 안전재고 매핑
    for (const row of list) {
      const key = makeKey(row);
      row.safety_stock = ssMap[key] || null;
    }

    res.json({ list, total: list.length, bulk });
  } catch (err) {
    logger.error('daily-inventory overview error', { error: err.message });
    res.status(500).json({ error: '재고 현황 조회에 실패했습니다.' });
  }
});

// ── 안전재고 조회 (마스터 기반) ──
router.get('/safety-stock', async (req, res) => {
  try {
    const pool = getPool();
    // 완제품 마스터 안전재고
    const [fp] = await pool.query(
      "SELECT vehicle_code, part_code, color_code, two_width, thickness, ratio, width, `length`, memo, safety_stock FROM master_finished_products WHERE deleted='N' AND safety_stock IS NOT NULL AND safety_stock > 0"
    );
    // 반제품 마스터 안전재고
    const [sp] = await pool.query(
      "SELECT vehicle_code, part_code, color_code, safety_stock FROM master_semi_products WHERE deleted='N' AND safety_stock IS NOT NULL AND safety_stock > 0"
    );
    // 원자재 마스터 안전재고
    const [rm] = await pool.query(
      "SELECT vehicle_code, part_code, color_code, supplier_safety_stock, bnk_warehouse_safety_stock FROM raw_materials WHERE deleted='N' AND (supplier_safety_stock > 0 OR bnk_warehouse_safety_stock > 0)"
    );

    const map = {};
    for (const r of fp) {
      const key = makeKey(r);
      map[key] = { finished: r.safety_stock };
    }
    for (const r of sp) {
      const key = `${r.vehicle_code}|${r.part_code}|${r.color_code}||||||`;
      if (!map[key]) map[key] = {};
      map[key].semi = r.safety_stock;
    }
    for (const r of rm) {
      const key = `${r.vehicle_code}|${r.part_code}|${r.color_code}||||||`;
      if (!map[key]) map[key] = {};
      map[key].supplier = r.supplier_safety_stock;
      map[key].bnk = r.bnk_warehouse_safety_stock;
    }

    res.json({ map });
  } catch (err) {
    logger.error('safety-stock get error', { error: err.message });
    res.status(500).json({ error: '안전재고 조회 실패' });
  }
});

export default router;
