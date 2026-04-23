/**
 * 월별 TPO 상세 (경주물류창고)
 * - 1~3월 포맷 기준 고정 파싱
 *   A~E: 차종/업체/품번/규격/자재코드
 *   F~J: 전월말재고 / 월판매 / 월생산입고 / 입고누계 / 현재고
 *   K:   공백
 *   L~BR: 주차별 [일자 order/ship 쌍들] + 주차 합계(주문/출고/미출고)
 *   BS~BU: 월 출고합계 / 월 주문합계 / 월 미출고합계
 *   BV~BX: (공백 또는 소계)
 *   BY: 잔량  /  BZ: 월말예상재고
 *   CA~CO: 전월 주별 입고실적 (5주 × [계획/실적/달성율])
 *   CP~CT: 당월 1~5주 입고실적 / CU: 합계
 *   CV~CZ: 입고실적 섹션 [월말재고/현재고/공백/잔량]
 * - 업로드 시 해당 year_month 데이터 전체 교체 (DELETE + INSERT, FK CASCADE)
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function parseInt32(v) {
  if (v == null || v === '' || v === '   ') return null;
  const s = String(v).replace(/[,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function parseDecimal(v) {
  if (v == null || v === '' || v === '   ') return null;
  const s = String(v).replace(/[,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
function excelSerialToDate(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function ymRegex(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// 고정 메타 컬럼 인덱스 (1~3월 기준)
const COL = {
  vehicle: 0, supplier: 1, part_no: 2, spec: 3, material_code: 4,
  prev_stock: 5, month_sales: 6, month_in_qty: 7, cumulative_in: 8, current_stock: 9,
  // 일자/주차 영역은 L(11)부터 동적 스캔
  dayStart: 11,
  // 월 합계 (row4 라벨로 찾음)
  month_ship_total: null, month_order_total: null, month_unship_total: null,
  remaining: null, forecast_end_stock: null,
  // 입고실적 섹션
  perfStart: null, // CA
  inboundStart: null, // CP
  inboundTotal: null, // CU
  month_end_stock_ib: null, // CW
  current_stock_ib: null, // CX
  remaining_ib: null, // CZ
};

// ── 업로드된 월 목록 ──
router.get('/months', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT \`year_month\`, COUNT(*) AS cnt,
              DATE_FORMAT(MAX(uploaded_at), '%Y-%m-%d %H:%i:%s') AS uploaded_at,
              MAX(uploaded_by) AS uploaded_by
       FROM tpo_monthly_header
       GROUP BY \`year_month\`
       ORDER BY \`year_month\` DESC`,
    );
    res.json({ months: rows });
  } catch (err) {
    logger.error('tpo-detail months error', { error: err.message });
    res.status(500).json({ error: '조회 실패: ' + err.message });
  }
});

// ── 월별 상세 조회 ──
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    let ym = ymRegex(req.query.ym);
    if (!ym) {
      const [latest] = await pool.query(`SELECT MAX(\`year_month\`) AS ym FROM tpo_monthly_header`);
      ym = latest[0]?.ym || null;
    }
    if (!ym) return res.json({ ym: null, headers: [], dailyByHeader: {}, weeklyByHeader: {}, perfByHeader: {}, inboundByHeader: {}, dateList: [], weekList: [], perfWeekList: [], inboundWeekList: [], meta: null });

    const [headers] = await pool.query(
      `SELECT id, \`year_month\`, vehicle, supplier, part_no, spec, material_code,
              prev_stock, month_sales, month_in_qty, cumulative_in, current_stock,
              month_order_total, month_ship_total, month_unship_total,
              remaining, forecast_end_stock,
              month_end_stock_ib, current_stock_ib, remaining_ib,
              row_order, upload_batch, uploaded_by,
              DATE_FORMAT(uploaded_at, '%Y-%m-%d %H:%i:%s') AS uploaded_at
       FROM tpo_monthly_header
       WHERE \`year_month\` = ?
       ORDER BY row_order ASC, id ASC`,
      [ym],
    );

    if (headers.length === 0) return res.json({ ym, headers: [], dailyByHeader: {}, weeklyByHeader: {}, perfByHeader: {}, inboundByHeader: {}, dateList: [], weekList: [], perfWeekList: [], inboundWeekList: [], meta: null });

    const headerIds = headers.map((h) => h.id);
    const [daily] = await pool.query(
      `SELECT header_id, DATE_FORMAT(ship_date, '%Y-%m-%d') AS ship_date, week_no, order_qty, ship_qty
       FROM tpo_daily_entry WHERE header_id IN (?) ORDER BY ship_date ASC`,
      [headerIds],
    );
    const [weekly] = await pool.query(
      `SELECT header_id, week_no, order_total, ship_total, unship_total
       FROM tpo_weekly_summary WHERE header_id IN (?) ORDER BY week_no ASC`,
      [headerIds],
    );
    const [perf] = await pool.query(
      `SELECT header_id, week_no, plan_qty, actual_qty, achievement_rate
       FROM tpo_weekly_performance WHERE header_id IN (?) ORDER BY week_no ASC`,
      [headerIds],
    );
    const [inbound] = await pool.query(
      `SELECT header_id, week_no, inbound_qty
       FROM tpo_weekly_inbound WHERE header_id IN (?) ORDER BY week_no ASC`,
      [headerIds],
    );

    const dailyByHeader = {};
    const dateSet = new Set();
    const dateWeek = {};
    for (const d of daily) {
      if (!dailyByHeader[d.header_id]) dailyByHeader[d.header_id] = {};
      dailyByHeader[d.header_id][d.ship_date] = { order: d.order_qty, ship: d.ship_qty, week: d.week_no };
      dateSet.add(d.ship_date);
      if (!dateWeek[d.ship_date]) dateWeek[d.ship_date] = d.week_no;
    }
    const dateList = [...dateSet].sort();

    const weeklyByHeader = {};
    const weekSet = new Set();
    for (const w of weekly) {
      if (!weeklyByHeader[w.header_id]) weeklyByHeader[w.header_id] = {};
      weeklyByHeader[w.header_id][w.week_no] = { order: w.order_total, ship: w.ship_total, unship: w.unship_total };
      weekSet.add(w.week_no);
    }
    const weekList = [...weekSet].sort((a, b) => a - b);

    const perfByHeader = {};
    const perfWeekSet = new Set();
    for (const p of perf) {
      if (!perfByHeader[p.header_id]) perfByHeader[p.header_id] = {};
      perfByHeader[p.header_id][p.week_no] = { plan: p.plan_qty, actual: p.actual_qty, rate: p.achievement_rate };
      perfWeekSet.add(p.week_no);
    }
    const perfWeekList = [...perfWeekSet].sort((a, b) => a - b);

    const inboundByHeader = {};
    const inboundWeekSet = new Set();
    for (const b of inbound) {
      if (!inboundByHeader[b.header_id]) inboundByHeader[b.header_id] = {};
      inboundByHeader[b.header_id][b.week_no] = b.inbound_qty;
      inboundWeekSet.add(b.week_no);
    }
    const inboundWeekList = [...inboundWeekSet].sort((a, b) => a - b);

    const meta = {
      uploaded_at: headers[0].uploaded_at,
      uploaded_by: headers[0].uploaded_by,
    };

    res.json({ ym, headers, dailyByHeader, weeklyByHeader, perfByHeader, inboundByHeader, dateList, dateWeek, weekList, perfWeekList, inboundWeekList, meta });
  } catch (err) {
    logger.error('tpo-detail list error', { error: err.message });
    res.status(500).json({ error: '조회 실패: ' + err.message });
  }
});

// ── 월 삭제 ──
router.delete('/', async (req, res) => {
  try {
    const ym = ymRegex(req.query.ym);
    if (!ym) return res.status(400).json({ error: '삭제할 YYYY-MM 이 필요합니다.' });
    const pool = getPool();
    const [r] = await pool.query(`DELETE FROM tpo_monthly_header WHERE \`year_month\` = ?`, [ym]);
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (err) {
    logger.error('tpo-detail delete error', { error: err.message });
    res.status(500).json({ error: '삭제 실패: ' + err.message });
  }
});

// ── 엑셀 업로드 (1~3월 포맷 고정) ──
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const ym = ymRegex(req.body.ym);
    if (!ym) return res.status(400).json({ error: 'YYYY-MM 이 필요합니다.' });
    const uploadedBy = String(req.body.uploadedBy || '').trim() || null;

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: '시트가 없습니다.' });

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 6) return res.status(400).json({ error: '데이터 형식이 올바르지 않습니다.' });

    const row2 = rows[2] || [];
    const row3 = rows[3] || [];
    const row4 = rows[4] || [];

    // 포맷 검증 제거 — 1~3월 파서 기준으로 동작, 다른 포맷은 빈 값으로 들어감

    // ── 일자·주차 컬럼 스캔 (L열부터 BR 이전까지) ──
    // row4: 숫자(날짜 serial) = 주문 컬럼, 그 다음 컬럼이 "M/D(요일)\n출고" 문자열 = 출고
    // 주차 합계 3셀: "N주차\n주문 합계" / "N주차\n출고 합계" / "N주차\n미출고 합계"
    const dayCols = []; // { orderCol, shipCol, shipDate, weekNo }
    const weekCols = {}; // weekNo → { orderCol, shipCol, unshipCol }
    let currentWeek = 1;
    let c = COL.dayStart;
    while (c < row4.length) {
      const cell = row4[c];
      if (typeof cell === 'number' && Number.isFinite(cell) && cell > 40000) {
        const shipDate = excelSerialToDate(cell);
        const nxt = row4[c + 1];
        if (shipDate && typeof nxt === 'string' && nxt.includes('출고')) {
          dayCols.push({ orderCol: c, shipCol: c + 1, shipDate, weekNo: currentWeek });
          c += 2;
          continue;
        }
        c += 1; continue;
      }
      if (typeof cell === 'string') {
        const n = cell.replace(/\s/g, '');
        const wm = n.match(/^(\d+)주차/);
        if (wm) {
          const wk = Number(wm[1]);
          const next1 = String(row4[c + 1] || '').replace(/\s/g, '');
          const next2 = String(row4[c + 2] || '').replace(/\s/g, '');
          if (n.includes('주문') && next1.includes('출고') && next2.includes('미출')) {
            weekCols[wk] = { orderCol: c, shipCol: c + 1, unshipCol: c + 2 };
            currentWeek = wk + 1;
            c += 3;
            continue;
          }
        }
        // 월 합계 라벨 감지 → 일자/주차 스캔 종료
        if (n.includes('월출고') || n.includes('월주문') || n.includes('월미출') || n.includes('합계')) break;
      }
      c += 1;
    }

    // ── 월 합계 / 잔량 / 입고실적 섹션 위치 탐색 (row4 라벨 기반) ──
    let monthShipCol = null, monthOrderCol = null, monthUnshipCol = null;
    let remainingCol = null, forecastCol = null;
    let perfStartCol = null;
    let inboundStartCol = null, inboundTotalCol = null;
    let meStockIbCol = null, curStockIbCol = null, remainingIbCol = null;

    for (let c = dayCols.length > 0 ? dayCols[dayCols.length - 1].shipCol + 1 : 60; c < row4.length; c++) {
      const s = String(row4[c] || '').replace(/\s/g, '');
      if (!s) continue;
      if (s.includes('월출고')) monthShipCol = c;
      else if (s.includes('월주문')) monthOrderCol = c;
      else if (s.includes('월미출')) monthUnshipCol = c;
      else if (s === '잔량' && remainingCol == null) remainingCol = c;
      else if (s === '월말예상재고') forecastCol = c;
      else if (s === '계획' && perfStartCol == null) perfStartCol = c;
      else if (s === '입고실적' && inboundStartCol == null) inboundStartCol = c;
      else if (s === '합계' && inboundStartCol != null && inboundTotalCol == null && c > inboundStartCol) inboundTotalCol = c;
      else if (s === '월말재고' && meStockIbCol == null) meStockIbCol = c;
      else if (s === '현재고' && curStockIbCol == null && c > (meStockIbCol || 0)) curStockIbCol = c;
      else if (s === '잔량' && remainingIbCol == null && remainingCol != null && c > remainingCol + 5) remainingIbCol = c;
    }

    // 당월 입고실적은 합계 6연속 (1주~5주+합계). 시작컬럼은 inboundTotal - 5
    const inboundCols = [];
    if (inboundTotalCol != null) {
      for (let w = 1; w <= 5; w++) inboundCols.push({ weekNo: w, col: inboundTotalCol - 6 + w });
    }

    // 전월 주별 입고실적 (계획/실적/달성율 × 5주)
    const perfCols = [];
    if (perfStartCol != null) {
      for (let w = 1; w <= 5; w++) {
        perfCols.push({ weekNo: w, planCol: perfStartCol + (w - 1) * 3, actualCol: perfStartCol + (w - 1) * 3 + 1, rateCol: perfStartCol + (w - 1) * 3 + 2 });
      }
    }

    // ── 데이터 파싱 ──
    const headerRows = [];
    const dailyRows = [];
    const weeklyRows = [];
    const perfRows = [];
    const inboundRows = [];
    let lastVehicle = null, lastSupplier = null;
    for (let i = 5; i < rows.length; i++) {
      const r = rows[i] || [];
      const materialCode = str(r[COL.material_code]);
      const partNo = str(r[COL.part_no]);
      if (!materialCode && !partNo) continue;

      // Excel 병합 셀은 첫 행만 값이 있음 → 이후 빈 값은 직전 값으로 포워드 필
      const rawVehicle = str(r[COL.vehicle]);
      const rawSupplier = str(r[COL.supplier]);
      const vehicle = rawVehicle ?? lastVehicle;
      const supplier = rawSupplier ?? lastSupplier;
      if (rawVehicle) lastVehicle = rawVehicle;
      if (rawSupplier) lastSupplier = rawSupplier;

      headerRows.push({
        rowIdx: i,
        vehicle,
        supplier,
        part_no: partNo,
        spec: str(r[COL.spec]),
        material_code: materialCode,
        prev_stock: parseInt32(r[COL.prev_stock]),
        month_sales: parseInt32(r[COL.month_sales]),
        month_in_qty: parseInt32(r[COL.month_in_qty]),
        cumulative_in: parseInt32(r[COL.cumulative_in]),
        current_stock: parseInt32(r[COL.current_stock]),
        month_order_total: monthOrderCol != null ? parseInt32(r[monthOrderCol]) : null,
        month_ship_total: monthShipCol != null ? parseInt32(r[monthShipCol]) : null,
        month_unship_total: monthUnshipCol != null ? parseInt32(r[monthUnshipCol]) : null,
        remaining: remainingCol != null ? parseDecimal(r[remainingCol]) : null,
        forecast_end_stock: forecastCol != null ? parseDecimal(r[forecastCol]) : null,
        month_end_stock_ib: meStockIbCol != null ? parseInt32(r[meStockIbCol]) : null,
        current_stock_ib: curStockIbCol != null ? parseInt32(r[curStockIbCol]) : null,
        remaining_ib: remainingIbCol != null ? parseDecimal(r[remainingIbCol]) : null,
      });

      for (const dc of dayCols) {
        const order = parseInt32(r[dc.orderCol]);
        const ship = dc.shipCol != null ? parseInt32(r[dc.shipCol]) : null;
        if (order == null && ship == null) continue;
        dailyRows.push({ rowIdx: i, shipDate: dc.shipDate, weekNo: dc.weekNo, order, ship });
      }
      for (const wkStr of Object.keys(weekCols)) {
        const cols = weekCols[wkStr];
        const weekNo = Number(wkStr);
        const orderTotal = parseInt32(r[cols.orderCol]);
        const shipTotal = parseInt32(r[cols.shipCol]);
        const unshipTotal = parseInt32(r[cols.unshipCol]);
        if (orderTotal == null && shipTotal == null && unshipTotal == null) continue;
        weeklyRows.push({ rowIdx: i, weekNo, order_total: orderTotal, ship_total: shipTotal, unship_total: unshipTotal });
      }
      for (const p of perfCols) {
        const plan = parseInt32(r[p.planCol]);
        const actual = parseInt32(r[p.actualCol]);
        const rate = parseDecimal(r[p.rateCol]);
        if (plan == null && actual == null && rate == null) continue;
        perfRows.push({ rowIdx: i, weekNo: p.weekNo, plan, actual, rate });
      }
      for (const b of inboundCols) {
        const qty = parseInt32(r[b.col]);
        if (qty == null) continue;
        inboundRows.push({ rowIdx: i, weekNo: b.weekNo, qty });
      }
    }

    if (headerRows.length === 0) return res.status(400).json({ error: '저장할 데이터가 없습니다.' });

    const batchId = randomUUID();
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM tpo_monthly_header WHERE \`year_month\` = ?`, [ym]);

      const rowIdxToHeaderId = new Map();
      let orderIdx = 0;
      for (const h of headerRows) {
        const [ins] = await conn.query(
          `INSERT INTO tpo_monthly_header
           (\`year_month\`, vehicle, supplier, part_no, spec, material_code,
            prev_stock, month_sales, month_in_qty, cumulative_in, current_stock,
            month_order_total, month_ship_total, month_unship_total,
            remaining, forecast_end_stock,
            month_end_stock_ib, current_stock_ib, remaining_ib,
            row_order, upload_batch, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ym, h.vehicle, h.supplier, h.part_no, h.spec, h.material_code,
           h.prev_stock, h.month_sales, h.month_in_qty, h.cumulative_in, h.current_stock,
           h.month_order_total, h.month_ship_total, h.month_unship_total,
           h.remaining, h.forecast_end_stock,
           h.month_end_stock_ib, h.current_stock_ib, h.remaining_ib,
           orderIdx++, batchId, uploadedBy],
        );
        rowIdxToHeaderId.set(h.rowIdx, ins.insertId);
      }

      const bulk = async (sql, values) => {
        const CHUNK = 1000;
        for (let i = 0; i < values.length; i += CHUNK) {
          await conn.query(sql, [values.slice(i, i + CHUNK)]);
        }
      };

      if (dailyRows.length > 0) {
        await bulk(
          `INSERT INTO tpo_daily_entry (header_id, ship_date, week_no, order_qty, ship_qty) VALUES ?`,
          dailyRows.map((d) => [rowIdxToHeaderId.get(d.rowIdx), d.shipDate, d.weekNo, d.order, d.ship]),
        );
      }
      if (weeklyRows.length > 0) {
        await bulk(
          `INSERT INTO tpo_weekly_summary (header_id, week_no, order_total, ship_total, unship_total) VALUES ?`,
          weeklyRows.map((w) => [rowIdxToHeaderId.get(w.rowIdx), w.weekNo, w.order_total, w.ship_total, w.unship_total]),
        );
      }
      if (perfRows.length > 0) {
        await bulk(
          `INSERT INTO tpo_weekly_performance (header_id, week_no, plan_qty, actual_qty, achievement_rate) VALUES ?`,
          perfRows.map((p) => [rowIdxToHeaderId.get(p.rowIdx), p.weekNo, p.plan, p.actual, p.rate]),
        );
      }
      if (inboundRows.length > 0) {
        await bulk(
          `INSERT INTO tpo_weekly_inbound (header_id, week_no, inbound_qty) VALUES ?`,
          inboundRows.map((b) => [rowIdxToHeaderId.get(b.rowIdx), b.weekNo, b.qty]),
        );
      }

      await conn.commit();
      res.json({
        ok: true, ym, sheet: sheetName,
        headers: headerRows.length,
        dailyEntries: dailyRows.length,
        weeklySummaries: weeklyRows.length,
        weeklyPerformance: perfRows.length,
        weeklyInbound: inboundRows.length,
        dayCols: dayCols.length,
        weekCount: Object.keys(weekCols).length,
        batchId,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    logger.error('tpo-detail upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '업로드 실패: ' + err.message });
  }
});

export default router;
