/**
 * delivery_request_items 참조 건수 (완제품/반제품 삭제 전 검사)
 * 일부 RDS는 품목 FK 컬럼이 item_id 만 있어 product_id 조회 시 ER_BAD_FIELD_ERROR 가 난다.
 */
import logger from './logger.js';

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} productId
 * @param {'finished'|'semi'} itemType
 */
export async function countDeliveryRequestItemRefs(pool, productId, itemType) {
  if (itemType !== 'finished' && itemType !== 'semi') {
    throw new Error('countDeliveryRequestItemRefs: itemType must be finished or semi');
  }
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM delivery_request_items WHERE product_id = ? AND item_type = ?`,
      [productId, itemType]
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      logger.warn('delivery_request_items: table missing, ref count treated as 0', {
        productId,
        itemType,
        message: err.message,
      });
      return 0;
    }
    if (err.code === 'ER_BAD_FIELD_ERROR' && /product_id/i.test(String(err.sqlMessage || ''))) {
      logger.warn('delivery_request_items: ref count using legacy item_id column', {
        productId,
        itemType,
      });
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM delivery_request_items WHERE item_id = ? AND item_type = ?`,
        [productId, itemType]
      );
      return Number(rows[0]?.cnt ?? 0);
    }
    throw err;
  }
}

const BLOCKER_LIST_JOIN = `
  FROM delivery_request_items i
  INNER JOIN delivery_requests r ON r.id = i.request_id AND r.deleted = 'N'
  INNER JOIN delivery_suppliers s ON s.id = r.supplier_id AND s.deleted = 'N'`;

/**
 * 완제품 삭제 불가 시 UI에 넘길 납품 요청·품목 목록 (최대 50행)
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} productId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listFinishedProductDeliveryRequestBlockers(pool, productId) {
  const selectList = (idColumn) =>
    `SELECT r.id AS request_id, s.name AS supplier_name, r.request_date, r.desired_date, r.status AS request_status,
            i.id AS request_item_id, i.quantity, i.item_status
     ${BLOCKER_LIST_JOIN}
     WHERE i.${idColumn} = ? AND i.item_type = 'finished'
     ORDER BY r.id DESC, i.id ASC
     LIMIT 50`;

  try {
    const [rows] = await pool.query(selectList('product_id'), [productId]);
    return rows || [];
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    if (err.code === 'ER_BAD_FIELD_ERROR' && /product_id/i.test(String(err.sqlMessage || ''))) {
      logger.warn('delivery_request_items: blocker list using legacy item_id column', { productId });
      const [rows] = await pool.query(selectList('item_id'), [productId]);
      return rows || [];
    }
    throw err;
  }
}
