/**
 * 재단 생산 실적
 * - 조회(날짜 범위), 생성/수정/삭제
 * - 엑셀 업로드 (시트: "1월", "2월", ... 패턴)
 * - 헤더 4행(row 0~3), 데이터 row 4부터 (합계행 없음)
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

const SELECT_COLS = `
  id, DATE_FORMAT(prod_date, '%Y-%m-%d') AS prod_date,
  machine_no, cut_lot, bnk_lot, sheet_lot, cover_lot, foam_lot, foam_back_lot,
  vehicle, part, color, emboss, spec,
  width_check, length_check, single_double,
  label_qty, real_qty, in_qty, input_remain, cut_qty, remain_qty,
  cal_pigment, cal_line, cal_other,
  foam_defect, top_knife_mark, top_flow_mark,
  emb_width_minor, emb_roll_mark, emb_oil_mark, emb_contamination,
  emb_wrinkle, emb_chew, emb_wind, emb_connect,
  cut_foreign, cut_length_defect,
  defect_subtotal, missing_qty, final_defect_m,
  memo, created_by, updated_by,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at`;

const INSERT_COLS = `
  prod_date, machine_no, cut_lot, bnk_lot, sheet_lot, cover_lot, foam_lot, foam_back_lot,
  vehicle, part, color, emboss, spec,
  width_check, length_check, single_double,
  label_qty, real_qty, in_qty, input_remain, cut_qty, remain_qty,
  cal_pigment, cal_line, cal_other,
  foam_defect, top_knife_mark, top_flow_mark,
  emb_width_minor, emb_roll_mark, emb_oil_mark, emb_contamination,
  emb_wrinkle, emb_chew, emb_wind, emb_connect,
  cut_foreign, cut_length_defect,
  defect_subtotal, missing_qty, final_defect_m,
  memo, created_by, updated_by`;

const INSERT_PLACEHOLDERS = '(' + new Array(45).fill('?').join(', ') + ')';

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
      `SELECT ${SELECT_COLS}
       FROM production_cutting
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
    logger.error('production-cutting list error', { error: err.message });
    res.status(500).json({ error: '조회 실패: ' + err.message });
  }
});

function rowToValues(b, uploadedBy) {
  return [
    b.prod_date,
    b.machine_no || null,
    b.cut_lot || null,
    b.bnk_lot || null,
    b.sheet_lot || null,
    b.cover_lot || null,
    b.foam_lot || null,
    b.foam_back_lot || null,
    b.vehicle ? normVehicle(b.vehicle) : null,
    b.part || null,
    b.color ? String(b.color).toUpperCase().trim() : null,
    b.emboss || null,
    b.spec || null,
    parseNum(b.width_check),
    parseNum(b.length_check),
    parseInt32(b.single_double),
    parseInt32(b.label_qty),
    parseInt32(b.real_qty),
    parseNum(b.in_qty),
    parseNum(b.input_remain),
    parseInt32(b.cut_qty),
    parseNum(b.remain_qty),
    parseInt32(b.cal_pigment),
    parseInt32(b.cal_line),
    parseInt32(b.cal_other),
    parseInt32(b.foam_defect),
    parseInt32(b.top_knife_mark),
    parseInt32(b.top_flow_mark),
    parseInt32(b.emb_width_minor),
    parseInt32(b.emb_roll_mark),
    parseInt32(b.emb_oil_mark),
    parseInt32(b.emb_contamination),
    parseInt32(b.emb_wrinkle),
    parseInt32(b.emb_chew),
    parseInt32(b.emb_wind),
    parseInt32(b.emb_connect),
    parseInt32(b.cut_foreign),
    parseInt32(b.cut_length_defect),
    parseInt32(b.defect_subtotal),
    parseNum(b.missing_qty),
    parseNum(b.final_defect_m),
    b.memo || null,
    uploadedBy,
    uploadedBy,
  ];
}

// ── 단건 생성 ──
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const prodDate = String(b.prod_date || '').trim();
    if (!prodDate) return res.status(400).json({ error: '재단일자는 필수입니다.' });
    const pool = getPool();
    const values = rowToValues({ ...b, prod_date: prodDate }, b.created_by || null);
    const [result] = await pool.query(
      `INSERT INTO production_cutting (${INSERT_COLS}) VALUES ${INSERT_PLACEHOLDERS}`,
      values,
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    logger.error('production-cutting create error', { error: err.message });
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
    maybe('cut_lot', b.cut_lot ?? null);
    maybe('bnk_lot', b.bnk_lot ?? null);
    maybe('sheet_lot', b.sheet_lot ?? null);
    maybe('cover_lot', b.cover_lot ?? null);
    maybe('foam_lot', b.foam_lot ?? null);
    maybe('foam_back_lot', b.foam_back_lot ?? null);
    maybe('vehicle', b.vehicle, (v) => (v ? normVehicle(v) : null));
    maybe('part', b.part ?? null);
    maybe('color', b.color, (v) => (v ? String(v).toUpperCase().trim() : null));
    maybe('emboss', b.emboss ?? null);
    maybe('spec', b.spec ?? null);
    maybe('width_check', b.width_check, parseNum);
    maybe('length_check', b.length_check, parseNum);
    maybe('single_double', b.single_double, parseInt32);
    maybe('label_qty', b.label_qty, parseInt32);
    maybe('real_qty', b.real_qty, parseInt32);
    maybe('in_qty', b.in_qty, parseNum);
    maybe('input_remain', b.input_remain, parseNum);
    maybe('cut_qty', b.cut_qty, parseInt32);
    maybe('remain_qty', b.remain_qty, parseNum);
    maybe('cal_pigment', b.cal_pigment, parseInt32);
    maybe('cal_line', b.cal_line, parseInt32);
    maybe('cal_other', b.cal_other, parseInt32);
    maybe('foam_defect', b.foam_defect, parseInt32);
    maybe('top_knife_mark', b.top_knife_mark, parseInt32);
    maybe('top_flow_mark', b.top_flow_mark, parseInt32);
    maybe('emb_width_minor', b.emb_width_minor, parseInt32);
    maybe('emb_roll_mark', b.emb_roll_mark, parseInt32);
    maybe('emb_oil_mark', b.emb_oil_mark, parseInt32);
    maybe('emb_contamination', b.emb_contamination, parseInt32);
    maybe('emb_wrinkle', b.emb_wrinkle, parseInt32);
    maybe('emb_chew', b.emb_chew, parseInt32);
    maybe('emb_wind', b.emb_wind, parseInt32);
    maybe('emb_connect', b.emb_connect, parseInt32);
    maybe('cut_foreign', b.cut_foreign, parseInt32);
    maybe('cut_length_defect', b.cut_length_defect, parseInt32);
    maybe('defect_subtotal', b.defect_subtotal, parseInt32);
    maybe('missing_qty', b.missing_qty, parseNum);
    maybe('final_defect_m', b.final_defect_m, parseNum);
    maybe('memo', b.memo ?? null);
    if (b.updated_by !== undefined) { fields.push('updated_by = ?'); params.push(b.updated_by || null); }
    if (fields.length === 0) return res.json({ ok: true, changed: 0 });
    params.push(id);
    const [result] = await pool.query(
      `UPDATE production_cutting SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
    res.json({ ok: true, changed: result.affectedRows });
  } catch (err) {
    logger.error('production-cutting update error', { error: err.message });
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
      `UPDATE production_cutting SET deleted = 'Y' WHERE id = ?`,
      [id],
    );
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) {
    logger.error('production-cutting delete error', { error: err.message });
    res.status(500).json({ error: '삭제 실패: ' + err.message });
  }
});

// ── 엑셀 업로드 ──
// 시트: "1월", "2월", ... 패턴 (숫자월)
// 헤더: row 0~3, 데이터: row 4부터 (합계행 없음)
// 컬럼 (0-based):
//   0:설비, 1:재단일자, 2:재단LOT, 3:BnK LOT, 4:시트LOT, 5:표지LOT, 6:폼LOT, 7:폼이면LOT
//   8:차종, 9:부위, 10:색상, 11:엠보, 12:양산규격
//   13:폭확인, 14:길이확인, 15:단폭/두폭
//   16:라벨(ea), 17:실갯수(ea), 18:입고(m), 19:투입잔량, 20:재단(ea), 21:남은잔량
//   22:CAL 안료, 23:CAL 경선, 24:CAL 기타
//   25:폼 불량, 26:표지 칼줄, 27:표지 흐름자국
//   28:엠보 폭미미, 29:롤자국, 30:오일자국, 31:오염, 32:구김, 33:씹힘, 34:바람, 35:연결
//   36:재단 이물, 37:재단 길이불량
//   38:소계(ea), 39:누락수량(ea), 40:최종불량수량(m), 41:비고
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const uploadedBy = String(req.body.uploadedBy || '').trim() || null;
    const replaceMode = String(req.body.replace || 'false') === 'true';

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    // "N월" 패턴 시트 전부 처리
    const targetSheets = wb.SheetNames.filter((n) => /^\s*\d{1,2}\s*월\s*$/.test(n));
    if (targetSheets.length === 0) {
      return res.status(400).json({ error: '"N월" 형식의 시트를 찾을 수 없습니다.' });
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
      // 데이터는 row 4(index 4)부터, 합계행 없음 → 재단일자가 유효한 시리얼인 행만 처리
      for (let i = 4; i < rows.length; i++) {
        const r = rows[i] || [];
        const rawDate = r[1]; // 재단일자
        const prodDate = excelSerialToDate(rawDate);
        if (!prodDate) {
          const anyVal = r.slice(0, 42).some((v) => v !== '' && v != null);
          if (anyVal) skippedKeys.push({ row: i + 1, sheet: sheetName, reason: '재단일자 파싱 실패', rawDate });
          continue;
        }

        allValues.push(rowToValues({
          prod_date: prodDate,
          machine_no: r[0],
          cut_lot: r[2],
          bnk_lot: r[3],
          sheet_lot: r[4],
          cover_lot: r[5],
          foam_lot: r[6],
          foam_back_lot: r[7],
          vehicle: r[8],
          part: r[9],
          color: r[10],
          emboss: r[11],
          spec: r[12],
          width_check: r[13],
          length_check: r[14],
          single_double: r[15],
          label_qty: r[16],
          real_qty: r[17],
          in_qty: r[18],
          input_remain: r[19],
          cut_qty: r[20],
          remain_qty: r[21],
          cal_pigment: r[22],
          cal_line: r[23],
          cal_other: r[24],
          foam_defect: r[25],
          top_knife_mark: r[26],
          top_flow_mark: r[27],
          emb_width_minor: r[28],
          emb_roll_mark: r[29],
          emb_oil_mark: r[30],
          emb_contamination: r[31],
          emb_wrinkle: r[32],
          emb_chew: r[33],
          emb_wind: r[34],
          emb_connect: r[35],
          cut_foreign: r[36],
          cut_length_defect: r[37],
          defect_subtotal: r[38],
          missing_qty: r[39],
          final_defect_m: r[40],
          memo: r[41] ? String(r[41]).trim() : null,
        }, uploadedBy));
        dateSet.add(prodDate);
      }
    }

    if (allValues.length === 0) {
      return res.status(400).json({ error: '저장 가능한 데이터가 없습니다.', skipped: skippedKeys.length });
    }

    if (replaceMode && dateSet.size > 0) {
      await pool.query(
        `UPDATE production_cutting SET deleted = 'Y' WHERE deleted = 'N' AND prod_date IN (?)`,
        [[...dateSet]],
      );
    }

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < allValues.length; i += CHUNK) {
      const chunk = allValues.slice(i, i + CHUNK);
      const [r] = await pool.query(
        `INSERT INTO production_cutting (${INSERT_COLS}) VALUES ?`,
        [chunk],
      );
      inserted += r.affectedRows;
    }

    const { vehicles, colors } = await getMasterMaps();
    let mismatchVehicle = 0, mismatchColor = 0;
    const unmatchedVehicles = new Set();
    const unmatchedColors = new Set();
    for (const v of allValues) {
      const vv = v[8];  // vehicle
      const cc = v[10]; // color
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
    logger.error('production-cutting upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: '업로드 실패: ' + err.message });
  }
});

export default router;
