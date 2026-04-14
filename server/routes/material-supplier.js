/**
 * 원자재 공급 업체 API (원자재.md 규칙)
 * - 목록(검색: 업체 이름), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { sendXlsx } from '../lib/excel-export.js';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'raw_material_suppliers';
const TYPE_JUNCTION_TABLE = 'supplier_raw_material_types';

function normalizeTypeCodes(rawMaterialTypeCodes) {
  if (!Array.isArray(rawMaterialTypeCodes)) return [];
  const unique = new Set();
  for (const code of rawMaterialTypeCodes) {
    const value = code == null ? '' : String(code).trim();
    if (!value) continue;
    unique.add(value);
  }
  return [...unique];
}

const LIST_SELECT = `SELECT s.id, s.name, s.address, s.postal_code, s.address_detail, s.contact, s.manager_name, s.manager_contact, s.manager_email,
  s.inbound_lead_time, s.order_lead_time, s.updated_at, s.updated_by,
  (SELECT COUNT(*) FROM \`${TYPE_JUNCTION_TABLE}\` j WHERE j.supplier_id = s.id) AS material_count
  FROM \`${TABLE}\` s`;

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/material-suppliers/export-excel?name=
 */
router.get('/export-excel', async (req, res) => {
  try {
    const { name = '' } = req.query;

    let where = 'WHERE s.deleted = ?';
    const params = ['N'];
    if (name && String(name).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY s.id DESC`,
      params
    );

    const headers = [['업체 명', '우편번호', '주소', '상세주소', '업체 연락처', '담당자', '담당자 연락처', '담당자 이메일', '입고 리드타임(일)', '발주 리드타임(일)', '취급 원자재 개수', '수정일자', '수정자']];
    const data = rows.map((r) => [
      r.name ?? '',
      r.postal_code ?? '',
      r.address ?? '',
      r.address_detail ?? '',
      r.contact ?? '',
      r.manager_name ?? '',
      r.manager_contact ?? '',
      r.manager_email ?? '',
      r.inbound_lead_time ?? '',
      r.order_lead_time ?? '',
      r.material_count ?? '',
      r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : '',
      r.updated_by ?? '',
    ]);
    sendXlsx(res, headers, data, '원자재공급업체');
  } catch (err) {
    logger.error('material-supplier export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만, 검색: 업체 이름)
 * GET /api/material-suppliers?name=&page=1&limit=20
 */
export async function listHandler(req, res) {
  try {
    const { name = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE s.deleted = ?';
    const params = ['N'];
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
 * 단건 조회 (제공 원자재 종류 코드 목록 포함)
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
    const [codes] = await getPool().query(
      `SELECT raw_material_type_code FROM \`${TYPE_JUNCTION_TABLE}\` WHERE supplier_id = ?`,
      [id]
    );
    const supplier = { ...rows[0], raw_material_type_codes: codes.map((r) => r.raw_material_type_code) };
    res.json(supplier);
  } catch (err) {
    logger.error('material-supplier get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/material-suppliers
 * 필수: name(업체 명), updatedBy(수정자)
 * 선택: address, manager_email, contact, manager_name, manager_contact, inbound_lead_time, order_lead_time, raw_material_type_codes[]
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
      raw_material_type_codes = [],
      updatedBy = null,
    } = req.body || {};

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '업체 명은 필수입니다.' });
    }
    if (updatedBy == null || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const normalizedAddress = address != null ? String(address).trim() : '';
    const normalizedManagerEmail = manager_email != null && String(manager_email).trim() !== ''
      ? String(manager_email).trim()
      : null;
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (name, address, postal_code, address_detail, contact, manager_name, manager_contact, manager_email, inbound_lead_time, order_lead_time, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        String(name).trim(),
        normalizedAddress,
        postal_code != null ? String(postal_code).trim() : null,
        address_detail != null ? String(address_detail).trim() : null,
        contact != null ? String(contact) : null,
        manager_name != null ? String(manager_name) : null,
        manager_contact != null ? String(manager_contact) : null,
        normalizedManagerEmail,
        inbound_lead_time != null ? parseInt(inbound_lead_time, 10) : null,
        order_lead_time != null ? parseInt(order_lead_time, 10) : null,
        updatedByTrimmed,
      ]
    );
    const supplierId = result.insertId;

    const typeCodes = normalizeTypeCodes(raw_material_type_codes);
    if (typeCodes.length > 0) {
      await getPool().query(
        `INSERT INTO \`${TYPE_JUNCTION_TABLE}\` (supplier_id, raw_material_type_code) VALUES ?`,
        [typeCodes.map((code) => [supplierId, code])]
      );
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE s.id = ?`,
      [supplierId]
    );
    const [codes] = await getPool().query(
      `SELECT raw_material_type_code FROM \`${TYPE_JUNCTION_TABLE}\` WHERE supplier_id = ?`,
      [supplierId]
    );
    res.status(201).json({ ...rows[0], raw_material_type_codes: codes.map((r) => r.raw_material_type_code) });
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
 * 수정 (업체 명, 주소, 연락처, 담당자, 리드타임, 제공 원자재 종류)
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
      raw_material_type_codes,
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
    if (updates.length === 0 && raw_material_type_codes === undefined) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    if (updates.length > 0) {
      params.push(id);
      await getPool().query(
        `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
        [...params, 'N']
      );
    }

    if (raw_material_type_codes !== undefined) {
      await getPool().query(`DELETE FROM \`${TYPE_JUNCTION_TABLE}\` WHERE supplier_id = ?`, [id]);
      const typeCodes = normalizeTypeCodes(raw_material_type_codes);
      if (typeCodes.length > 0) {
        await getPool().query(
          `INSERT INTO \`${TYPE_JUNCTION_TABLE}\` (supplier_id, raw_material_type_code) VALUES ?`,
          [typeCodes.map((code) => [id, code])]
        );
      }
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE s.id = ?`, [id]);
    const [codes] = await getPool().query(
      `SELECT raw_material_type_code FROM \`${TYPE_JUNCTION_TABLE}\` WHERE supplier_id = ?`,
      [id]
    );
    res.json({ ...rows[0], raw_material_type_codes: codes.map((r) => r.raw_material_type_code) });
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
