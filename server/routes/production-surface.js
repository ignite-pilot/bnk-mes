/**
 * 표면처리 생산 실적
 * - 조회(날짜 범위), 생성/수정/삭제
 * - 엑셀 업로드 (시트: "표면처리생산실적_*")
 * - 마스터 미매칭(차종/칼라) 정보를 응답에 포함
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { normVehicle, normColor } from '../lib/normalize.js';
import { getAllCodeMaps } from '../lib/config-codes.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 유틸 ──
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
// 엑셀 시리얼 날짜 → 'YYYY-MM-DD'
function excelSerialToDate(v) {
  if (v == null || v === '') return null;
  // 이미 문자열 날짜면 그대로 반환 시도
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    v = n;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  // Excel epoch: 1899-12-30 UTC (1900-leap-bug 보정)
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// 마스터 매칭 셋 (차종/칼라)
async function getMasterSets() {
  try {
    const { vehicleMap, colorMap } = await getAllCodeMaps();
    return {
      vehicles: new Set(Object.keys(vehicleMap).map((k) => String(k).toUpperCase())),
      colors: new Set(Object.keys(colorMap).map((k) => String(k).toUpperCase())),
    };
  } catch {
    return { vehicles: new Set(), colors: new Set() };
  }
}

// ── 조회 (기간) ──
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, date } = req.query;
    const pool = getPool();

    const where = ["deleted = 'N'"];
    const params = [];
    if (date) {
      where.push('prod_date = ?');
      params.push(date);
    } else {
      if (startDate) { where.push('prod_date >= ?'); params.push(startDate); }
      if (endDate)   { where.push('prod_date <= ?'); params.push(endDate); }
    }

    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(prod_date, '%Y-%m-%d') AS prod_date,
              supplier, \`div\`, vehicle, color, thickness, width,
              top_lot, cover_lot, in_qty, out_qty, defect_qty, yield_rate,
              memo, status, created_by, updated_by,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM production_surface
       WHERE ${where.join(' AND ')}
       ORDER BY prod_date DESC, id ASC`,
      params,
    );

    const { vehicles, colors } = await getMasterSets();
    const list = rows.map((r) => ({
      ...r,
      vehicleMatched: r.vehicle ? vehicles.has(String(r.vehicle).toUpperCase()) : true,
      colorMatched: r.color ? colors.has(String(r.color).toUpperCase()) : true,
    }));
    const mismatchCount = list.filter((r) => !r.vehicleMatched || !r.colorMatched).length;

    res.json({ list, total: list.length, mismatchCount });
  } catch (err) {
    logger.error('production-surface list error', { error: err.message });
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
      `INSERT INTO production_surface
       (prod_date, supplier, \`div\`, vehicle, color, thickness, width,
        top_lot, cover_lot, in_qty, out_qty, defect_qty, yield_rate,
        memo, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prodDate,
        b.supplier || null,
        b.div || null,
        b.vehicle ? normVehicle(b.vehicle) : null,
        b.color ? normColor(b.color) : null,
        parseNum(b.thickness),
        parseInt32(b.width),
        b.top_lot || null,
        b.cover_lot || null,
        parseInt32(b.in_qty),
        parseInt32(b.out_qty),
        parseInt32(b.defect_qty),
        parseNum(b.yield_rate),
        b.memo || null,
        b.status || null,
        b.created_by || null,
        b.created_by || null,
      ],
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    logger.error('production-surface create error', { error: err.message });
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
    maybe('supplier', b.supplier ?? null);
    maybe('`div`', b.div ?? null);
    maybe('vehicle', b.vehicle, (v) => (v ? normVehicle(v) : null));
    maybe('color', b.color, (v) => (v ? normColor(v) : null));
    maybe('thickness', b.thickness, parseNum);
    maybe('width', b.width, parseInt32);
    maybe('top_lot', b.top_lot ?? null);
    maybe('cover_lot', b.cover_lot ?? null);
    maybe('in_qty', b.in_qty, parseInt32);
    maybe('out_qty', b.out_qty, parseInt32);
    maybe('defect_qty', b.defect_qty, parseInt32);
    maybe('yield_rate', b.yield_rate, parseNum);
    maybe('memo', b.memo ?? null);
    maybe('status', b.status ?? null);
    if (b.updated_by !== undefined) { fields.push('updated_by = ?'); params.push(b.updated_by || null); }
    if (fields.length === 0) return res.json({ ok: true, changed: 0 });

    params.push(id);
    const [result] = await pool.query(
      `UPDATE production_surface SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
    res.json({ ok: true, changed: result.affectedRows });
  } catch (err) {
    logger.error('production-surface update error', { error: err.message });
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
      `UPDATE production_surface SET deleted = 'Y' WHERE id = ?`,
      [id],
    );
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) {
    logger.error('production-surface delete error', { error: err.message });
    res.status(500).json({ error: '삭제 실패: ' + err.message });
  }
});

// ── 엑셀 업로드 ──
// 시트: "표면처리생산실적_*"
// 헤더 행: 1행 (0-based: index 1)
// 컬럼 매핑 (0-based):
//   1: 생산일자, 2: 업체, 3: 구분, 4: 차종, 5: 칼라, 6: 두께, 7: 폭,
//   8: 상지lot, 9: 표지lot, 10: 입고수량, 11: 수량, 12: 불량수량,
//   13: 수율, 14: 비고, 15: 상태
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const uploadedBy = String(req.body.uploadedBy || '').trim() || null;

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    // "표면처리생산실적" 포함된 시트 찾기 (구버전 시트 제외)
    const sheetName = wb.SheetNames.find((n) => /표면처리.*실적/.test(n) && !/구버전/.test(n))
      || wb.SheetNames.find((n) => /표면처리/.test(n) && !/구버전/.test(n))
      || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return res.status(400).json({ error: '시트를 찾을 수 없습니다.' });

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const pool = getPool();
    const values = [];
    const skippedKeys = [];
    const dateSet = new Set();

    // 데이터는 2행(index 2)부터 시작
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] || [];
      const rawDate = r[1];
      const prodDate = excelSerialToDate(rawDate);
      if (!prodDate) {
        // 완전히 빈 행은 조용히 스킵
        const anyVal = r.slice(1, 16).some((v) => v !== '' && v != null);
        if (anyVal) skippedKeys.push({ row: i + 1, reason: '생산일자 파싱 실패', rawDate });
        continue;
      }

      const vehicle = r[4] ? normVehicle(r[4]) : null;
      const color = r[5] ? normColor(r[5]) : null;

      values.push([
        prodDate,
        r[2] ? String(r[2]).trim() : null,   // supplier
        r[3] ? String(r[3]).trim() : null,   // div
        vehicle,
        color,
        parseNum(r[6]),                      // thickness
        parseInt32(r[7]),                    // width
        r[8] ? String(r[8]).trim() : null,   // top_lot
        r[9] ? String(r[9]).trim() : null,   // cover_lot
        parseInt32(r[10]),                   // in_qty
        parseInt32(r[11]),                   // out_qty
        parseInt32(r[12]),                   // defect_qty
        parseNum(r[13]),                     // yield_rate
        r[14] ? String(r[14]).trim() : null, // memo
        r[15] ? String(r[15]).trim() : null, // status
        uploadedBy,
        uploadedBy,
      ]);
      dateSet.add(prodDate);
    }

    if (values.length === 0) {
      return res.status(400).json({ error: '저장 가능한 데이터가 없습니다.', skipped: skippedKeys.length });
    }

    // 업로드 시 기존 데이터 전체 하드 삭제 후 재적재
    const conn = await pool.getConnection();
    let inserted = 0;
    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM production_surface`);
      const CHUNK = 1000;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        const [r] = await conn.query(
          `INSERT INTO production_surface
           (prod_date, supplier, \`div\`, vehicle, color, thickness, width,
            top_lot, cover_lot, in_qty, out_qty, defect_qty, yield_rate,
            memo, status, created_by, updated_by)
           VALUES ?`,
          [chunk],
        );
        inserted += r.affectedRows;
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // 마스터 미매칭 집계
    const { vehicles, colors } = await getMasterSets();
    let mismatchVehicle = 0;
    let mismatchColor = 0;
    const unmatchedVehicles = new Set();
    const unmatchedColors = new Set();
    for (const v of values) {
      const vv = v[3];
      const cc = v[4];
      if (vv && !vehicles.has(String(vv).toUpperCase())) { mismatchVehicle++; unmatchedVehicles.add(vv); }
      if (cc && !colors.has(String(cc).toUpperCase()))   { mismatchColor++;   unmatchedColors.add(cc); }
    }

    res.json({
      ok: true,
      sheetName,
      inserted,
      skipped: skippedKeys.length,
      skippedSamples: skippedKeys.slice(0, 5),
      dateCount: dateSet.size,
      replace: 'full',
      mismatch: {
        vehicle: mismatchVehicle,
        color: mismatchColor,
        vehicleList: [...unmatchedVehicles].slice(0, 20),
        colorList: [...unmatchedColors].slice(0, 20),
      },
    });
  } catch (err) {
    logger.error('production-surface upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '업로드 실패: ' + err.message });
  }
});

export default router;
