/**
 * 납품사 정보 API
 * - 목록(검색: name), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { sendXlsx } from '../lib/excel-export.js';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'delivery_suppliers';
const FP_JUNCTION = 'delivery_supplier_finished_products';
const SP_JUNCTION = 'delivery_supplier_semi_products';

const LIST_SELECT = `SELECT s.id, s.name, s.address, s.postal_code, s.address_detail, s.contact, s.manager_name, s.manager_contact, s.manager_email, s.updated_at, s.updated_by,
  (SELECT COUNT(*) FROM \`${FP_JUNCTION}\` fp WHERE fp.supplier_id = s.id) AS finished_product_count,
  (SELECT COUNT(*) FROM \`${SP_JUNCTION}\` sp WHERE sp.supplier_id = s.id) AS semi_product_count
  FROM \`${TABLE}\` s`;

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/delivery-suppliers/export-excel?name=
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

    const headers = [['납품처 이름', '주소', '연락처', '담당자', '담당자 연락처', '담당자 email', '완제품 수', '반제품 수', '수정일자', '수정자']];
    const data = rows.map((r) => [
      r.name ?? '',
      r.address ?? '',
      r.contact ?? '',
      r.manager_name ?? '',
      r.manager_contact ?? '',
      r.manager_email ?? '',
      r.finished_product_count ?? '',
      r.semi_product_count ?? '',
      r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : '',
      r.updated_by ?? '',
    ]);
    sendXlsx(res, headers, data, '납품처정보');
  } catch (err) {
    logger.error('delivery-supplier export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만, 검색: name)
 * GET /api/delivery-suppliers?name=&page=1&limit=20
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
    logger.error('delivery-supplier list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
}

router.get('/', listHandler);

/**
 * 단건 조회 (완제품/반제품 id 목록 포함)
 * GET /api/delivery-suppliers/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE s.id = ? AND s.deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '납품사를 찾을 수 없습니다.' });
    const [fpIds] = await getPool().query(
      `SELECT finished_product_id FROM \`${FP_JUNCTION}\` WHERE supplier_id = ?`,
      [id]
    );
    const [spIds] = await getPool().query(
      `SELECT semi_product_id FROM \`${SP_JUNCTION}\` WHERE supplier_id = ?`,
      [id]
    );
    const supplier = {
      ...rows[0],
      finished_product_ids: fpIds.map((r) => r.finished_product_id),
      semi_product_ids: spIds.map((r) => r.semi_product_id),
    };
    res.json(supplier);
  } catch (err) {
    logger.error('delivery-supplier get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/delivery-suppliers
 * 필수: name, updatedBy
 * 선택: address, postal_code, address_detail, contact, manager_name, manager_contact, manager_email, finished_product_ids[], semi_product_ids[]
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      address = null,
      postal_code = null,
      address_detail = null,
      contact = null,
      manager_name = null,
      manager_contact = null,
      manager_email = null,
      finished_product_ids = [],
      semi_product_ids = [],
      updatedBy = null,
    } = req.body || {};

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '납품사 이름은 필수입니다.' });
    }
    if (updatedBy == null || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (name, address, postal_code, address_detail, contact, manager_name, manager_contact, manager_email, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        String(name).trim(),
        address != null ? String(address).trim() : null,
        postal_code != null ? String(postal_code).trim() : null,
        address_detail != null ? String(address_detail).trim() : null,
        contact != null ? String(contact) : null,
        manager_name != null ? String(manager_name) : null,
        manager_contact != null ? String(manager_contact) : null,
        manager_email != null ? String(manager_email).trim() : null,
        updatedByTrimmed,
      ]
    );
    const supplierId = result.insertId;

    // 완제품 junction 등록
    const fpIdsClean = Array.isArray(finished_product_ids)
      ? finished_product_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    if (fpIdsClean.length > 0) {
      await getPool().query(
        `INSERT INTO \`${FP_JUNCTION}\` (supplier_id, finished_product_id) VALUES ?`,
        [fpIdsClean.map((fpId) => [supplierId, fpId])]
      );
    }

    // 반제품 junction 등록
    const spIdsClean = Array.isArray(semi_product_ids)
      ? semi_product_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    if (spIdsClean.length > 0) {
      await getPool().query(
        `INSERT INTO \`${SP_JUNCTION}\` (supplier_id, semi_product_id) VALUES ?`,
        [spIdsClean.map((spId) => [supplierId, spId])]
      );
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE s.id = ?`,
      [supplierId]
    );
    const [fpResult] = await getPool().query(
      `SELECT finished_product_id FROM \`${FP_JUNCTION}\` WHERE supplier_id = ?`,
      [supplierId]
    );
    const [spResult] = await getPool().query(
      `SELECT semi_product_id FROM \`${SP_JUNCTION}\` WHERE supplier_id = ?`,
      [supplierId]
    );
    res.status(201).json({
      ...rows[0],
      finished_product_ids: fpResult.map((r) => r.finished_product_id),
      semi_product_ids: spResult.map((r) => r.semi_product_id),
    });
  } catch (err) {
    logger.error('delivery-supplier create error', { error: err.message });
    const message = process.env.NODE_ENV === 'production'
      ? '등록에 실패했습니다.'
      : `등록 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
});

/**
 * 수정 (납품사 정보, 완제품/반제품 junction)
 * PATCH /api/delivery-suppliers/:id
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
      finished_product_ids,
      semi_product_ids,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '납품사를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '납품사 이름은 필수입니다.' });
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (address !== undefined) {
      updates.push('address = ?');
      params.push(address != null ? String(address).trim() : null);
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
      updates.push('manager_email = ?');
      params.push(manager_email != null ? String(manager_email).trim() : null);
    }
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length === 0 && finished_product_ids === undefined && semi_product_ids === undefined) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      await getPool().query(
        `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
        [...params, 'N']
      );
    }

    // 완제품 junction 갱신 (delete + reinsert)
    if (finished_product_ids !== undefined) {
      await getPool().query(`DELETE FROM \`${FP_JUNCTION}\` WHERE supplier_id = ?`, [id]);
      const fpIdsClean = Array.isArray(finished_product_ids)
        ? finished_product_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
        : [];
      if (fpIdsClean.length > 0) {
        await getPool().query(
          `INSERT INTO \`${FP_JUNCTION}\` (supplier_id, finished_product_id) VALUES ?`,
          [fpIdsClean.map((fpId) => [id, fpId])]
        );
      }
    }

    // 반제품 junction 갱신 (delete + reinsert)
    if (semi_product_ids !== undefined) {
      await getPool().query(`DELETE FROM \`${SP_JUNCTION}\` WHERE supplier_id = ?`, [id]);
      const spIdsClean = Array.isArray(semi_product_ids)
        ? semi_product_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
        : [];
      if (spIdsClean.length > 0) {
        await getPool().query(
          `INSERT INTO \`${SP_JUNCTION}\` (supplier_id, semi_product_id) VALUES ?`,
          [spIdsClean.map((spId) => [id, spId])]
        );
      }
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE s.id = ?`, [id]);
    const [fpResult] = await getPool().query(
      `SELECT finished_product_id FROM \`${FP_JUNCTION}\` WHERE supplier_id = ?`,
      [id]
    );
    const [spResult] = await getPool().query(
      `SELECT semi_product_id FROM \`${SP_JUNCTION}\` WHERE supplier_id = ?`,
      [id]
    );
    res.json({
      ...rows[0],
      finished_product_ids: fpResult.map((r) => r.finished_product_id),
      semi_product_ids: spResult.map((r) => r.semi_product_id),
    });
  } catch (err) {
    logger.error('delivery-supplier update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

/**
 * 삭제 (플래그만 변경, 수정일자 수정자 갱신)
 * DELETE /api/delivery-suppliers/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    // 참조 검사 (목록과 동일: 삭제 플래그 Y인 행은 화면에 없으므로 납품사 삭제를 막지 않음)
    const [refAffiliate] = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM delivery_affiliates WHERE supplier_id = ? AND deleted = 'N'`,
      [id]
    );
    const [refWarehouse] = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM delivery_warehouses WHERE supplier_id = ? AND deleted = 'N'`,
      [id]
    );
    const [refRequest] = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM delivery_requests WHERE supplier_id = ? AND deleted = 'N'`,
      [id]
    );
    if ((refAffiliate[0]?.cnt || 0) > 0 || (refWarehouse[0]?.cnt || 0) > 0 || (refRequest[0]?.cnt || 0) > 0) {
      return res.status(400).json({ error: '해당 납품사를 사용하는 곳이 있어 삭제할 수 없습니다.' });
    }

    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '납품사를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('delivery-supplier delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
