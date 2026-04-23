/**
 * 원자재 정보 API (원자재.md 규칙)
 * - 원자재 종류(material_types) 연동, 목록(검색), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 */
import express, { Router } from 'express';
import { sendXlsx, buildXlsxFilename } from '../lib/excel-export.js';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { getAllCodeMaps } from '../lib/config-codes.js';
import { parseCsv } from '../lib/csv-parse.js';

const router = Router();
const TABLE = 'raw_materials';
const TYPES_TABLE = 'material_types';

const LIST_SELECT = `SELECT rm.id, rm.kind_id, mt.name AS kind, rm.code, rm.name, rm.color,
  rm.vehicle_code, rm.vehicle_name, rm.part_code, rm.part_name, rm.color_code,
  rm.thickness, rm.width, rm.\`length\`,
  rm.supplier_safety_stock, rm.bnk_warehouse_safety_stock,
  rm.created_at, rm.updated_at, rm.created_by, rm.updated_by
  FROM \`${TABLE}\` rm
  INNER JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id`;

router.get('/types', async (req, res) => {
  try {
    const [rows] = await getPool().query(`SELECT id, name, sort_order FROM \`${TYPES_TABLE}\` ORDER BY sort_order ASC, id ASC`);
    res.json({ list: rows || [] });
  } catch (err) {
    logger.error('material types error', { error: err.message });
    res.status(500).json({ error: '원자재 종류 조회에 실패했습니다.' });
  }
});

router.get('/template', async (req, res) => {
  try {
    const XLSX = (await import('xlsx')).default;
    const { getAllCodeMaps } = await import('../lib/config-codes.js');
    const { vehicleMap, partMap, colorMap } = await getAllCodeMaps();

    const wb = XLSX.utils.book_new();
    const templateData = [['원자재 종류(상지/폼/프라이머)','자재코드','원자재 이름','차종코드','차종명','적용부코드','적용부명','색상코드','색상','두께(mm)','폭(mm)','길이(mm)','원자재 업체 안전재고 수량','비엔케이 창고 안전재고 수량']];
    const ws1 = XLSX.utils.aoa_to_sheet(templateData);
    ws1['!cols'] = templateData[0].map(() => ({ wch: 14 }));
    ws1['!cols'][0] = { wch: 30 };
    XLSX.utils.book_append_sheet(wb, ws1, '업로드양식');

    const vehicleEntries = Object.entries(vehicleMap);
    const partEntries = Object.entries(partMap);
    const colorEntries = Object.entries(colorMap);
    const maxLen = Math.max(vehicleEntries.length, partEntries.length, colorEntries.length);
    const refData = [['차종코드', '차종명', '', '적용부코드', '적용부명', '', '색상코드', '색상명']];
    for (let i = 0; i < maxLen; i++) {
      refData.push([vehicleEntries[i]?.[0] || '', vehicleEntries[i]?.[1] || '', '', partEntries[i]?.[0] || '', partEntries[i]?.[1] || '', '', colorEntries[i]?.[0] || '', colorEntries[i]?.[1] || '']);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(refData);
    ws2['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 3 }, { wch: 22 }, { wch: 22 }, { wch: 3 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, '코드참조');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fn = encodeURIComponent(buildXlsxFilename('원자재정보_템플릿'));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"; filename*=UTF-8''${fn}`);
    res.send(buf);
  } catch (err) {
    logger.error('material template error', { error: err.message });
    res.status(500).json({ error: '템플릿 다운로드 실패' });
  }
});

router.post('/upload', express.text({ type: '*/*', limit: '5mb' }), async (req, res) => {
  try {
    const createdBy = req.query.createdBy || 'upload';
    const { headers, rows } = parseCsv(req.body);
    if (rows.length === 0) return res.status(400).json({ error: '업로드할 데이터가 없습니다.' });

    const { vehicleMap, partMap, colorMap } = await getAllCodeMaps();

    // 원자재 종류 맵 (name → id)
    const [typeRows] = await getPool().query(`SELECT id, name FROM \`${TYPES_TABLE}\``);
    const typeMap = {};
    for (const t of typeRows) typeMap[t.name] = t.id;

    const errors = [];
    const valid = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // 헤더가 1행이므로
      const [kindName, code, name, vehicleCode, vehicleName, partCode, partName, colorCode, color, thickness, width, length, sss, bss] = r;

      const rowErrors = [];
      if (!name) rowErrors.push('원자재 이름 누락');

      let kindId = null;
      if (kindName) {
        kindId = typeMap[kindName.trim()];
        if (!kindId) rowErrors.push(`원자재 종류 "${kindName}" 없음`);
      } else {
        rowErrors.push('원자재 종류 누락');
      }

      let validVehicleCode = vehicleCode?.trim() || null;
      let validVehicleName = vehicleName?.trim() || null;
      if (validVehicleCode && !vehicleMap[validVehicleCode]) {
        rowErrors.push(`차종코드 "${validVehicleCode}" 없음`);
      } else if (validVehicleCode) {
        validVehicleName = vehicleMap[validVehicleCode];
      }

      let validPartCode = partCode?.trim() || null;
      let validPartName = partName?.trim() || null;
      if (validPartCode && !partMap[validPartCode]) {
        rowErrors.push(`적용부코드 "${validPartCode}" 없음`);
      } else if (validPartCode) {
        validPartName = partMap[validPartCode];
      }

      let validColorCode = colorCode?.trim() || null;
      let validColor = color?.trim() || null;
      if (validColorCode && !colorMap[validColorCode]) {
        rowErrors.push(`색상코드 "${validColorCode}" 없음`);
      } else if (validColorCode) {
        validColor = colorMap[validColorCode];
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, name: name || '(빈값)', errors: rowErrors });
      } else {
        valid.push([
          kindId, code?.trim() || null, name.trim(), color?.trim() || validColor,
          validVehicleCode, validVehicleName, validPartCode, validPartName, validColorCode,
          thickness ? Number(thickness) : null, width ? Number(width) : null, length ? Number(length) : null,
          sss ? Number(sss) : null, bss ? Number(bss) : null,
          createdBy, createdBy,
        ]);
      }
    }

    let inserted = 0;
    if (valid.length > 0) {
      const [result] = await getPool().query(
        `INSERT INTO \`${TABLE}\` (kind_id, code, name, color, vehicle_code, vehicle_name, part_code, part_name, color_code, thickness, width, \`length\`, supplier_safety_stock, bnk_warehouse_safety_stock, created_by, updated_by) VALUES ?`,
        [valid]
      );
      inserted = result.affectedRows;
    }

    res.json({ inserted, errors, totalRows: rows.length });
  } catch (err) {
    logger.error('material upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: `업로드에 실패했습니다: ${err.message}` });
  }
});

router.get('/export-excel', async (req, res) => {
  try {
    const { kindId = '', name = '', vehicleCode = '' } = req.query;
    let where = 'WHERE rm.deleted = ?';
    const params = ['N'];
    const kindIdNum = parseInt(kindId, 10);
    if (!Number.isNaN(kindIdNum) && kindIdNum > 0) {
      where += ' AND rm.kind_id = ?';
      params.push(kindIdNum);
    }
    if (name && String(name).trim()) {
      where += ' AND rm.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (vehicleCode && String(vehicleCode).trim()) {
      where += ' AND rm.vehicle_code = ?';
      params.push(String(vehicleCode).trim());
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY rm.id DESC`,
      params
    );

    const fmtDt = (v) => v ? new Date(v).toISOString().slice(0, 19).replace('T', ' ') : '';
    const headers = [['원자재 종류','자재코드','원자재 이름','색상','색상코드','차종코드','차종명','적용부코드','적용부명','두께 (mm)','폭 (mm)','길이 (mm)','원자재 업체 안전재고 수량','비엔케이 창고 안전재고 수량','등록일자','수정일자','등록자','수정자']];
    const data = (rows || []).map(r => [r.kind, r.code, r.name, r.color, r.color_code, r.vehicle_code, r.vehicle_name, r.part_code, r.part_name, r.thickness, r.width, r.length, r.supplier_safety_stock, r.bnk_warehouse_safety_stock, fmtDt(r.created_at), fmtDt(r.updated_at), r.created_by, r.updated_by]);
    sendXlsx(res, headers, data, '원자재정보');
  } catch (err) {
    logger.error('material export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { kindId = '', name = '', vehicleCode = '', page = 1, limit = 20 } = req.query;
    const maxLimit = parseInt(limit, 10) > 100 ? 2000 : 100;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(maxLimit, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(maxLimit, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE rm.deleted = ?';
    const params = ['N'];
    const kindIdNum = parseInt(kindId, 10);
    if (!Number.isNaN(kindIdNum) && kindIdNum > 0) {
      where += ' AND rm.kind_id = ?';
      params.push(kindIdNum);
    }
    if (name && String(name).trim()) {
      where += ' AND rm.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (vehicleCode && String(vehicleCode).trim()) {
      where += ' AND rm.vehicle_code = ?';
      params.push(String(vehicleCode).trim());
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY rm.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [[{ total }]] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` rm ${where}`,
      params
    );
    res.json({ list: rows || [], total: Number(total), page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('material list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE rm.id = ? AND rm.deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '원자재를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    logger.error('material get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      kind_id,
      code = null,
      name,
      color = null,
      vehicle_code = null,
      vehicle_name = null,
      part_code = null,
      part_name = null,
      color_code = null,
      thickness = null,
      width = null,
      length = null,
      supplier_safety_stock = null,
      bnk_warehouse_safety_stock = null,
      createdBy = null,
    } = req.body || {};

    if (kind_id == null || Number.isNaN(parseInt(kind_id, 10))) {
      return res.status(400).json({ error: '원자재 종류는 필수입니다.' });
    }
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '원자재 이름은 필수입니다.' });
    }
    if (createdBy == null || String(createdBy).trim() === '') {
      return res.status(400).json({ error: '등록자는 필수입니다.' });
    }

    const nameTrimmed = String(name).trim();
    const [dup] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE name = ? AND deleted = 'N'`,
      [nameTrimmed]
    );
    if (dup.length) return res.status(409).json({ error: '이미 사용 중인 원자재 이름입니다.' });

    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (kind_id, code, name, color, vehicle_code, vehicle_name, part_code, part_name, color_code, thickness, width, \`length\`, supplier_safety_stock, bnk_warehouse_safety_stock, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(kind_id, 10),
        code != null ? String(code).trim() : null,
        nameTrimmed,
        color != null ? String(color).trim() : null,
        vehicle_code != null ? String(vehicle_code).trim() : null,
        vehicle_name != null ? String(vehicle_name).trim() : null,
        part_code != null ? String(part_code).trim() : null,
        part_name != null ? String(part_name).trim() : null,
        color_code != null ? String(color_code).trim() : null,
        thickness != null ? Number(thickness) : null,
        width != null ? Number(width) : null,
        length != null ? Number(length) : null,
        supplier_safety_stock != null ? Number(supplier_safety_stock) : null,
        bnk_warehouse_safety_stock != null ? Number(bnk_warehouse_safety_stock) : null,
        String(createdBy).trim(),
        String(createdBy).trim(),
      ]
    );
    const [rows] = await getPool().query(`${LIST_SELECT} WHERE rm.id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('material create error', { error: err.message });
    res.status(500).json({ error: '등록에 실패했습니다.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const { name, code, vehicle_code, vehicle_name, part_code, part_name, color_code, color, kind_id, thickness, width, length, supplier_safety_stock, bnk_warehouse_safety_stock, updatedBy } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '원자재를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '원자재 이름은 필수입니다.' });
      const [dup] = await getPool().query(
        `SELECT id FROM \`${TABLE}\` WHERE name = ? AND deleted = 'N' AND id != ?`,
        [String(name).trim(), id]
      );
      if (dup.length) return res.status(409).json({ error: '이미 사용 중인 원자재 이름입니다.' });
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (code !== undefined) { updates.push('code = ?'); params.push(code != null ? String(code).trim() : null); }
    if (kind_id !== undefined) { updates.push('kind_id = ?'); params.push(parseInt(kind_id, 10)); }
    if (color !== undefined) { updates.push('color = ?'); params.push(color != null ? String(color).trim() : null); }
    if (vehicle_code !== undefined) { updates.push('vehicle_code = ?'); params.push(vehicle_code != null ? String(vehicle_code).trim() : null); }
    if (vehicle_name !== undefined) { updates.push('vehicle_name = ?'); params.push(vehicle_name != null ? String(vehicle_name).trim() : null); }
    if (part_code !== undefined) { updates.push('part_code = ?'); params.push(part_code != null ? String(part_code).trim() : null); }
    if (part_name !== undefined) { updates.push('part_name = ?'); params.push(part_name != null ? String(part_name).trim() : null); }
    if (color_code !== undefined) { updates.push('color_code = ?'); params.push(color_code != null ? String(color_code).trim() : null); }
    if (thickness !== undefined) { updates.push('thickness = ?'); params.push(thickness != null ? Number(thickness) : null); }
    if (width !== undefined) { updates.push('width = ?'); params.push(width != null ? Number(width) : null); }
    if (length !== undefined) { updates.push('`length` = ?'); params.push(length != null ? Number(length) : null); }
    if (supplier_safety_stock !== undefined) {
      updates.push('supplier_safety_stock = ?');
      params.push(supplier_safety_stock != null ? Number(supplier_safety_stock) : null);
    }
    if (bnk_warehouse_safety_stock !== undefined) {
      updates.push('bnk_warehouse_safety_stock = ?');
      params.push(bnk_warehouse_safety_stock != null ? Number(bnk_warehouse_safety_stock) : null);
    }
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length === 0) return res.status(400).json({ error: '수정할 항목이 없습니다.' });

    params.push(id);
    await getPool().query(
      `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
      [...params, 'N']
    );
    const [rows] = await getPool().query(`${LIST_SELECT} WHERE rm.id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    logger.error('material update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '원자재를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('material delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
