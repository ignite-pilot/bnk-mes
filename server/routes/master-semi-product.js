import express, { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { getAllCodeMaps } from '../lib/config-codes.js';
import { parseCsv } from '../lib/csv-parse.js';

const router = Router();
const TABLE = 'master_semi_products';

const SEMI_TYPES = ['상지', '표지', '하지', '폼', '프라이머'];

const LIST_SELECT = `SELECT id, semi_type, vehicle_code, vehicle_name, part_code, part_name,
  color_code, color_name, supplier, thickness, width, ratio, safety_stock,
  created_at, updated_at, created_by, updated_by
  FROM \`${TABLE}\``;

export const listHandler = async (req, res) => {
  try {
    const { semiType = '', vehicleCode = '', partCode = '', colorCode = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE deleted = ?';
    const params = ['N'];
    if (semiType) { where += ' AND semi_type = ?'; params.push(semiType); }
    if (vehicleCode) { where += ' AND vehicle_code = ?'; params.push(vehicleCode); }
    if (partCode) { where += ' AND part_code = ?'; params.push(partCode); }
    if (colorCode) { where += ' AND color_code = ?'; params.push(colorCode); }

    const [rows] = await getPool().query(`${LIST_SELECT} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limitNum, offset]);
    const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM \`${TABLE}\` ${where}`, params);
    res.json({ list: rows || [], total: Number(total), page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('master-sp list error', { error: err.message });
    res.status(500).json({ error: '목록 조회에 실패했습니다.' });
  }
};

export const templateDownload = (req, res) => {
  const BOM = '\uFEFF';
  const header = '반제품종류(상지/표지/하지/폼/프라이머),업체,차종코드,차종명,적용부코드,적용부명,색상코드,색상명,두께,폭,배율\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="semi_products_template.csv"');
  res.send(BOM + header);
};

export const exportExcel = async (req, res) => {
  try {
    const { semiType = '', vehicleCode = '', partCode = '', colorCode = '' } = req.query;
    let where = 'WHERE deleted = ?';
    const params = ['N'];
    if (semiType) { where += ' AND semi_type = ?'; params.push(semiType); }
    if (vehicleCode) { where += ' AND vehicle_code = ?'; params.push(vehicleCode); }
    if (partCode) { where += ' AND part_code = ?'; params.push(partCode); }
    if (colorCode) { where += ' AND color_code = ?'; params.push(colorCode); }

    const [rows] = await getPool().query(`${LIST_SELECT} ${where} ORDER BY id DESC`, params);

    const BOM = '\uFEFF';
    const header = '반제품종류,업체,차종코드,차종명,적용부코드,적용부명,색상코드,색상명,두께,폭,배율,등록일자,수정일자,등록자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = (rows || []).map((r) => [
      toCsvCell(r.semi_type), toCsvCell(r.supplier),
      toCsvCell(r.vehicle_code), toCsvCell(r.vehicle_name),
      toCsvCell(r.part_code), toCsvCell(r.part_name),
      toCsvCell(r.color_code), toCsvCell(r.color_name),
      toCsvCell(r.thickness), toCsvCell(r.width), toCsvCell(r.ratio),
      toCsvCell(r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
      toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
      toCsvCell(r.created_by), toCsvCell(r.updated_by),
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="master_semi_products.csv"');
    res.send(BOM + header + body);
  } catch (err) {
    logger.error('master-sp export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
};

router.get('/types', (_req, res) => {
  res.json({ list: SEMI_TYPES.map((t, i) => ({ id: i + 1, name: t })) });
});

router.post('/upload', express.text({ type: '*/*', limit: '5mb' }), async (req, res) => {
  try {
    const createdBy = req.query.createdBy || 'upload';
    const { headers, rows } = parseCsv(req.body);
    if (rows.length === 0) return res.status(400).json({ error: '업로드할 데이터가 없습니다.' });

    const { vehicleMap, partMap, colorMap } = await getAllCodeMaps();
    const errors = [];
    const valid = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const [semiType, supplier, vehicleCode, vehicleName, partCode, partName, colorCode, colorName, thickness, width, ratio] = r;

      const rowErrors = [];
      const st = semiType?.trim() || '';
      if (!SEMI_TYPES.includes(st)) {
        rowErrors.push(`반제품종류 "${st}" 없음 (${SEMI_TYPES.join('/')})`);
      }

      let vc = vehicleCode?.trim() || null;
      let vn = vehicleName?.trim() || null;
      if (vc && !vehicleMap[vc]) {
        rowErrors.push(`차종코드 "${vc}" 없음`);
      } else if (vc) { vn = vehicleMap[vc]; }

      let pc = partCode?.trim() || null;
      let pn = partName?.trim() || null;
      if (pc && !partMap[pc]) {
        rowErrors.push(`적용부코드 "${pc}" 없음`);
      } else if (pc) { pn = partMap[pc]; }

      let cc = colorCode?.trim() || null;
      let cn = colorName?.trim() || null;
      if (cc && !colorMap[cc]) {
        rowErrors.push(`색상코드 "${cc}" 없음`);
      } else if (cc) { cn = colorMap[cc]; }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, semiType: st || '(빈값)', errors: rowErrors });
      } else {
        valid.push([
          st, vc, vn, pc, pn, cc, cn,
          supplier?.trim() || null,
          thickness ? Number(thickness) : null, width ? Number(width) : null,
          ratio ? Number(ratio) : null,
          createdBy, createdBy,
        ]);
      }
    }

    let inserted = 0;
    if (valid.length > 0) {
      const [result] = await getPool().query(
        `INSERT INTO \`${TABLE}\` (semi_type, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, supplier, thickness, width, ratio, created_by, updated_by) VALUES ?`,
        [valid]
      );
      inserted = result.affectedRows;
    }

    res.json({ inserted, errors, totalRows: rows.length });
  } catch (err) {
    logger.error('master-sp upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: `업로드에 실패했습니다: ${err.message}` });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(`${LIST_SELECT} WHERE id = ? AND deleted = ?`, [id, 'N']);
    if (!rows.length) return res.status(404).json({ error: '반제품을 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    logger.error('master-sp get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { semi_type, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, supplier, thickness, width, ratio, safety_stock, createdBy } = req.body || {};
    if (!createdBy) return res.status(400).json({ error: '등록자는 필수입니다.' });
    if (!semi_type) return res.status(400).json({ error: '반제품 종류는 필수입니다.' });

    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (semi_type, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, supplier, thickness, width, ratio, safety_stock, created_by, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [semi_type, vehicle_code||null, vehicle_name||null, part_code||null, part_name||null, color_code||null, color_name||null, supplier||null,
       thickness!=null?Number(thickness):null, width!=null?Number(width):null, ratio!=null?Number(ratio):null,
       safety_stock!=null?Number(safety_stock):null,
       String(createdBy).trim(), String(createdBy).trim()]
    );
    const [rows] = await getPool().query(`${LIST_SELECT} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('master-sp create error', { error: err.message });
    res.status(500).json({ error: '등록에 실패했습니다.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const b = req.body || {};
    const [existing] = await getPool().query(`SELECT id FROM \`${TABLE}\` WHERE id=? AND deleted='N'`, [id]);
    if (!existing.length) return res.status(404).json({ error: '반제품을 찾을 수 없습니다.' });

    const fields = ['semi_type','vehicle_code','vehicle_name','part_code','part_name','color_code','color_name','supplier'];
    const numFields = ['thickness','width','ratio','safety_stock'];
    const updates = []; const params = [];
    for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f}=?`); params.push(b[f]||null); } }
    for (const f of numFields) { if (b[f] !== undefined) { updates.push(`${f}=?`); params.push(b[f]!=null?Number(b[f]):null); } }
    if (b.updatedBy) { updates.push('updated_by=?'); params.push(String(b.updatedBy).trim()); }
    if (!updates.length) return res.status(400).json({ error: '수정할 항목이 없습니다.' });

    params.push(id);
    await getPool().query(`UPDATE \`${TABLE}\` SET ${updates.join(',')} WHERE id=? AND deleted='N'`, params);
    const [rows] = await getPool().query(`${LIST_SELECT} WHERE id=?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    logger.error('master-sp update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const updatedBy = req.body?.updatedBy || null;
    const [result] = await getPool().query(`UPDATE \`${TABLE}\` SET deleted='Y', updated_by=? WHERE id=? AND deleted='N'`, [updatedBy, id]);
    if (!result.affectedRows) return res.status(404).json({ error: '반제품을 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('master-sp delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
