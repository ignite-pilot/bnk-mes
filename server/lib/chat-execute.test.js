import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('./db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

const { executeChatOp } = await import('./chat-execute.js');

describe('executeChatOp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('허용되지 않은 op는 거절', async () => {
    const r = await executeChatOp('unknown_op', { updatedBy: '홍길동' });
    expect(r.ok).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updatedBy 없으면 거절', async () => {
    const r = await executeChatOp('purge_delivery_requests', { updatedBy: '' });
    expect(r.ok).toBe(false);
  });

  it('purge_delivery_requests: id 목록 후 소프트 삭제', async () => {
    mockQuery
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]])
      .mockResolvedValue([[{ affectedRows: 1 }]]);
    const r = await executeChatOp('purge_delivery_requests', { updatedBy: '관리자' });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('batch_create_finished_products: 목록 등록 성공', async () => {
    mockQuery
      .mockResolvedValueOnce([[]]) // dup code check
      .mockResolvedValueOnce([[{ id: 10 }]]) // affiliate lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert

    const r = await executeChatOp('batch_create_finished_products', {
      updatedBy: '관리자',
      params: {
        items: [{ code: 'FP-100', affiliateName: '연계업체A', thickness: 1.2, ratio: 1.7 }],
      },
    });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    expect(r.failed).toBe(0);
    const insertParams = mockQuery.mock.calls[2][1];
    expect(insertParams[10]).toBe(1.2); // thickness one decimal
    expect(insertParams[14]).toBe(2); // ratio integer
  });

  it('batch_create_finished_products: code 중복은 실패로 집계', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }]]); // dup code exists

    const r = await executeChatOp('batch_create_finished_products', {
      updatedBy: '관리자',
      params: { items: [{ code: 'FP-100' }] },
    });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.errors[0].reason).toMatch(/이미 사용 중/);
  });

  it('batch_create_finished_products: 1000건 초과는 거절', async () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({ code: `FP-${i}` }));
    const r = await executeChatOp('batch_create_finished_products', {
      updatedBy: '관리자',
      params: { items },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/1000/);
  });

  it('purge_finished_products: 참조 없으면 모두 소프트 삭제', async () => {
    // select finished products
    mockQuery
      .mockResolvedValueOnce([[{ id: 1, code: 'FP-1' }, { id: 2, code: 'FP-2' }]])
      // ref count #1
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      // clear junctions (supplier, warehouse) + update
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      // ref count #2
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const r = await executeChatOp('purge_finished_products', { updatedBy: '관리자', params: {} });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.skipped).toBe(0);
  });
});
