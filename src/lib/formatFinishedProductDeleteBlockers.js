/** 납품 요청 상태 (delivery_requests.status) */
export const DELIVERY_REQUEST_STATUS_LABEL = {
  requested: '납품 요청',
  partial: '부분 납품',
  completed: '전체 납품',
  all_returned: '전체 반품',
  cancelled: '납품 요청 취소',
};

/** 품목 상태 (delivery_request_items.item_status) */
export const DELIVERY_ITEM_STATUS_LABEL = {
  requested: '준비 중',
  delivered: '납품 완료',
  returned: '반품',
  cancelled: '취소',
};

/**
 * 완제품 삭제 불가 시 blockers 한 줄 표시
 * @param {Record<string, unknown>} b
 */
export function formatFinishedProductDeleteBlockerLine(b) {
  const rs = DELIVERY_REQUEST_STATUS_LABEL[b.request_status] || b.request_status || '-';
  const is = DELIVERY_ITEM_STATUS_LABEL[b.item_status] || b.item_status || '-';
  const qty = b.quantity != null && b.quantity !== '' ? String(b.quantity) : '-';
  return `납품요청 #${b.request_id} · ${b.supplier_name || '-'} · 요청일 ${b.request_date || '-'} · 희망일 ${b.desired_date || '-'} · 요청상태 ${rs} · 수량 ${qty} · 품목상태 ${is} (요청품목 #${b.request_item_id})`;
}
