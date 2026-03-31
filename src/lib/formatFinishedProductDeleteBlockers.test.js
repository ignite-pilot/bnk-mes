import { describe, it, expect } from 'vitest';
import { formatFinishedProductDeleteBlockerLine } from './formatFinishedProductDeleteBlockers.js';

describe('formatFinishedProductDeleteBlockerLine', () => {
  it('납품 요청·품목 정보를 한 줄로 만든다', () => {
    const s = formatFinishedProductDeleteBlockerLine({
      request_id: 12,
      supplier_name: '테스트 납품',
      request_date: '2025-03-01',
      desired_date: '2025-03-10',
      request_status: 'requested',
      quantity: 5,
      item_status: 'delivered',
      request_item_id: 99,
    });
    expect(s).toContain('납품요청 #12');
    expect(s).toContain('테스트 납품');
    expect(s).toContain('납품 요청');
    expect(s).toContain('납품 완료');
    expect(s).toContain('요청품목 #99');
  });
});
