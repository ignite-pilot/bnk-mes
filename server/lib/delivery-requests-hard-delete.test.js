import { jest, describe, it, expect } from '@jest/globals';
import { hardDeleteDeliveryRequests } from './delivery-requests-hard-delete.js';

describe('hardDeleteDeliveryRequests', () => {
  it('플래그 없으면 예외', async () => {
    const conn = { query: jest.fn() };
    await expect(hardDeleteDeliveryRequests(conn, { dryRun: false, confirm: false })).rejects.toThrow(
      /dryRun 또는 confirm/
    );
  });

  it('dry-run이면 DELETE 호출 없이 건수만 반환', async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ cnt: 2 }]])
        .mockResolvedValueOnce([[{ cnt: 5 }]]),
    };
    const r = await hardDeleteDeliveryRequests(conn, { dryRun: true, confirm: false });
    expect(r).toEqual({ reqCnt: 2, itemCnt: 5, deleted: 0 });
    expect(conn.query).toHaveBeenCalledTimes(2);
  });

  it('confirm이면 DELETE 실행', async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ cnt: 1 }]])
        .mockResolvedValueOnce([[{ cnt: 3 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const r = await hardDeleteDeliveryRequests(conn, { dryRun: false, confirm: true });
    expect(r.deleted).toBe(1);
    expect(conn.query).toHaveBeenNthCalledWith(3, 'DELETE FROM delivery_requests');
  });
});
