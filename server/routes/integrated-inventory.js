/**
 * 통합 재고 관리
 * - 첫 번째 시트 "통합관리 재고"의 데이터를 파싱하여 일자별 스냅샷으로 저장
 * - 업로드 시 동일 snapshot_date의 기존 데이터 교체
 * - 헤더: row 2(컬럼명), row 3(단위), row 4(합계) → row 5부터 데이터
 * - 차종/부위/업체는 병합 셀로 비어 있을 수 있어 직전 값 승계
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseNum(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return (Number.isFinite(n)) ? n : null;
}
function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
function validDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const SELECT_COLS = `
  id, DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS snapshot_date,
  vehicle, part, color, product_code, supplier,
  two_width, thickness, ratio, width, length,
  gyeongju_top, gyeongju_cover, ulsan_cover, bottom_qty,
  foam_total, foam_raw, primer_qty, finished_qty,
  row_order, upload_batch, uploaded_by,
  DATE_FORMAT(uploaded_at, '%Y-%m-%d %H:%i:%s') AS uploaded_at`;

// ── 스냅샷 일자 목록 ──
router.get('/dates', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS snapshot_date,
              COUNT(*) AS cnt,
              DATE_FORMAT(MAX(uploaded_at), '%Y-%m-%d %H:%i:%s') AS uploaded_at,
              MAX(uploaded_by) AS uploaded_by
       FROM integrated_inventory
       GROUP BY snapshot_date
       ORDER BY snapshot_date DESC`,
    );
    res.json({ dates: rows });
  } catch (err) {
    logger.error('integrated-inventory dates error', { error: err.message });
    res.status(500).json({ error: '조회 실패: ' + err.message });
  }
});

// ── 조회 (특정 일자) ──
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    let date = validDate(req.query.date);
    if (!date) {
      // 최신 스냅샷 일자 자동 선택
      const [latest] = await pool.query(
        `SELECT DATE_FORMAT(MAX(snapshot_date), '%Y-%m-%d') AS d FROM integrated_inventory`,
      );
      date = latest[0]?.d || null;
    }
    if (!date) return res.json({ list: [], total: 0, meta: null, snapshot_date: null });

    const [rows] = await pool.query(
      `SELECT ${SELECT_COLS}
       FROM integrated_inventory
       WHERE snapshot_date = ?
       ORDER BY row_order ASC, id ASC`,
      [date],
    );
    const meta = rows.length > 0
      ? { upload_batch: rows[0].upload_batch, uploaded_at: rows[0].uploaded_at, uploaded_by: rows[0].uploaded_by }
      : null;
    res.json({ list: rows, total: rows.length, meta, snapshot_date: date });
  } catch (err) {
    logger.error('integrated-inventory list error', { error: err.message });
    res.status(500).json({ error: '조회 실패: ' + err.message });
  }
});

// ── 특정 일자 삭제 ──
router.delete('/', async (req, res) => {
  try {
    const date = validDate(req.query.date);
    if (!date) return res.status(400).json({ error: '삭제할 날짜가 필요합니다.' });
    const pool = getPool();
    const [r] = await pool.query(`DELETE FROM integrated_inventory WHERE snapshot_date = ?`, [date]);
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (err) {
    logger.error('integrated-inventory delete error', { error: err.message });
    res.status(500).json({ error: '삭제 실패: ' + err.message });
  }
});

// ── 엑셀 업로드 ──
// 첫 번째 시트("통합관리 재고") 사용, 일자별 스냅샷
// 컬럼 (0-based):
//   0:차종, 1:부위, 2:칼라, 3:완제품코드, 4:업체,
//   5:두폭, 6:두께, 7:배율, 8:폭, 9:길이,
//   10:경주상지, 11:경주표지, 12:울산표지, 13:하지,
//   14:폼총수량, 15:미처리폼, 16:프라이머, 17:완제품
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const uploadedBy = String(req.body.uploadedBy || '').trim() || null;
    const snapshotDate = validDate(req.body.snapshotDate);
    if (!snapshotDate) return res.status(400).json({ error: '스냅샷 일자가 유효하지 않습니다.' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: '시트가 없습니다.' });

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const values = [];
    let curVehicle = null;
    let curPart = null;
    let curSupplier = null;
    let rowOrder = 0;
    const batchId = randomUUID();

    for (let i = 5; i < rows.length; i++) {
      const r = rows[i] || [];
      const first = r[0] ? String(r[0]).trim() : '';
      if (first === '합계') continue;

      const productCode = str(r[3]);
      const color = str(r[2]);
      const hasQty = r.slice(10, 18).some((v) => v !== '' && v != null && Number(v) !== 0);
      if (!productCode && !color && !hasQty) continue;

      if (str(r[0])) curVehicle = str(r[0]);
      if (str(r[1])) curPart = str(r[1]);
      if (str(r[4])) curSupplier = str(r[4]);

      values.push([
        snapshotDate,
        curVehicle,
        curPart,
        str(r[2]),
        productCode,
        curSupplier,
        parseNum(r[5]),
        parseNum(r[6]),
        parseNum(r[7]),
        parseNum(r[8]),
        parseNum(r[9]),
        parseNum(r[10]),
        parseNum(r[11]),
        parseNum(r[12]),
        parseNum(r[13]),
        parseNum(r[14]),
        parseNum(r[15]),
        parseNum(r[16]),
        parseNum(r[17]),
        rowOrder++,
        batchId,
        uploadedBy,
      ]);
    }

    if (values.length === 0) {
      return res.status(400).json({ error: '저장 가능한 데이터가 없습니다.' });
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM integrated_inventory WHERE snapshot_date = ?`, [snapshotDate]);
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        const [r] = await conn.query(
          `INSERT INTO integrated_inventory
           (snapshot_date, vehicle, part, color, product_code, supplier,
            two_width, thickness, ratio, width, length,
            gyeongju_top, gyeongju_cover, ulsan_cover, bottom_qty,
            foam_total, foam_raw, primer_qty, finished_qty,
            row_order, upload_batch, uploaded_by)
           VALUES ?`,
          [chunk],
        );
        inserted += r.affectedRows;
      }
      await conn.commit();
      res.json({
        ok: true,
        sheet: sheetName,
        snapshotDate,
        inserted,
        batchId,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    logger.error('integrated-inventory upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '업로드 실패: ' + err.message });
  }
});

export default router;
