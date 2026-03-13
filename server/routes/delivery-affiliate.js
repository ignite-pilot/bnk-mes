/**
 * 납품사 연계 업체 API
 * - 목록(검색: name, supplierName), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'delivery_affiliates';
const SUPPLIER_TABLE = 'delivery_suppliers';

const LIST_SELECT = `SELECT a.id, a.name, a.supplier_id, s.name AS supplier_name, a.postal_code, a.address, a.address_detail, a.contact, a.manager_name, a.manager_contact, a.manager_email, a.updated_at, a.updated_by
  FROM \`${TABLE}\` a
  INNER JOIN \`${SUPPLIER_TABLE}\` s ON s.id = a.supplier_id`;

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/delivery-affiliates/export-excel?name=&supplierName=
 */
router.get('/export-excel', async (req, res) => {
  try {
    const { name = '', supplierName = '' } = req.query;

    let where = 'WHERE a.deleted = ?';
    const params = ['N'];
    if (name && String(name).trim()) {
      where += ' AND a.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (supplierName && String(supplierName).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY a.id DESC`,
      params
    );

    const BOM = '\uFEFF';
    const header = '연계사 이름,납품사 이름,주소,연락처,담당자,담당자 연락처,담당자 email,수정일자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = (rows || [])
      .map(
        (r) =>
          [
            toCsvCell(r.name),
            toCsvCell(r.supplier_name),
            toCsvCell(r.address),
            toCsvCell(r.contact),
            toCsvCell(r.manager_name),
            toCsvCell(r.manager_contact),
            toCsvCell(r.manager_email),
            toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.updated_by),
          ].join(',')
      )
      .join('\n');
    const csv = BOM + header + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="delivery_affiliates.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('delivery-affiliate export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만, 검색: name, supplierName)
 * GET /api/delivery-affiliates?name=&supplierName=&page=1&limit=20
 */
export async function listHandler(req, res) {
  try {
    const { name = '', supplierName = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE a.deleted = ?';
    const params = ['N'];
    if (name && String(name).trim()) {
      where += ' AND a.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (supplierName && String(supplierName).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` a INNER JOIN \`${SUPPLIER_TABLE}\` s ON s.id = a.supplier_id ${where}`,
      params
    );
    const total = countRows?.[0]?.total != null ? Number(countRows[0].total) : 0;
    res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('delivery-affiliate list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
}

router.get('/', listHandler);

/**
 * 단건 조회
 * GET /api/delivery-affiliates/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE a.id = ? AND a.deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '연계 업체를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    logger.error('delivery-affiliate get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/delivery-affiliates
 * 필수: name, supplier_id, updatedBy
 * 선택: address, contact, manager_name, manager_contact, manager_email
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      supplier_id,
      postal_code = null,
      address = null,
      address_detail = null,
      contact = null,
      manager_name = null,
      manager_contact = null,
      manager_email = null,
      updatedBy = null,
    } = req.body || {};

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '연계사 이름은 필수입니다.' });
    }
    const supplierId = supplier_id != null ? parseInt(supplier_id, 10) : NaN;
    if (Number.isNaN(supplierId) || supplierId < 1) {
      return res.status(400).json({ error: '납품사는 필수입니다.' });
    }
    if (updatedBy == null || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }

    const [supplierCheck] = await getPool().query(
      `SELECT id FROM \`${SUPPLIER_TABLE}\` WHERE id = ? AND deleted = ?`,
      [supplierId, 'N']
    );
    if (!supplierCheck.length) {
      return res.status(400).json({ error: '선택한 납품사를 찾을 수 없습니다.' });
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (name, supplier_id, postal_code, address, address_detail, contact, manager_name, manager_contact, manager_email, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        String(name).trim(),
        supplierId,
        postal_code != null ? String(postal_code).trim() : null,
        address != null ? String(address).trim() : null,
        address_detail != null ? String(address_detail).trim() : null,
        contact != null ? String(contact) : null,
        manager_name != null ? String(manager_name) : null,
        manager_contact != null ? String(manager_contact) : null,
        manager_email != null ? String(manager_email).trim() : null,
        updatedByTrimmed,
      ]
    );
    const insertId = result.insertId;

    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE a.id = ?`,
      [insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('delivery-affiliate create error', { error: err.message });
    const message = process.env.NODE_ENV === 'production'
      ? '등록에 실패했습니다.'
      : `등록 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
});

/**
 * 수정
 * PATCH /api/delivery-affiliates/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const {
      name,
      supplier_id,
      postal_code,
      address,
      address_detail,
      contact,
      manager_name,
      manager_contact,
      manager_email,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '연계 업체를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '연계사 이름은 필수입니다.' });
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (supplier_id !== undefined) {
      const sid = parseInt(supplier_id, 10);
      if (Number.isNaN(sid) || sid < 1) return res.status(400).json({ error: '납품사는 필수입니다.' });
      const [sc] = await getPool().query(
        `SELECT id FROM \`${SUPPLIER_TABLE}\` WHERE id = ? AND deleted = ?`,
        [sid, 'N']
      );
      if (!sc.length) return res.status(400).json({ error: '선택한 납품사를 찾을 수 없습니다.' });
      updates.push('supplier_id = ?');
      params.push(sid);
    }
    if (postal_code !== undefined) {
      updates.push('postal_code = ?');
      params.push(postal_code != null ? String(postal_code).trim() : null);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      params.push(address != null ? String(address).trim() : null);
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
    if (updates.length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await getPool().query(
      `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
      [...params, 'N']
    );

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE a.id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    logger.error('delivery-affiliate update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

/**
 * 삭제 (플래그만 변경, 수정일자·수정자 갱신)
 * DELETE /api/delivery-affiliates/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    // 참조 여부 확인 (현재 참조하는 곳 없음, 향후 확장 대비)
    // const [refs] = await getPool().query('SELECT COUNT(*) AS cnt FROM some_table WHERE affiliate_id = ?', [id]);
    // if (refs[0].cnt > 0) return res.status(400).json({ error: '해당 정보를 사용하는 곳이 있어 삭제할 수 없습니다.' });

    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '연계 업체를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('delivery-affiliate delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
