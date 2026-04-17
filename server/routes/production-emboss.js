/**
 * 엠보 생산 실적
 * - 조회(날짜 범위), 생성/수정/삭제
 * - 엑셀 업로드 (시트: "26년 X월" 패턴)
 * - 헤더 4행(row 0~3), 데이터 row 4부터 (row 4는 합계행 → 생산일자가 숫자인 행만 처리)
 * - 마스터 미매칭(차종/칼라) 정보를 응답에 포함
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

async function getMasterMaps() {
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
              machine_no, bnk_lot, top_lot, cover_lot,
              vehicle, color, part, spec, sheet_qty,
              foam_lot, foam_in_qty, emboss_roll, width,
              emboss_qty, yield_rate, gloss, thickness,
              double_width, total_qty, roll_qty, count_qty, actual_usage,
              memo, created_by, updated_by,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM production_emboss
       WHERE ${where.join(' AND ')}
       ORDER BY prod_date DESC, id ASC`,
      params,
    );

    const { vehicles, colors } = await getMasterMaps();
    const list = rows.map((r) => ({
      ...r,
      vehicleMatched: r.vehicle ? vehicles.has(String(r.vehicle).toUpperCase()) : true,
      colorMatched: r.color ? colors.has(String(r.color).toUpperCase()) : true,
    }));
    const mismatchCount = list.filter((r) => !r.vehicleMatched || !r.colorMatched).length;
    res.json({ list, total: list.length, mismatchCount });
  } catch (err) {
    logger.error('production-emboss list error', { error: err.message });
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
      `INSERT INTO production_emboss
       (prod_date, machine_no, bnk_lot, top_lot, cover_lot,
        vehicle, color, part, spec, sheet_qty,
        foam_lot, foam_in_qty, emboss_roll, width,
        emboss_qty, yield_rate, gloss, thickness,
        double_width, total_qty, roll_qty, count_qty, actual_usage,
        memo, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prodDate,
        b.machine_no || null,
        b.bnk_lot || null,
        b.top_lot || null,
        b.cover_lot || null,
        b.vehicle ? normVehicle(b.vehicle) : null,
        b.color ? String(b.color).toUpperCase().trim() : null,
        b.part || null,
        b.spec || null,
        parseInt32(b.sheet_qty),
        b.foam_lot || null,
        parseInt32(b.foam_in_qty),
        b.emboss_roll || null,
        b.width || null,
        parseInt32(b.emboss_qty),
        parseNum(b.yield_rate),
        b.gloss || null,
        parseNum(b.thickness),
        b.double_width || null,
        parseInt32(b.total_qty),
        parseInt32(b.roll_qty),
        parseInt32(b.count_qty),
        parseInt32(b.actual_usage),
        b.memo || null,
        b.created_by || null,
        b.created_by || null,
      ],
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    logger.error('production-emboss create error', { error: err.message });
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
    maybe('machine_no', b.machine_no ?? null);
    maybe('bnk_lot', b.bnk_lot ?? null);
    maybe('top_lot', b.top_lot ?? null);
    maybe('cover_lot', b.cover_lot ?? null);
    maybe('vehicle', b.vehicle, (v) => (v ? normVehicle(v) : null));
    maybe('color', b.color, (v) => (v ? String(v).toUpperCase().trim() : null));
    maybe('part', b.part ?? null);
    maybe('spec', b.spec ?? null);
    maybe('sheet_qty', b.sheet_qty, parseInt32);
    maybe('foam_lot', b.foam_lot ?? null);
    maybe('foam_in_qty', b.foam_in_qty, parseInt32);
    maybe('emboss_roll', b.emboss_roll ?? null);
    maybe('width', b.width ?? null);
    maybe('emboss_qty', b.emboss_qty, parseInt32);
    maybe('yield_rate', b.yield_rate, parseNum);
    maybe('gloss', b.gloss ?? null);
    maybe('thickness', b.thickness, parseNum);
    maybe('double_width', b.double_width ?? null);
    maybe('total_qty', b.total_qty, parseInt32);
    maybe('roll_qty', b.roll_qty, parseInt32);
    maybe('count_qty', b.count_qty, parseInt32);
    maybe('actual_usage', b.actual_usage, parseInt32);
    maybe('memo', b.memo ?? null);
    if (b.updated_by !== undefined) { fields.push('updated_by = ?'); params.push(b.updated_by || null); }
    if (fields.length === 0) return res.json({ ok: true, changed: 0 });
    params.push(id);
    const [result] = await pool.query(
      `UPDATE production_emboss SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
    res.json({ ok: true, changed: result.affectedRows });
  } catch (err) {
    logger.error('production-emboss update error', { error: err.message });
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
      `UPDATE production_emboss SET deleted = 'Y' WHERE id = ?`,
      [id],
    );
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) {
    logger.error('production-emboss delete error', { error: err.message });
    res.status(500).json({ error: '삭제 실패: ' + err.message });
  }
});

// ── 엑셀 업로드 ──
// 시트: "26년 X월" 패턴
// 헤더: row 0~3 (4행), 데이터: row 4부터
// row 4는 합계 행 → 생산일자가 유효한 숫자(엑셀 시리얼)인 행만 처리
// 컬럼 (0-based):
//   0:생산일자, 1:호기, 2:bnk LOT, 3:상지lot, 4:표지lot
//   5:차종, 6:칼라, 7:부위, 8:규격, 9:시트수량
//   10:Foam LOT, 11:(빈칸), 12:FOAM입고수량, 13:엠보롤, 14:폭
//   15:엠보생산량, 16:수율
//   17:광택 (26년 2월~, 1월 없음), 18:두께 (26년 2월~)
//   19:2폭여부, 20:총생산량, 21:롤, 22:수량, 23:실사용량, 24:비고
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const uploadedBy = String(req.body.uploadedBy || '').trim() || null;
    const replaceMode = String(req.body.replace || 'false') === 'true';

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    // "26년 X월" 패턴 시트 전부 처리
    const targetSheets = wb.SheetNames.filter((n) => /\d{2}년\s*\d{1,2}월/.test(n));
    if (targetSheets.length === 0) {
      return res.status(400).json({ error: '"26년 X월" 형식의 시트를 찾을 수 없습니다.' });
    }

    const pool = getPool();
    const allValues = [];
    const skippedKeys = [];
    const dateSet = new Set();
    let totalSheets = 0;

    for (const sheetName of targetSheets) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      totalSheets++;

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      // 데이터는 row 4(index 4)부터. row 4는 합계행이므로 생산일자가 날짜 시리얼인 경우만 처리
      for (let i = 4; i < rows.length; i++) {
        const r = rows[i] || [];
        const rawDate = r[0];
        const prodDate = excelSerialToDate(rawDate);
        if (!prodDate) {
          const anyVal = r.slice(0, 25).some((v) => v !== '' && v != null);
          if (anyVal) skippedKeys.push({ row: i + 1, sheet: sheetName, reason: '생산일자 파싱 실패', rawDate });
          continue;
        }

        // 26년 1월은 컬럼 수가 적어 광택(17)/두께(18) 없음
        const hasGlossThickness = r.length > 18;

        let colOffset = 0; // 1월(컬럼수 적음)에서 17번 이후 컬럼이 당겨짐
        const gloss = hasGlossThickness ? (r[17] ? String(r[17]).trim() : null) : null;
        const thickness = hasGlossThickness ? parseNum(r[18]) : null;
        // 광택/두께 없으면 이후 컬럼이 2칸 앞으로
        colOffset = hasGlossThickness ? 0 : -2;

        const col = (base) => r[base + (base >= 19 ? colOffset : 0)];

        allValues.push([
          prodDate,
          r[1] ? String(r[1]).trim() : null,   // machine_no
          r[2] ? String(r[2]).trim() : null,   // bnk_lot
          r[3] ? String(r[3]).trim() : null,   // top_lot
          r[4] ? String(r[4]).trim() : null,   // cover_lot
          r[5] ? normVehicle(r[5]) : null,     // vehicle
          r[6] ? String(r[6]).toUpperCase().trim() : null, // color
          r[7] ? String(r[7]).trim() : null,   // part
          r[8] ? String(r[8]).trim() : null,   // spec
          parseInt32(r[9]),                    // sheet_qty
          r[10] ? String(r[10]).trim() : null, // foam_lot
          parseInt32(r[12]),                   // foam_in_qty (col 11 빈칸)
          r[13] ? String(r[13]).trim() : null, // emboss_roll
          r[14] ? String(r[14]).trim() : null, // width
          parseInt32(r[15]),                   // emboss_qty
          parseNum(r[16]),                     // yield_rate
          gloss,
          thickness,
          col(19) ? String(col(19)).trim() : null, // double_width
          parseInt32(col(20)),                  // total_qty
          parseInt32(col(21)),                  // roll_qty
          parseInt32(col(22)),                  // count_qty
          parseInt32(col(23)),                  // actual_usage
          col(24) ? String(col(24)).trim() : null, // memo
          uploadedBy,
          uploadedBy,
        ]);
        dateSet.add(prodDate);
      }
    }

    if (allValues.length === 0) {
      return res.status(400).json({ error: '저장 가능한 데이터가 없습니다.', skipped: skippedKeys.length });
    }

    if (replaceMode && dateSet.size > 0) {
      await pool.query(
        `UPDATE production_emboss SET deleted = 'Y' WHERE deleted = 'N' AND prod_date IN (?)`,
        [[...dateSet]],
      );
    }

    const CHUNK = 1000;
    let inserted = 0;
    for (let i = 0; i < allValues.length; i += CHUNK) {
      const chunk = allValues.slice(i, i + CHUNK);
      const [r] = await pool.query(
        `INSERT INTO production_emboss
         (prod_date, machine_no, bnk_lot, top_lot, cover_lot,
          vehicle, color, part, spec, sheet_qty,
          foam_lot, foam_in_qty, emboss_roll, width,
          emboss_qty, yield_rate, gloss, thickness,
          double_width, total_qty, roll_qty, count_qty, actual_usage,
          memo, created_by, updated_by)
         VALUES ?`,
        [chunk],
      );
      inserted += r.affectedRows;
    }

    const { vehicles, colors } = await getMasterMaps();
    let mismatchVehicle = 0, mismatchColor = 0;
    const unmatchedVehicles = new Set();
    const unmatchedColors = new Set();
    for (const v of allValues) {
      const vv = v[5]; // vehicle
      const cc = v[6]; // color
      if (vv && !vehicles.has(String(vv).toUpperCase())) { mismatchVehicle++; unmatchedVehicles.add(vv); }
      if (cc && !colors.has(String(cc).toUpperCase())) { mismatchColor++; unmatchedColors.add(cc); }
    }

    res.json({
      ok: true,
      sheets: targetSheets,
      totalSheets,
      inserted,
      skipped: skippedKeys.length,
      skippedSamples: skippedKeys.slice(0, 5),
      dateCount: dateSet.size,
      replace: replaceMode,
      mismatch: {
        vehicle: mismatchVehicle,
        vehicleList: [...unmatchedVehicles].slice(0, 20),
        color: mismatchColor,
        colorList: [...unmatchedColors].slice(0, 20),
      },
    });
  } catch (err) {
    logger.error('production-emboss upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '업로드 실패: ' + err.message });
  }
});

export default router;
