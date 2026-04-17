/**
 * 프라이머 생산 실적
 * - 조회(날짜 범위), 생성/수정/삭제
 * - 엑셀 업로드 (시트: "폼프라이머생산_*")
 * - 마스터 미매칭(차종) 정보를 응답에 포함
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { normVehicle } from '../lib/normalize.js';
import { getAllCodeMaps } from '../lib/config-codes.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseNum(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[,\s]/g, '').replace(/^-$/, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return (!Number.isNaN(n) && isFinite(n)) ? n : null;
}
function parseInt32(v) {
  const n = parseNum(v);
  return n == null ? null : Math.trunc(n);
}
function excelSerialToDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    v = n;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function getMasterVehicles() {
  try {
    const { vehicleMap } = await getAllCodeMaps();
    return new Set(Object.keys(vehicleMap).map((k) => String(k).toUpperCase()));
  } catch {
    return new Set();
  }
}

// ── 조회 ──
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, date } = req.query;
    const pool = getPool();
    const where = ["deleted = 'N'"];
    const params = [];
    if (date) {
      where.push('prod_date = ?'); params.push(date);
    } else {
      if (startDate) { where.push('prod_date >= ?'); params.push(startDate); }
      if (endDate)   { where.push('prod_date <= ?'); params.push(endDate); }
    }

    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(prod_date, '%Y-%m-%d') AS prod_date,
              \`div\`, vehicle, thickness, ratio, width,
              foam_lot, bnk_lot, in_qty, out_qty,
              back_treat, back_treat_check,
              yield_rate, yield_qty, memo,
              created_by, updated_by,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM production_primer
       WHERE ${where.join(' AND ')}
       ORDER BY prod_date DESC, id ASC`,
      params,
    );

    const vehicles = await getMasterVehicles();
    const list = rows.map((r) => ({
      ...r,
      vehicleMatched: r.vehicle ? vehicles.has(String(r.vehicle).toUpperCase()) : true,
    }));
    const mismatchCount = list.filter((r) => !r.vehicleMatched).length;
    res.json({ list, total: list.length, mismatchCount });
  } catch (err) {
    logger.error('production-primer list error', { error: err.message });
    res.status(500).json({ error: '조회 실패: ' + err.message });
  }
});

// ── 단건 생성 ──
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const prodDate = String(b.prod_date || '').trim();
    if (!prodDate) return res.status(400).json({ error: '생산일자는 필수입니다.' });
    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO production_primer
       (prod_date, \`div\`, vehicle, thickness, ratio, width,
        foam_lot, bnk_lot, in_qty, out_qty,
        back_treat, back_treat_check, yield_rate, yield_qty, memo,
        created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prodDate,
        b.div || null,
        b.vehicle ? normVehicle(b.vehicle) : null,
        parseNum(b.thickness),
        parseNum(b.ratio),
        parseInt32(b.width),
        b.foam_lot || null,
        b.bnk_lot || null,
        parseInt32(b.in_qty),
        parseInt32(b.out_qty),
        b.back_treat || null,
        b.back_treat_check || null,
        parseNum(b.yield_rate),
        parseInt32(b.yield_qty),
        b.memo || null,
        b.created_by || null,
        b.created_by || null,
      ],
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    logger.error('production-primer create error', { error: err.message });
    res.status(500).json({ error: '저장 실패: ' + err.message });
  }
});

// ── 수정 ──
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    const b = req.body || {};
    const pool = getPool();
    const fields = [];
    const params = [];
    const maybe = (col, val, transform) => {
      if (val === undefined) return;
      fields.push(`${col} = ?`);
      params.push(transform ? transform(val) : val);
    };
    maybe('prod_date', b.prod_date);
    maybe('`div`', b.div ?? null);
    maybe('vehicle', b.vehicle, (v) => (v ? normVehicle(v) : null));
    maybe('thickness', b.thickness, parseNum);
    maybe('ratio', b.ratio, parseNum);
    maybe('width', b.width, parseInt32);
    maybe('foam_lot', b.foam_lot ?? null);
    maybe('bnk_lot', b.bnk_lot ?? null);
    maybe('in_qty', b.in_qty, parseInt32);
    maybe('out_qty', b.out_qty, parseInt32);
    maybe('back_treat', b.back_treat ?? null);
    maybe('back_treat_check', b.back_treat_check ?? null);
    maybe('yield_rate', b.yield_rate, parseNum);
    maybe('yield_qty', b.yield_qty, parseInt32);
    maybe('memo', b.memo ?? null);
    if (b.updated_by !== undefined) { fields.push('updated_by = ?'); params.push(b.updated_by || null); }
    if (fields.length === 0) return res.json({ ok: true, changed: 0 });
    params.push(id);
    const [result] = await pool.query(
      `UPDATE production_primer SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
    res.json({ ok: true, changed: result.affectedRows });
  } catch (err) {
    logger.error('production-primer update error', { error: err.message });
    res.status(500).json({ error: '수정 실패: ' + err.message });
  }
});

// ── 삭제 (soft) ──
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    const pool = getPool();
    const [result] = await pool.query(
      `UPDATE production_primer SET deleted = 'Y' WHERE id = ?`,
      [id],
    );
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) {
    logger.error('production-primer delete error', { error: err.message });
    res.status(500).json({ error: '삭제 실패: ' + err.message });
  }
});

// ── 엑셀 업로드 ──
// 시트: "폼프라이머생산_*"
// 헤더 행: index 1, 데이터: index 2부터
// 컬럼 (0-based):
//   1:생산일자, 2:구분/품명, 3:차종, 4:두께, 5:배율, 6:폭,
//   7:폼LOT, 8:(빈칸), 9:BnK LOT, 10:입고수량, 11:실생산량,
//   12:이면처리, 13:이면처리검증, 14:수율, 15:수율수량, 16:비고
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const uploadedBy = String(req.body.uploadedBy || '').trim() || null;
    const replaceMode = String(req.body.replace || 'false') === 'true';

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames.find((n) => /폼프라이머/.test(n) && !/구버전/.test(n))
      || wb.SheetNames.find((n) => /프라이머/.test(n) && !/구버전/.test(n))
      || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return res.status(400).json({ error: '시트를 찾을 수 없습니다.' });

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const pool = getPool();
    const values = [];
    const skippedKeys = [];
    const dateSet = new Set();

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] || [];
      const rawDate = r[1];
      const prodDate = excelSerialToDate(rawDate);
      if (!prodDate) {
        const anyVal = r.slice(1, 17).some((v) => v !== '' && v != null);
        if (anyVal) skippedKeys.push({ row: i + 1, reason: '생산일자 파싱 실패', rawDate });
        continue;
      }
      const vehicle = r[3] ? normVehicle(r[3]) : null;
      values.push([
        prodDate,
        r[2] ? String(r[2]).trim() : null,   // div
        vehicle,
        parseNum(r[4]),                      // thickness
        parseNum(r[5]),                      // ratio
        parseInt32(r[6]),                    // width
        r[7] ? String(r[7]).trim() : null,   // foam_lot
        r[9] ? String(r[9]).trim() : null,   // bnk_lot (col 8은 빈칸)
        parseInt32(r[10]),                   // in_qty
        parseInt32(r[11]),                   // out_qty
        r[12] ? String(r[12]).trim() : null, // back_treat
        r[13] ? String(r[13]).trim() : null, // back_treat_check
        parseNum(r[14]),                     // yield_rate
        parseInt32(r[15]),                   // yield_qty
        r[16] ? String(r[16]).trim() : null, // memo
        uploadedBy,
        uploadedBy,
      ]);
      dateSet.add(prodDate);
    }

    if (values.length === 0) {
      return res.status(400).json({ error: '저장 가능한 데이터가 없습니다.', skipped: skippedKeys.length });
    }

    if (replaceMode && dateSet.size > 0) {
      await pool.query(
        `UPDATE production_primer SET deleted = 'Y' WHERE deleted = 'N' AND prod_date IN (?)`,
        [[...dateSet]],
      );
    }

    const CHUNK = 1000;
    let inserted = 0;
    for (let i = 0; i < values.length; i += CHUNK) {
      const chunk = values.slice(i, i + CHUNK);
      const [r] = await pool.query(
        `INSERT INTO production_primer
         (prod_date, \`div\`, vehicle, thickness, ratio, width,
          foam_lot, bnk_lot, in_qty, out_qty,
          back_treat, back_treat_check, yield_rate, yield_qty, memo,
          created_by, updated_by)
         VALUES ?`,
        [chunk],
      );
      inserted += r.affectedRows;
    }

    const vehicles = await getMasterVehicles();
    let mismatchVehicle = 0;
    const unmatchedVehicles = new Set();
    for (const v of values) {
      const vv = v[2];
      if (vv && !vehicles.has(String(vv).toUpperCase())) { mismatchVehicle++; unmatchedVehicles.add(vv); }
    }

    res.json({
      ok: true,
      sheetName,
      inserted,
      skipped: skippedKeys.length,
      skippedSamples: skippedKeys.slice(0, 5),
      dateCount: dateSet.size,
      replace: replaceMode,
      mismatch: {
        vehicle: mismatchVehicle,
        vehicleList: [...unmatchedVehicles].slice(0, 20),
      },
    });
  } catch (err) {
    logger.error('production-primer upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '업로드 실패: ' + err.message });
  }
});

export default router;
