/**
 * 납품사 창고 정보 API
 * - 목록(검색: name, supplierName), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'delivery_warehouses';
const SUPPLIER_TABLE = 'delivery_suppliers';
const PRODUCT_JUNCTION = 'delivery_warehouse_products';

const LIST_SELECT = `SELECT w.id, w.name, w.supplier_id, s.name AS supplier_name, w.address, w.postal_code, w.address_detail, w.updated_at, w.updated_by
  FROM \`${TABLE}\` w
  INNER JOIN \`${SUPPLIER_TABLE}\` s ON s.id = w.supplier_id`;

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/delivery-warehouses/export-excel?name=&supplierName=
 */
router.get('/export-excel', async (req, res) => {
  try {
    const { name = '', supplierName = '' } = req.query;

    let where = 'WHERE w.deleted = ?';
    const params = ['N'];
    if (name && String(name).trim()) {
      where += ' AND w.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (supplierName && String(supplierName).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY w.id DESC`,
      params
    );

    const BOM = '\uFEFF';
    const header = '보유 납품사,창고 이름,주소,수정일자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = (rows || [])
      .map(
        (r) =>
          [
            toCsvCell(r.supplier_name),
            toCsvCell(r.name),
            toCsvCell([r.postal_code, r.address, r.address_detail].filter(Boolean).join(' ')),
            toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.updated_by),
          ].join(',')
      )
      .join('\n');
    const csv = BOM + header + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="delivery_warehouses.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('delivery-warehouse export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만, 검색: name, supplierName)
 * GET /api/delivery-warehouses?name=&supplierName=&page=1&limit=20
 */
export async function listHandler(req, res) {
  try {
    const { name = '', supplierName = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE w.deleted = ?';
    const params = ['N'];
    if (name && String(name).trim()) {
      where += ' AND w.name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (supplierName && String(supplierName).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY w.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` w INNER JOIN \`${SUPPLIER_TABLE}\` s ON s.id = w.supplier_id ${where}`,
      params
    );
    const total = countRows?.[0]?.total != null ? Number(countRows[0].total) : 0;
    res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('delivery-warehouse list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
}

router.get('/', listHandler);

/**
 * 단건 조회 (완제품 id 목록 포함)
 * GET /api/delivery-warehouses/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE w.id = ? AND w.deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '창고를 찾을 수 없습니다.' });
    const [idsRows] = await getPool().query(
      `SELECT finished_product_id FROM \`${PRODUCT_JUNCTION}\` WHERE warehouse_id = ?`,
      [id]
    );
    const ids = Array.isArray(idsRows) ? idsRows : [];
    const warehouse = { ...rows[0], finished_product_ids: ids.map((r) => r.finished_product_id) };
    res.json(warehouse);
  } catch (err) {
    logger.error('delivery-warehouse get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/delivery-warehouses
 * 필수: name, supplier_id, address, updatedBy
 * 선택: postal_code, address_detail, finished_product_ids[]
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      supplier_id,
      address,
      postal_code = null,
      address_detail = null,
      finished_product_ids = [],
      updatedBy = null,
    } = req.body || {};

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '창고 이름은 필수입니다.' });
    }
    const supplierId = supplier_id != null ? parseInt(supplier_id, 10) : NaN;
    if (Number.isNaN(supplierId) || supplierId < 1) {
      return res.status(400).json({ error: '납품사는 필수입니다.' });
    }
    if (!address || String(address).trim() === '') {
      return res.status(400).json({ error: '주소는 필수입니다.' });
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
      `INSERT INTO \`${TABLE}\` (name, supplier_id, address, postal_code, address_detail, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        String(name).trim(),
        supplierId,
        String(address).trim(),
        postal_code != null ? String(postal_code).trim() : null,
        address_detail != null ? String(address_detail).trim() : null,
        updatedByTrimmed,
      ]
    );
    const warehouseId = result.insertId;

    const productIds = Array.isArray(finished_product_ids)
      ? finished_product_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    if (productIds.length > 0) {
      await getPool().query(
        `INSERT INTO \`${PRODUCT_JUNCTION}\` (warehouse_id, finished_product_id) VALUES ?`,
        [productIds.map((pid) => [warehouseId, pid])]
      );
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE w.id = ?`, [warehouseId]);
    const [idsRows] = await getPool().query(
      `SELECT finished_product_id FROM \`${PRODUCT_JUNCTION}\` WHERE warehouse_id = ?`,
      [warehouseId]
    );
    const ids = Array.isArray(idsRows) ? idsRows : [];
    res.status(201).json({ ...rows[0], finished_product_ids: ids.map((r) => r.finished_product_id) });
  } catch (err) {
    logger.error('delivery-warehouse create error', { error: err.message });
    const message = process.env.NODE_ENV === 'production'
      ? '등록에 실패했습니다.'
      : `등록 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
});

/**
 * 수정 (납품사, 창고 이름, 주소, 완제품 목록)
 * PATCH /api/delivery-warehouses/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const {
      name,
      supplier_id,
      address,
      postal_code,
      address_detail,
      finished_product_ids,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '창고를 찾을 수 없습니다.' });

    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '창고 이름은 필수입니다.' });
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
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length === 0 && finished_product_ids === undefined) {
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

    if (finished_product_ids !== undefined) {
      await getPool().query(`DELETE FROM \`${PRODUCT_JUNCTION}\` WHERE warehouse_id = ?`, [id]);
      const productIds = Array.isArray(finished_product_ids)
        ? finished_product_ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x > 0)
        : [];
      if (productIds.length > 0) {
        await getPool().query(
          `INSERT INTO \`${PRODUCT_JUNCTION}\` (warehouse_id, finished_product_id) VALUES ?`,
          [productIds.map((pid) => [id, pid])]
        );
      }
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE w.id = ?`, [id]);
    const [idsRows] = await getPool().query(
      `SELECT finished_product_id FROM \`${PRODUCT_JUNCTION}\` WHERE warehouse_id = ?`,
      [id]
    );
    const ids = Array.isArray(idsRows) ? idsRows : [];
    res.json({ ...rows[0], finished_product_ids: ids.map((r) => r.finished_product_id) });
  } catch (err) {
    logger.error('delivery-warehouse update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

/**
 * 삭제 (플래그만 변경, 수정일자·수정자 갱신)
 * DELETE /api/delivery-warehouses/:id
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
    if (result.affectedRows === 0) return res.status(404).json({ error: '창고를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('delivery-warehouse delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
