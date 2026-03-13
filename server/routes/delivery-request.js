/**
 * 완제품 입고요청/납품 관리 API
 * - 목록(검색: supplierName), 단건 조회, 등록, 수정, 취소, 개별 납품/반품
 * - 삭제 플래그, 수정일자·수정자, 페이지네이션
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'delivery_requests';
const ITEMS_TABLE = 'delivery_request_items';
const SUPPLIER_TABLE = 'delivery_suppliers';

const LIST_SELECT = `SELECT r.id, r.supplier_id, s.name AS supplier_name, r.request_date, r.desired_date, r.status,
  (SELECT COUNT(*) FROM \`${ITEMS_TABLE}\` ri WHERE ri.request_id = r.id) AS item_count,
  r.updated_at, r.updated_by
  FROM \`${TABLE}\` r
  INNER JOIN \`${SUPPLIER_TABLE}\` s ON s.id = r.supplier_id`;

function toCsvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function toDateString(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

/** 상태 재계산 로직 */
async function recalculateRequestStatus(requestId) {
  const [items] = await getPool().query(
    `SELECT item_status FROM \`${ITEMS_TABLE}\` WHERE request_id = ?`,
    [requestId]
  );
  const statuses = items.map((i) => i.item_status);
  let newStatus;
  if (statuses.every((s) => s === 'requested')) newStatus = 'requested';
  else if (statuses.every((s) => s === 'returned')) newStatus = 'all_returned';
  else if (statuses.every((s) => s === 'delivered' || s === 'returned')) newStatus = 'completed';
  else newStatus = 'partial';
  await getPool().query(
    `UPDATE \`${TABLE}\` SET status = ? WHERE id = ?`,
    [newStatus, requestId]
  );
  return newStatus;
}

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/delivery-requests/export-excel?supplierName=
 */
export async function exportExcel(req, res) {
  try {
    const { supplierName = '' } = req.query;

    let where = 'WHERE r.deleted = ?';
    const params = ['N'];
    if (supplierName && String(supplierName).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY r.id DESC`,
      params
    );

    const BOM = '\uFEFF';
    const header = '납품사,납품 요청일,납품 희망일,상태,품목 수,수정일자,수정자\n';
    const body = (rows || [])
      .map(
        (r) =>
          [
            toCsvCell(r.supplier_name),
            toCsvCell(toDateString(r.request_date)),
            toCsvCell(toDateString(r.desired_date)),
            toCsvCell(r.status),
            toCsvCell(r.item_count),
            toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.updated_by),
          ].join(',')
      )
      .join('\n');
    const csv = BOM + header + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="delivery_requests.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('delivery-request export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
}

router.get('/export-excel', exportExcel);

/**
 * 목록 조회 (삭제 플래그 N만, 검색: supplierName)
 * GET /api/delivery-requests?supplierName=&page=1&limit=20
 */
export async function listHandler(req, res) {
  try {
    const { supplierName = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE r.deleted = ?';
    const params = ['N'];
    if (supplierName && String(supplierName).trim()) {
      where += ' AND s.name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` r INNER JOIN \`${SUPPLIER_TABLE}\` s ON s.id = r.supplier_id ${where}`,
      params
    );
    const total = countRows?.[0]?.total != null ? Number(countRows[0].total) : 0;
    res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('delivery-request list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
}

router.get('/', listHandler);

/**
 * 단건 조회 (품목 목록 포함)
 * GET /api/delivery-requests/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [reqRows] = await getPool().query(
      `${LIST_SELECT} WHERE r.id = ? AND r.deleted = ?`,
      [id, 'N']
    );
    if (!reqRows.length) return res.status(404).json({ error: '납품 요청을 찾을 수 없습니다.' });
    const [itemRows] = await getPool().query(
      `SELECT i.id, i.item_type, i.product_id, i.quantity, i.item_status
       FROM \`${ITEMS_TABLE}\` i
       WHERE i.request_id = ?`,
      [id]
    );
    const items = itemRows || [];
    res.json({ ...reqRows[0], items });
  } catch (err) {
    logger.error('delivery-request get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/delivery-requests
 * 필수: supplier_id, request_date, desired_date, items[], updatedBy
 * items: [{ item_type: 'finished'|'semi', product_id, quantity }]
 */
router.post('/', async (req, res) => {
  try {
    const { supplier_id, request_date, desired_date, items: bodyItems = [], updatedBy } = req.body || {};

    const supplierId = supplier_id != null ? parseInt(supplier_id, 10) : NaN;
    if (Number.isNaN(supplierId) || supplierId < 1) {
      return res.status(400).json({ error: '납품사는 필수입니다.' });
    }
    if (!request_date || String(request_date).trim() === '') {
      return res.status(400).json({ error: '납품 요청일은 필수입니다.' });
    }
    if (!desired_date || String(desired_date).trim() === '') {
      return res.status(400).json({ error: '납품 희망일은 필수입니다.' });
    }
    if (!updatedBy || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }
    const itemList = Array.isArray(bodyItems) ? bodyItems.filter((i) => i.product_id && i.quantity != null && i.quantity !== '') : [];
    if (itemList.length === 0) {
      return res.status(400).json({ error: '품목 정보를 1건 이상 입력해 주세요.' });
    }

    const [supplierCheck] = await getPool().query(
      `SELECT id FROM \`${SUPPLIER_TABLE}\` WHERE id = ? AND deleted = ?`,
      [supplierId, 'N']
    );
    if (!supplierCheck.length) {
      return res.status(400).json({ error: '선택한 납품사를 찾을 수 없습니다.' });
    }

    const requestDateStr = toDateString(new Date(request_date)) || String(request_date).trim().slice(0, 10);
    const desiredDateStr = toDateString(new Date(desired_date)) || String(desired_date).trim().slice(0, 10);
    const updatedByTrimmed = String(updatedBy).trim();

    const [insertReq] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (supplier_id, request_date, desired_date, status, updated_at, updated_by)
       VALUES (?, ?, ?, 'requested', CURRENT_TIMESTAMP, ?)`,
      [supplierId, requestDateStr, desiredDateStr, updatedByTrimmed]
    );
    const requestId = insertReq.insertId;

    const itemRows = itemList.map((i) => [
      requestId,
      i.item_type || 'finished',
      parseInt(i.product_id, 10),
      Number(i.quantity) || 0,
      'requested',
    ]);
    await getPool().query(
      `INSERT INTO \`${ITEMS_TABLE}\` (request_id, item_type, product_id, quantity, item_status) VALUES ?`,
      [itemRows]
    );

    const [created] = await getPool().query(
      `${LIST_SELECT} WHERE r.id = ?`,
      [requestId]
    );
    const [createdItems] = await getPool().query(
      `SELECT i.id, i.item_type, i.product_id, i.quantity, i.item_status
       FROM \`${ITEMS_TABLE}\` i WHERE i.request_id = ?`,
      [requestId]
    );
    res.status(201).json({ ...created[0], items: createdItems || [] });
  } catch (err) {
    logger.error('delivery-request create error', { error: err.message });
    res.status(500).json({ error: '등록에 실패했습니다.', detail: err.message });
  }
});

/**
 * 수정 (요청 필드 + 품목 delete+reinsert)
 * PATCH /api/delivery-requests/:id
 * cancelled 상태에서는 수정 불가
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    const [existing] = await getPool().query(
      `SELECT id, status FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '납품 요청을 찾을 수 없습니다.' });
    if (existing[0].status === 'cancelled') {
      return res.status(400).json({ error: '취소된 요청은 수정할 수 없습니다.' });
    }

    const {
      supplier_id,
      request_date,
      desired_date,
      items: bodyItems,
      updatedBy,
    } = req.body || {};

    const updates = [];
    const params = [];
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
    if (request_date !== undefined) {
      updates.push('request_date = ?');
      params.push(toDateString(new Date(request_date)) || String(request_date).trim().slice(0, 10));
    }
    if (desired_date !== undefined) {
      updates.push('desired_date = ?');
      params.push(toDateString(new Date(desired_date)) || String(desired_date).trim().slice(0, 10));
    }
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length === 0 && bodyItems === undefined) {
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

    if (bodyItems !== undefined) {
      await getPool().query(`DELETE FROM \`${ITEMS_TABLE}\` WHERE request_id = ?`, [id]);
      const itemList = Array.isArray(bodyItems) ? bodyItems.filter((i) => i.product_id && i.quantity != null && i.quantity !== '') : [];
      if (itemList.length > 0) {
        const itemRows = itemList.map((i) => [
          id,
          i.item_type || 'finished',
          parseInt(i.product_id, 10),
          Number(i.quantity) || 0,
          'requested',
        ]);
        await getPool().query(
          `INSERT INTO \`${ITEMS_TABLE}\` (request_id, item_type, product_id, quantity, item_status) VALUES ?`,
          [itemRows]
        );
      }
      await recalculateRequestStatus(id);
    }

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE r.id = ?`, [id]);
    const [itemRows] = await getPool().query(
      `SELECT i.id, i.item_type, i.product_id, i.quantity, i.item_status
       FROM \`${ITEMS_TABLE}\` i WHERE i.request_id = ?`,
      [id]
    );
    res.json({ ...rows[0], items: itemRows || [] });
  } catch (err) {
    logger.error('delivery-request update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.', detail: err.message });
  }
});

/**
 * 개별 품목 납품 처리
 * POST /api/delivery-requests/:id/items/:itemId/deliver
 */
router.post('/:id/items/:itemId/deliver', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (Number.isNaN(id) || Number.isNaN(itemId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;

    const [itemRows] = await getPool().query(
      `SELECT i.id, i.request_id FROM \`${ITEMS_TABLE}\` i
       INNER JOIN \`${TABLE}\` r ON r.id = i.request_id AND r.deleted = 'N'
       WHERE i.id = ? AND i.request_id = ?`,
      [itemId, id]
    );
    if (!itemRows.length) return res.status(404).json({ error: '해당 품목을 찾을 수 없습니다.' });

    await getPool().query(
      `UPDATE \`${ITEMS_TABLE}\` SET item_status = 'delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [itemId]
    );
    await getPool().query(
      `UPDATE \`${TABLE}\` SET updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
      [updatedBy, id]
    );

    const newStatus = await recalculateRequestStatus(id);

    const [updated] = await getPool().query(
      `SELECT i.id, i.item_type, i.product_id, i.quantity, i.item_status
       FROM \`${ITEMS_TABLE}\` i WHERE i.id = ?`,
      [itemId]
    );
    res.json({ ...updated[0], request_status: newStatus });
  } catch (err) {
    logger.error('delivery-request deliver error', { error: err.message });
    res.status(500).json({ error: '납품 처리에 실패했습니다.', detail: err.message });
  }
});

/**
 * 개별 품목 반품 처리
 * POST /api/delivery-requests/:id/items/:itemId/return
 */
router.post('/:id/items/:itemId/return', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (Number.isNaN(id) || Number.isNaN(itemId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;

    const [itemRows] = await getPool().query(
      `SELECT i.id, i.request_id FROM \`${ITEMS_TABLE}\` i
       INNER JOIN \`${TABLE}\` r ON r.id = i.request_id AND r.deleted = 'N'
       WHERE i.id = ? AND i.request_id = ?`,
      [itemId, id]
    );
    if (!itemRows.length) return res.status(404).json({ error: '해당 품목을 찾을 수 없습니다.' });

    await getPool().query(
      `UPDATE \`${ITEMS_TABLE}\` SET item_status = 'returned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [itemId]
    );
    await getPool().query(
      `UPDATE \`${TABLE}\` SET updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
      [updatedBy, id]
    );

    const newStatus = await recalculateRequestStatus(id);

    const [updated] = await getPool().query(
      `SELECT i.id, i.item_type, i.product_id, i.quantity, i.item_status
       FROM \`${ITEMS_TABLE}\` i WHERE i.id = ?`,
      [itemId]
    );
    res.json({ ...updated[0], request_status: newStatus });
  } catch (err) {
    logger.error('delivery-request return error', { error: err.message });
    res.status(500).json({ error: '반품 처리에 실패했습니다.', detail: err.message });
  }
});

/**
 * 전체 요청 취소
 * POST /api/delivery-requests/:id/cancel
 * 모든 품목이 'requested' 상태일 때만 취소 가능
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;

    const [reqRows] = await getPool().query(
      `SELECT id, status FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!reqRows.length) return res.status(404).json({ error: '납품 요청을 찾을 수 없습니다.' });

    const [items] = await getPool().query(
      `SELECT item_status FROM \`${ITEMS_TABLE}\` WHERE request_id = ?`,
      [id]
    );
    const allRequested = items.every((i) => i.item_status === 'requested');
    if (!allRequested) {
      return res.status(400).json({ error: '모든 품목이 요청 상태일 때만 취소할 수 있습니다.' });
    }

    await getPool().query(
      `UPDATE \`${ITEMS_TABLE}\` SET item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE request_id = ?`,
      [id]
    );
    await getPool().query(
      `UPDATE \`${TABLE}\` SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
      [updatedBy, id]
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error('delivery-request cancel error', { error: err.message });
    res.status(500).json({ error: '취소 처리에 실패했습니다.', detail: err.message });
  }
});

/**
 * 삭제 (플래그만 변경 = 취소 처리, 수정일자·수정자 갱신)
 * DELETE /api/delivery-requests/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;

    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '납품 요청을 찾을 수 없습니다.' });

    await getPool().query(
      `UPDATE \`${ITEMS_TABLE}\` SET item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE request_id = ?`,
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error('delivery-request delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
