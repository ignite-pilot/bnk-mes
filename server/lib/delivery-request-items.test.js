/**
 * delivery_request_items 참조 카운트 — product_id / 레거시 item_id
 */
import { jest } from '@jest/globals';
import {
  countDeliveryRequestItemRefs,
  listFinishedProductDeliveryRequestBlockers,
} from './delivery-request-items.js';

function badFieldError(msg) {
  const e = new Error(msg);
  e.code = 'ER_BAD_FIELD_ERROR';
  e.sqlMessage = msg;
  return e;
}

describe('countDeliveryRequestItemRefs', () => {
  it('product_id 로 조회해 건수를 반환한다', async () => {
    const query = jest.fn().mockResolvedValueOnce([[{ cnt: 4 }]]);
    const n = await countDeliveryRequestItemRefs({ query }, 10, 'finished');
    expect(n).toBe(4);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain('product_id');
    expect(String(query.mock.calls[0][0])).not.toContain('item_id');
  });

  it('product_id 컬럼이 없으면 item_id 로 재시도한다', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(badFieldError("Unknown column 'product_id' in 'where clause'"))
      .mockResolvedValueOnce([[{ cnt: 2 }]]);
    const n = await countDeliveryRequestItemRefs({ query }, 7, 'semi');
    expect(n).toBe(2);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain('item_id');
  });

  it('테이블이 없으면 ER_NO_SUCH_TABLE 시 0을 반환한다', async () => {
    const query = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error("Table 'x.delivery_request_items' doesn't exist"), {
        code: 'ER_NO_SUCH_TABLE',
      })
    );
    const n = await countDeliveryRequestItemRefs({ query }, 1, 'finished');
    expect(n).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('ER_BAD_FIELD_ERROR 이지만 product_id 와 무관하면 그대로 던진다', async () => {
    const query = jest.fn().mockRejectedValueOnce(badFieldError("Unknown column 'foo' in 'where clause'"));
    await expect(countDeliveryRequestItemRefs({ query }, 1, 'finished')).rejects.toMatchObject({
      code: 'ER_BAD_FIELD_ERROR',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('listFinishedProductDeliveryRequestBlockers', () => {
  it('product_id 로 납품 요청 행을 반환한다', async () => {
    const row = {
      request_id: 1,
      supplier_name: 'S',
      request_date: new Date('2025-02-01'),
      desired_date: new Date('2025-02-05'),
      request_status: 'requested',
      request_item_id: 9,
      quantity: 2,
      item_status: 'requested',
    };
    const query = jest.fn().mockResolvedValueOnce([[row]]);
    const list = await listFinishedProductDeliveryRequestBlockers({ query }, 5);
    expect(list).toEqual([row]);
    expect(String(query.mock.calls[0][0])).toContain('product_id');
  });

  it('ER_BAD_FIELD_ERROR 시 item_id 로 재시도한다', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(badFieldError("Unknown column 'product_id' in 'where clause'"))
      .mockResolvedValueOnce([[{ request_id: 2, supplier_name: 'X' }]]);
    const list = await listFinishedProductDeliveryRequestBlockers({ query }, 3);
    expect(list).toHaveLength(1);
    expect(String(query.mock.calls[1][0])).toContain('item_id');
  });

  it('ER_NO_SUCH_TABLE 이면 빈 배열', async () => {
    const query = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' })
    );
    const list = await listFinishedProductDeliveryRequestBlockers({ query }, 1);
    expect(list).toEqual([]);
  });
});
