/**
 * 원자재 정보 API (원자재.md 규칙)
 * - 원자재 종류(material_types) 연동, 목록(검색), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 */
import { Router } from 'express';
import pool from '../lib/db.js';
import logger from '../lib/logger.js';
import { toStartOfDayString, toEndOfDayString } from '../lib/dateUtils.js';

const router = Router();
const TABLE = 'raw_materials';
const TYPES_TABLE = 'material_types';

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start, end };
}

const LIST_SELECT = `SELECT rm.id, rm.kind_id, mt.name AS kind, rm.name, rm.color, rm.thickness, rm.width, rm.\`length\`,
  rm.supplier_safety_stock, rm.bnk_warehouse_safety_stock,
  rm.created_at, rm.updated_at, rm.created_by, rm.updated_by
  FROM \`${TABLE}\` rm
  INNER JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id`;

router.get('/types', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, name, sort_order FROM \`${TYPES_TABLE}\` ORDER BY sort_order ASC, id ASC`);
    res.json({ list: rows || [] });
  } catch (err) {
    logger.error('material types error', { error: err.message });
    res.status(500).json({ error: '원자재 종류 조회에 실패했습니다.' });
  }
});

router.get('/export-excel', async (req, res) => {
  try {
    const { kindId = '', name = '', startDate, endDate } = req.query;
    const { start, end } = defaultDateRange();
    const from = toStartOfDayString(startDate ? new Date(startDate) : start);
    const to = toEndOfDayString(endDate ? new Date(endDate) : end);

    let where = 'WHERE rm.deleted = ? AND rm.created_at >= ? AND rm.created_at <= ?';
    const params = ['N', from, to];
    const kindIdNum = parseInt(kindId, 10);
    if (!Number.isNaN(kindIdNum) && kindIdNum > 0) {
      where += ' AND rm.kind_id = ?';
      params.push(kindIdNum);
    }
    if (name && String(name).trim()) {
      where += ' AND rm.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }

    const [rows] = await pool.query(
      `${LIST_SELECT} ${where} ORDER BY rm.id DESC`,
      params
    );

    const BOM = '\uFEFF';
    const header = '원자재 종류,원자재 이름,색상,두께 (mm),폭 (mm),길이 (mm),원자재 업체 안전재고 수량,비엔케이 창고 안전재고 수량,등록일자,수정일자,등록자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = (rows || [])
      .map(
        (r) =>
          [
            toCsvCell(r.kind),
            toCsvCell(r.name),
            toCsvCell(r.color),
            toCsvCell(r.thickness),
            toCsvCell(r.width),
            toCsvCell(r.length),
            toCsvCell(r.supplier_safety_stock),
            toCsvCell(r.bnk_warehouse_safety_stock),
            toCsvCell(r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.created_by),
            toCsvCell(r.updated_by),
          ].join(',')
      )
      .join('\n');
    const csv = BOM + header + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="raw_materials.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('material export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { kindId = '', name = '', startDate, endDate, page = 1, limit = 20 } = req.query;
    const { start, end } = defaultDateRange();
    const from = toStartOfDayString(startDate ? new Date(startDate) : start);
    const to = toEndOfDayString(endDate ? new Date(endDate) : end);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE rm.deleted = ? AND rm.created_at >= ? AND rm.created_at <= ?';
    const params = ['N', from, to];
    const kindIdNum = parseInt(kindId, 10);
    if (!Number.isNaN(kindIdNum) && kindIdNum > 0) {
      where += ' AND rm.kind_id = ?';
      params.push(kindIdNum);
    }
    if (name && String(name).trim()) {
      where += ' AND rm.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }

    const [rows] = await pool.query(
      `${LIST_SELECT} ${where} ORDER BY rm.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [[{ total }]] = await pool.query(
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
    const [rows] = await pool.query(
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
      name,
      color = null,
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
    const [dup] = await pool.query(
      `SELECT id FROM \`${TABLE}\` WHERE name = ? AND deleted = 'N'`,
      [nameTrimmed]
    );
    if (dup.length) return res.status(409).json({ error: '이미 사용 중인 원자재 이름입니다.' });

    const [result] = await pool.query(
      `INSERT INTO \`${TABLE}\` (kind_id, name, color, thickness, width, \`length\`, supplier_safety_stock, bnk_warehouse_safety_stock, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(kind_id, 10),
        nameTrimmed,
        color != null ? String(color).trim() : null,
        thickness != null ? Number(thickness) : null,
        width != null ? Number(width) : null,
        length != null ? Number(length) : null,
        supplier_safety_stock != null ? Number(supplier_safety_stock) : null,
        bnk_warehouse_safety_stock != null ? Number(bnk_warehouse_safety_stock) : null,
        String(createdBy).trim(),
        String(createdBy).trim(),
      ]
    );
    const [rows] = await pool.query(`${LIST_SELECT} WHERE rm.id = ?`, [result.insertId]);
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
    const { name, supplier_safety_stock, bnk_warehouse_safety_stock, updatedBy } = req.body || {};

    const [existing] = await pool.query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '원자재를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '원자재 이름은 필수입니다.' });
      const [dup] = await pool.query(
        `SELECT id FROM \`${TABLE}\` WHERE name = ? AND deleted = 'N' AND id != ?`,
        [String(name).trim(), id]
      );
      if (dup.length) return res.status(409).json({ error: '이미 사용 중인 원자재 이름입니다.' });
      updates.push('name = ?');
      params.push(String(name).trim());
    }
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
    await pool.query(
      `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
      [...params, 'N']
    );
    const [rows] = await pool.query(`${LIST_SELECT} WHERE rm.id = ?`, [id]);
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
    const [result] = await pool.query(
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
