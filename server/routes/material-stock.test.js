/**
 * 원자재 재고 관리 API 테스트 (DB 모킹)
 */
import { jest } from '@jest/globals';
import request from 'supertest';

const mockQuery = jest.fn();
jest.unstable_mockModule('../lib/db.js', () => ({
  default: {
    query: mockQuery,
    getConnection: jest.fn(() =>
      Promise.resolve({
        query: mockQuery,
        release: jest.fn(),
      })
    ),
  },
}));

const { default: app } = await import('../index.js');

describe('원자재 재고 관리 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/material-stock', () => {
    it('목록 조회 시 200과 list/total/page/limit 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);
      const res = await request(app).get('/api/material-stock');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('list');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
      expect(Array.isArray(res.body.list)).toBe(true);
    });

    it('검색 파라미터 전달 시 query 호출', async () => {
      mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
      await request(app).get('/api/material-stock?type=supplier&page=1&limit=20');
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('GET /api/material-stock/bnk-warehouses', () => {
    it('비엔케이 창고 목록 200 및 list 반환', async () => {
      mockQuery.mockResolvedValueOnce([[{ id: 1, name: '본사창고' }]]);
      const res = await request(app).get('/api/material-stock/bnk-warehouses');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('list');
      expect(res.body.list).toHaveLength(1);
      expect(res.body.list[0]).toHaveProperty('name', '본사창고');
    });
  });

  describe('GET /api/material-stock/:id', () => {
    it('없는 ID 조회 시 404', async () => {
      mockQuery.mockResolvedValueOnce([[]]);
      const res = await request(app).get('/api/material-stock/999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('단건 조회 시 200 및 snapshot + lines 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, snapshot_type: 'bnk', stock_date: '2025-03-01', bnk_warehouse_name: '본사' }]])
        .mockResolvedValueOnce([[{ raw_material_id: 1, quantity: 100, raw_material_name: '판재' }]]);
      const res = await request(app).get('/api/material-stock/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('lines');
      expect(res.body.lines).toHaveLength(1);
    });
  });

  describe('POST /api/material-stock', () => {
    it('필수 항목 없으면 400', async () => {
      const res = await request(app).post('/api/material-stock').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('stockDate 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-stock')
        .send({ snapshotType: 'bnk', bnkWarehouseId: 1, lines: [{ raw_material_id: 1, quantity: 10 }], updatedBy: 'tester' });
      expect(res.status).toBe(400);
    });

    it('updatedBy 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-stock')
        .send({ snapshotType: 'bnk', bnkWarehouseId: 1, stockDate: '2025-03-01', lines: [{ raw_material_id: 1, quantity: 10 }] });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/material-stock/:id', () => {
    it('삭제 성공 시 200 및 ok 반환', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app)
        .delete('/api/material-stock/1')
        .send({ updatedBy: 'tester' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
    });

    it('없는 ID 삭제 시 404', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const res = await request(app).delete('/api/material-stock/999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });
});
