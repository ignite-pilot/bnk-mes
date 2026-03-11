/**
 * 원자재 공급 업체 API (원자재.md 규칙)
 * - 목록(검색: 업체 이름, 기간 default 1주), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';
import { toStartOfDayString, toEndOfDayString } from '../lib/dateUtils.js';

const router = Router();
const TABLE = 'raw_material_suppliers';
const JUNCTION_TABLE = 'supplier_raw_materials';

/** 목록/엑셀 기본 기간: 30일 (DB 직접 수정 시 updated_at 미갱신으로 빠지는 것 방지) */
function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start, end };
}

const LIST_SELECT = `SELECT s.id, s.name, s.address, s.postal_code, s.address_detail, s.contact, s.manager_name, s.manager_contact, s.manager_email,
  s.inbound_lead_time, s.order_lead_time, s.updated_at, s.updated_by,
  (SELECT COUNT(*) FROM \`${JUNCTION_TABLE}\` j WHERE j.supplier_id = s.id) AS material_count
  FROM \`${TABLE}\` s`;

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/material-suppliers/export-excel?name=&startDate=&endDate=
 * 기간 미입력 시 기간 조건 없이 전체 조회
 */
router.get('/export-excel', async (req, res) => {
  try {
    const { name = '', startDate, endDate } = req.query;
    const useDateRange = startDate?.trim() || endDate?.trim();
    const { start, end } = defaultDateRange();
    const from = useDateRange ? toStartOfDayString(startDate ? new Date(startDate) : start) : null;
    const to = useDateRange ? toEndOfDayString(endDate ? new Date(endDate) : end) : null;

    let where = 'WHERE s.deleted = ?';
    const params = ['N'];
    if (from != null && to != null) {
      where += ' AND COALESCE(s.updated_at, s.created_at) >= ? AND COALESCE(s.updated_at, s.created_at) <= ?';
      params.push(from, to);
    }
    if (name && String(name).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY s.id DESC`,
      params
    );

    const BOM = '\uFEFF';
    const header = '업체 명,우편번호,주소,상세주소,업체 연락처,담당자,담당자 연락처,담당자 이메일,입고 리드타임(일),발주 리드타임(일),취급 원자재 개수,수정일자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows
      .map(
        (r) =>
          [
            toCsvCell(r.name),
            toCsvCell(r.postal_code),
            toCsvCell(r.address),
            toCsvCell(r.address_detail),
            toCsvCell(r.contact),
            toCsvCell(r.manager_name),
            toCsvCell(r.manager_contact),
            toCsvCell(r.manager_email),
            toCsvCell(r.inbound_lead_time),
            toCsvCell(r.order_lead_time),
            toCsvCell(r.material_count),
            toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.updated_by),
          ].join(',')
      )
      .join('\n');
    const csv = BOM + header + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="raw_material_suppliers.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('material-supplier export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만, 검색: 업체 이름, 기간은 선택 시에만 적용)
 * GET /api/material-suppliers?name=&startDate=&endDate=&page=1&limit=20
 * 기간 미입력 시 기간 조건 없이 전체 조회
 */
export async function listHandler(req, res) {
  try {
    const { name = '', startDate, endDate, page = 1, limit = 20 } = req.query;
    const useDateRange = startDate?.trim() || endDate?.trim();
    const { start, end } = defaultDateRange();
    const from = useDateRange ? toStartOfDayString(startDate ? new Date(startDate) : start) : null;
    const to = useDateRange ? toEndOfDayString(endDate ? new Date(endDate) : end) : null;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE s.deleted = ?';
    const params = ['N'];
    if (from != null && to != null) {
      where += ' AND COALESCE(s.updated_at, s.created_at) >= ? AND COALESCE(s.updated_at, s.created_at) <= ?';
      params.push(from, to);
    }
    if (name && String(name).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` s ${where}`,
      params
    );
    const total = countRows?.[0]?.total != null ? Number(countRows[0].total) : 0;
    res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('material-supplier list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
}

router.get('/', listHandler);

/**
 * 단건 조회 (제공 원자재 id 목록 포함)
 * GET /api/material-suppliers/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE s.id = ? AND s.deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '공급 업체를 찾을 수 없습니다.' });
    const [ids] = await getPool().query(
      `SELECT raw_material_id FROM \`${JUNCTION_TABLE}\` WHERE supplier_id = ?`,
      [id]
    );
    const supplier = { ...rows[0], raw_material_ids: ids.map((r) => r.raw_material_id) };
    res.json(supplier);
  } catch (err) {
    logger.error('material-supplier get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/material-suppliers
 * 필수: name(업체 명), address(주소), manager_email(담당자 이메일), updatedBy(수정자)
 * 선택: contact, manager_name, manager_contact, inbound_lead_time, order_lead_time, raw_material_ids[]
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      address,
      postal_code = null,
      address_detail = null,
      contact = null,
      manager_name = null,
      manager_contact = null,
      manager_email = null,
      inbound_lead_time = null,
      order_lead_time = null,
      raw_material_ids = [],
      updatedBy = null,
    } = req.body || {};

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '업체 명은 필수입니다.' });
    }
    if (!address || String(address).trim() === '') {
      return res.status(400).json({ error: '주소는 필수입니다.' });
    }
    if (manager_email == null || String(manager_email).trim() === '') {
      return res.status(400).json({ error: '담당자 이메일은 필수입니다.' });
    }
    if (updatedBy == null || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (name, address, postal_code, address_detail, contact, manager_name, manager_contact, manager_email, inbound_lead_time, order_lead_time, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        String(name).trim(),
        String(address).trim(),
        postal_code != null ? String(postal_code).trim() : null,
        address_detail != null ? String(address_detail).trim() : null,
        contact != null ? String(contact) : null,
        manager_name != null ? String(manager_name) : null,
        manager_contact != null ? String(manager_contact) : null,
        String(manager_email).trim(),
        inbound_lead_time != null ? parseInt(inbound_lead_time, 10) : null,
        order_lead_time != null ? parseInt(order_lead_time, 10) : null,
        updatedByTrimmed,
      ]
    );
    const supplierId = result.insertId;

    const materialIds = Array.isArray(raw_material_ids)
      ? raw_material_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    if (materialIds.length > 0) {
      await getPool().query(
        `INSERT INTO \`${JUNCTION_TABLE}\` (supplier_id, raw_material_id) VALUES ?`,
        [materialIds.map((mid) => [supplierId, mid])]
      );
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE s.id = ?`,
      [supplierId]
    );
    const [ids] = await getPool().query(
      `SELECT raw_material_id FROM \`${JUNCTION_TABLE}\` WHERE supplier_id = ?`,
      [supplierId]
    );
    res.status(201).json({ ...rows[0], raw_material_ids: ids.map((r) => r.raw_material_id) });
  } catch (err) {
    logger.error('material-supplier create error', { error: err.message });
    let message = '등록에 실패했습니다.';
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      message = '등록에 실패했습니다. DB에 우편번호/상세주소 컬럼이 없을 수 있습니다. 터미널에서 npm run setup:supplier-address-fields 를 실행한 뒤 다시 시도하세요.';
    } else if (process.env.NODE_ENV !== 'production') {
      message = `등록 실패: ${err.message}`;
    }
    res.status(500).json({ error: message });
  }
});

/**
 * 수정 (업체 명, 주소, 연락처, 담당자, 리드타임, 제공 원자재)
 * PATCH /api/material-suppliers/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const {
      name,
      address,
      postal_code,
      address_detail,
      contact,
      manager_name,
      manager_contact,
      manager_email,
      inbound_lead_time,
      order_lead_time,
      raw_material_ids,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '공급 업체를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '업체 명은 필수입니다.' });
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (address !== undefined) {
      if (String(address).trim() === '') return res.status(400).json({ error: '주소는 필수입니다.' });
      updates.push('address = ?');
      params.push(String(address).trim());
    }
    if (postal_code !== undefined) {
      updates.push('postal_code = ?');
      params.push(postal_code != null ? String(postal_code).trim() : null);
    }
    if (address_detail !== undefined) {
      updates.push('address_detail = ?');
      params.push(address_detail != null ? String(address_detail).trim() : null);
    }
    if (contact !== undefined) {
      updates.push('contact = ?');
      params.push(contact != null ? String(contact) : null);
    }
    if (manager_name !== undefined) {
      updates.push('manager_name = ?');
      params.push(manager_name != null ? String(manager_name) : null);
    }
    if (manager_contact !== undefined) {
      updates.push('manager_contact = ?');
      params.push(manager_contact != null ? String(manager_contact) : null);
    }
    if (manager_email !== undefined) {
      if (manager_email == null || String(manager_email).trim() === '') {
        return res.status(400).json({ error: '담당자 이메일은 필수입니다.' });
      }
      updates.push('manager_email = ?');
      params.push(String(manager_email).trim());
    }
    if (inbound_lead_time !== undefined) {
      updates.push('inbound_lead_time = ?');
      params.push(inbound_lead_time != null ? parseInt(inbound_lead_time, 10) : null);
    }
    if (order_lead_time !== undefined) {
      updates.push('order_lead_time = ?');
      params.push(order_lead_time != null ? parseInt(order_lead_time, 10) : null);
    }
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length === 0 && raw_material_ids === undefined) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    if (updates.length > 0) {
      params.push(id);
      await getPool().query(
        `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
        [...params, 'N']
      );
    }

    if (raw_material_ids !== undefined) {
      await getPool().query(`DELETE FROM \`${JUNCTION_TABLE}\` WHERE supplier_id = ?`, [id]);
      const materialIds = Array.isArray(raw_material_ids)
        ? raw_material_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
        : [];
      if (materialIds.length > 0) {
        await getPool().query(
          `INSERT INTO \`${JUNCTION_TABLE}\` (supplier_id, raw_material_id) VALUES ?`,
          [materialIds.map((mid) => [id, mid])]
        );
      }
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE s.id = ?`, [id]);
    const [ids] = await getPool().query(
      `SELECT raw_material_id FROM \`${JUNCTION_TABLE}\` WHERE supplier_id = ?`,
      [id]
    );
    res.json({ ...rows[0], raw_material_ids: ids.map((r) => r.raw_material_id) });
  } catch (err) {
    logger.error('material-supplier update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

/**
 * 삭제 (플래그만 변경, 수정일자 수정자 갱신)
 * DELETE /api/material-suppliers/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '공급 업체를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('material-supplier delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
