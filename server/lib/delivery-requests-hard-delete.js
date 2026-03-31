/**
 * 완제품 입고요청/납품: delivery_requests 전체 물리 삭제 (품목은 FK CASCADE)
 * @param {import('mysql2/promise').Connection} conn
 * @param {{ dryRun: boolean, confirm: boolean }}
 * @returns {Promise<{ reqCnt: number, itemCnt: number, deleted: number }>}
 */
export async function hardDeleteDeliveryRequests(conn, { dryRun, confirm }) {
  if (!dryRun && !confirm) {
    throw new Error('dryRun 또는 confirm 중 하나가 필요합니다.');
  }

  const [[{ cnt: reqCnt }]] = await conn.query('SELECT COUNT(*) AS cnt FROM delivery_requests');
  const [[{ cnt: itemCnt }]] = await conn.query('SELECT COUNT(*) AS cnt FROM delivery_request_items');

  if (dryRun) {
    return { reqCnt: Number(reqCnt), itemCnt: Number(itemCnt), deleted: 0 };
  }

  const [res] = await conn.query('DELETE FROM delivery_requests');
  return {
    reqCnt: Number(reqCnt),
    itemCnt: Number(itemCnt),
    deleted: res.affectedRows ?? 0,
  };
}
