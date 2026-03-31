/**
 * 완제품 정보 API — 삭제 (DB 모킹)
 */
import { jest } from '@jest/globals';
import request from 'supertest';

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.unstable_mockModule('../lib/db.js', () => ({
  initDb: jest.fn(() => Promise.resolve()),
  getPool: jest.fn(() => mockPool),
  default: { initDb: jest.fn(() => Promise.resolve()), getPool: jest.fn(() => mockPool) },
}));

const { default: app } = await import('../index.js');

describe('완제품 정보 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/delivery-finished-products', () => {
    it('목록 검색 시 차량/부위/색상 코드 조건을 사용한다', async () => {
      mockQuery
        .mockResolvedValueOnce([[]]) // list
        .mockResolvedValueOnce([[{ total: 0 }]]); // count

      const res = await request(app)
        .get('/api/delivery-finished-products')
        .query({ vehicleCode: 'RG3PE', partCode: 'MAIN', colorCode: 'NNB' });

      expect(res.status).toBe(200);
      const listSql = String(mockQuery.mock.calls[0][0]);
      const countSql = String(mockQuery.mock.calls[1][0]);
      expect(listSql).toMatch(/vehicle_code = \?/);
      expect(listSql).toMatch(/part_code = \?/);
      expect(listSql).toMatch(/color_code = \?/);
      expect(countSql).toMatch(/vehicle_code = \?/);
    });
  });

  describe('POST /api/delivery-finished-products', () => {
    it('코드 없이도 등록 가능하고 신규 필드를 저장한다', async () => {
      mockQuery
        .mockResolvedValueOnce([{ insertId: 7 }])
        .mockResolvedValueOnce([[{ id: 7, code: null, affiliate_id: 2, two_width: 11.1, ratio: 1.2 }]]);

      const res = await request(app)
        .post('/api/delivery-finished-products')
        .send({
          code: '',
          affiliate_id: 2,
          two_width: 11.1,
          ratio: 1.2,
          updatedBy: 'tester',
        });

      expect(res.status).toBe(201);
      const insertSql = String(mockQuery.mock.calls[0][0]);
      expect(insertSql).toMatch(/affiliate_id/);
      expect(insertSql).toMatch(/two_width/);
      expect(insertSql).toMatch(/ratio/);
      expect(res.body.id).toBe(7);
    });

    it('숫자 필드는 규격에 맞게 정규화한다 (두께 1자리, 나머지 정수)', async () => {
      mockQuery
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 8 }])
        .mockResolvedValueOnce([[{ id: 8 }]]);

      const res = await request(app)
        .post('/api/delivery-finished-products')
        .send({
          code: 'FP-8',
          thickness: 1.26,
          width: 100.4,
          two_width: 200.5,
          length: 300.6,
          ratio: 12.9,
          updatedBy: 'tester',
        });

      expect(res.status).toBe(201);
      const params = mockQuery.mock.calls[1][1];
      expect(params[10]).toBe(1.3); // thickness
      expect(params[11]).toBe(100); // width
      expect(params[12]).toBe(201); // two_width
      expect(params[13]).toBe(301); // length
      expect(params[14]).toBe(13); // ratio
    });
  });

  describe('DELETE /api/delivery-finished-products/:id', () => {
    it('납품 요청 참조 없으면 M:N 제거 후 soft delete (product_id 로 건수 조회)', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .delete('/api/delivery-finished-products/1')
        .send({ updatedBy: 'tester' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const firstSql = String(mockQuery.mock.calls[0][0]);
      expect(firstSql).toMatch(/delivery_request_items/);
      expect(firstSql).toMatch(/product_id/);
      expect(String(mockQuery.mock.calls[1][0])).toMatch(/delivery_supplier_finished_products/);
      expect(String(mockQuery.mock.calls[1][0])).toMatch(/DELETE/);
      expect(String(mockQuery.mock.calls[2][0])).toMatch(/delivery_warehouse_products/);
    });

    it('납품 요청 품목에 남아 있으면 400 및 blockers 목록', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ cnt: 2 }]])
        .mockResolvedValueOnce([
          [
            {
              request_id: 88,
              supplier_name: '테스트 납품사',
              request_date: new Date('2025-01-15'),
              desired_date: new Date('2025-01-20'),
              request_status: 'requested',
              request_item_id: 101,
              quantity: 3,
              item_status: 'requested',
            },
          ],
        ]);
      const res = await request(app).delete('/api/delivery-finished-products/99').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/납품 요청/);
      expect(Array.isArray(res.body.blockers)).toBe(true);
      expect(res.body.blockers.length).toBe(1);
      expect(res.body.blockers[0]).toMatchObject({
        request_id: 88,
        supplier_name: '테스트 납품사',
        request_date: '2025-01-15',
        desired_date: '2025-01-20',
        quantity: 3,
      });
    });

    it('납품사↔완제품 DELETE 시 테이블 없으면 ER_NO_SUCH_TABLE 무시 후 진행', async () => {
      const noTable = Object.assign(new Error("doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
      mockQuery
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockRejectedValueOnce(noTable)
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app).delete('/api/delivery-finished-products/5').send({ updatedBy: 't' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('레거시 DB(item_id)여도 삭제가 500 없이 진행된다', async () => {
      const legacyErr = Object.assign(new Error("Unknown column 'product_id'"), {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'product_id' in 'where clause'",
      });
      mockQuery
        .mockRejectedValueOnce(legacyErr)
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .delete('/api/delivery-finished-products/42')
        .send({ updatedBy: 'tester' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(String(mockQuery.mock.calls[1][0])).toMatch(/item_id/);
    });
  });
});
