/**
 * 3개월 주문 계획 관리 (TPO)
 * - 엑셀 업로드 → 파싱 → 저장
 * - 월별 조회
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 공통 유틸
function normVehicle(v) {
  if (!v) return '';
  return String(v).trim().replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ');
}
function parseNum(v) {
  if (v == null) return null;
  const s = String(v).replace(/[,\s]/g, '').replace(/^-$/, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return (!Number.isNaN(n) && isFinite(n)) ? n : null;
}
function extractMonth(filename) {
  // "26년3월 TPO..." → "2026-03"
  const m = filename.match(/(\d{2})년\s*(\d{1,2})월/);
  if (m) {
    const year = 2000 + Number(m[1]);
    const month = String(m[2]).padStart(2, '0');
    return `${year}-${month}`;
  }
  return null;
}
function parseDateHeader(text, planMonth) {
  // "2/1", "3/15" 같은 형식
  if (!text) return null;
  const s = String(text).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const [py, pm] = planMonth.split('-').map(Number);
  // 해당 월이 아니면 전/다음 월로 처리
  let year = py;
  if (mm < pm) year = py + (mm < pm ? 0 : 0); // 같은 해 가정
  if (mm === pm) year = py;
  else if (mm < pm) { // 1월 데이터에 2월 시작 같은 경우 없음, 12→1
    if (pm === 12 && mm === 1) year = py + 1;
  } else if (mm > pm) {
    if (pm === 12) year = py;
    else year = py; // 2월 데이터에 3월초 포함 가능
  }
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// ── 업로드 ──
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const uploadedBy = String(req.body.uploadedBy || '').trim();

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    // "생산요청서" 포함된 시트 찾기
    const sheetName = wb.SheetNames.find(n => n.includes('생산요청서')) || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });

    // 파일명/시트명에서 년월 추출
    const planMonth = extractMonth(req.file.originalname) || extractMonth(sheetName);
    if (!planMonth) {
      return res.status(400).json({ error: '파일명에서 년월을 인식할 수 없습니다.' });
    }

    // 4행 (날짜 헤더) 파싱 — 10~40열 범위
    const dateHeaderRow = rows[4] || [];
    const dateCols = []; // { col, date }
    for (let c = 10; c <= 40; c++) {
      const text = dateHeaderRow[c];
      if (!text) continue;
      const s = String(text).trim();
      const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (!m) continue;
      const mm = Number(m[1]);
      const dd = Number(m[2]);
      const [py, pm] = planMonth.split('-').map(Number);
      // 년도 결정: 해당 월이면 계획 년도, 다음 월이면 계획 년도
      let year = py;
      if (mm === pm) year = py;
      else if (mm > pm || (pm === 12 && mm === 1)) year = (pm === 12 && mm === 1) ? py + 1 : py;
      else year = py; // 이전 월 (거의 없음)
      dateCols.push({ col: c, date: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` });
    }

    const pool = getPool();

    // 기존 데이터 삭제 (같은 월)
    await pool.query('DELETE FROM production_tpo_plan WHERE plan_month = ?', [planMonth]);

    // 파싱 및 저장
    let pVehicle = '', pSupplier = '';
    let savedHeaders = 0;
    let savedDaily = 0;
    let sortOrder = 0;

    for (let i = 5; i < rows.length; i++) {
      const r = rows[i] || [];
      const rawVehicle = r[0] ? String(r[0]).trim() : '';
      const rawSupplier = r[1] ? String(r[1]).trim() : '';
      const productNum = r[2] ? String(r[2]).trim() : '';
      const materialCode = r[3] ? String(r[3]).trim() : '';

      // 차종/업체/품번 3개가 모두 비어있으면 스킵 (요약/합계 행)
      if (!rawVehicle && !rawSupplier && !productNum) continue;

      if (rawVehicle) pVehicle = normVehicle(rawVehicle);
      if (rawSupplier) pSupplier = rawSupplier;

      // 품번이 있어야 제품 행으로 인식
      if (!productNum) continue;

      // 헤더 저장
      // 열 4: 전월말재고, 열 5: 월판매, 열 6: 월생산입고, 열 7: 입고누계, 열 8: 현재고
      const [result] = await pool.query(
        `INSERT INTO production_tpo_plan
         (plan_month, vehicle, supplier, product_num, material_code,
          monthly_plan, prev_stock, monthly_sales, monthly_production,
          stock_cumulative, current_stock, total_qty, remaining, expected_end_stock,
          sort_order, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          planMonth, pVehicle, pSupplier, productNum, materialCode || null,
          null, // monthly_plan
          parseNum(r[4]), parseNum(r[5]), parseNum(r[6]),
          parseNum(r[7]), parseNum(r[8]),
          parseNum(r[41]), null, null,
          sortOrder++, uploadedBy,
        ]
      );
      const headerId = result.insertId;
      savedHeaders++;

      // 일별 데이터 저장
      const dailyValues = [];
      for (const { col, date } of dateCols) {
        const qty = parseNum(r[col]);
        if (qty != null) dailyValues.push([headerId, date, qty]);
      }
      if (dailyValues.length > 0) {
        await pool.query(
          'INSERT INTO production_tpo_plan_daily (header_id, plan_date, request_qty) VALUES ?',
          [dailyValues]
        );
        savedDaily += dailyValues.length;
      }
    }

    res.json({
      ok: true,
      planMonth,
      sheetName,
      headers: savedHeaders,
      daily: savedDaily,
      dateColumns: dateCols.length,
    });
  } catch (err) {
    logger.error('tpo upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '업로드 실패: ' + err.message });
  }
});

// ── 월별 조회 ──
router.get('/', async (req, res) => {
  try {
    const { planMonth } = req.query;
    const pool = getPool();

    // 업로드된 월 목록
    const [months] = await pool.query(
      'SELECT DISTINCT plan_month FROM production_tpo_plan ORDER BY plan_month DESC'
    );

    if (!planMonth) {
      return res.json({ months: months.map(m => m.plan_month), list: [], dates: [] });
    }

    const [headers] = await pool.query(
      'SELECT * FROM production_tpo_plan WHERE plan_month = ? ORDER BY sort_order, id',
      [planMonth]
    );

    if (headers.length === 0) {
      return res.json({ months: months.map(m => m.plan_month), list: [], dates: [] });
    }

    const headerIds = headers.map(h => h.id);
    const [daily] = await pool.query(
      `SELECT header_id, DATE_FORMAT(plan_date, '%Y-%m-%d') AS plan_date, request_qty
       FROM production_tpo_plan_daily WHERE header_id IN (?)`,
      [headerIds]
    );

    const dailyMap = {};
    const dateSet = new Set();
    for (const d of daily) {
      if (!dailyMap[d.header_id]) dailyMap[d.header_id] = {};
      dailyMap[d.header_id][d.plan_date] = d.request_qty;
      dateSet.add(d.plan_date);
    }
    const dates = [...dateSet].sort();

    const list = headers.map(h => ({
      ...h,
      daily: dailyMap[h.id] || {},
    }));

    res.json({ months: months.map(m => m.plan_month), list, dates, total: list.length });
  } catch (err) {
    logger.error('tpo list error', { error: err.message });
    res.status(500).json({ error: '조회 실패' });
  }
});

// ── 월별 삭제 ──
router.delete('/:planMonth', async (req, res) => {
  try {
    const { planMonth } = req.params;
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM production_tpo_plan WHERE plan_month = ?', [planMonth]);
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) {
    logger.error('tpo delete error', { error: err.message });
    res.status(500).json({ error: '삭제 실패' });
  }
});

export default router;
