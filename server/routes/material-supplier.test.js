/**
 * 원자재 공급 업체 API 테스트 (DB 모킹)
 */
import { jest } from '@jest/globals';
import request from 'supertest';

const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
  getConnection: jest.fn(() =>
    Promise.resolve({
      query: mockQuery,
      release: jest.fn(),
    })
  ),
};
jest.unstable_mockModule('../lib/db.js', () => ({
  initDb: jest.fn(() => Promise.resolve()),
  getPool: jest.fn(() => mockPool),
  default: { initDb: jest.fn(() => Promise.resolve()), getPool: jest.fn(() => mockPool) },
}));

const { default: app } = await import('../index.js');

describe('원자재 공급 업체 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/material-suppliers', () => {
    it('목록 조회 시 200과 list/total 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, name: 'A업체', contact: null, manager_name: null, manager_contact: null, material_count: 2, updated_at: new Date(), updated_by: 'user' }]])
        .mockResolvedValueOnce([[{ total: 1 }]]);
      const res = await request(app).get('/api/material-suppliers');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('list');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body.list[0]).toHaveProperty('name', 'A업체');
      expect(res.body.list[0]).toHaveProperty('material_count', 2);
    });

    it('검색 파라미터 전달 시 query 호출', async () => {
      mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
      await request(app).get('/api/material-suppliers?name=supplier&page=1&limit=10');
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('GET /api/material-suppliers/export-excel', () => {
    it('엑셀 다운로드 시 CSV 헤더와 200 반환', async () => {
      mockQuery.mockResolvedValueOnce([
        [{ name: 'A업체', address: '서울', contact: null, manager_name: null, manager_contact: null, inbound_lead_time: null, order_lead_time: null, material_count: 0, updated_at: new Date(), updated_by: 'user' }],
      ]);
      const res = await request(app).get('/api/material-suppliers/export-excel');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/csv/);
      expect(res.headers['content-disposition']).toMatch(/raw_material_suppliers\.csv/);
      expect(res.text).toContain('업체 명');
    });
  });

  describe('GET /api/material-suppliers/:id', () => {
    it('존재하지 않는 ID 시 404', async () => {
      mockQuery.mockResolvedValueOnce([[]]);
      const res = await request(app).get('/api/material-suppliers/999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('단건 조회 시 raw_material_ids 포함', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, name: 'A업체', material_count: 1 }]])
        .mockResolvedValueOnce([[{ raw_material_id: 10 }, { raw_material_id: 20 }]]);
      const res = await request(app).get('/api/material-suppliers/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('raw_material_ids');
      expect(res.body.raw_material_ids).toEqual([10, 20]);
    });
  });

  describe('POST /api/material-suppliers', () => {
    it('name/address 없으면 400', async () => {
      const res = await request(app).post('/api/material-suppliers').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/필수|업체 명|주소/);
    });

    it('수정자(updatedBy) 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-suppliers')
        .send({ name: 'A업체', address: '서울시', manager_email: 'a@b.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/수정자/);
    });

    it('담당자 이메일(manager_email) 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-suppliers')
        .send({ name: 'A업체', address: '서울시', updatedBy: '홍길동' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/담당자 이메일/);
    });

    it('name/address/manager_email/updatedBy 있으면 201 및 생성 데이터 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[{ id: 1, name: 'A업체', address: '서울시', manager_email: 'a@b.com' }]])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .post('/api/material-suppliers')
        .send({ name: 'A업체', address: '서울시', manager_email: 'a@b.com', updatedBy: '홍길동' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('name', 'A업체');
    });
  });

  describe('PATCH /api/material-suppliers/:id', () => {
    it('수정 항목 없으면 400', async () => {
      mockQuery.mockResolvedValue([[{ id: 1 }]]);
      const res = await request(app).patch('/api/material-suppliers/1').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/material-suppliers/:id', () => {
    it('삭제 시 200 및 ok 반환', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).delete('/api/material-suppliers/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
    });

    it('없는 ID 삭제 시 404', async () => {
      mockQuery.mockResolvedValue([{ affectedRows: 0 }]);
      const res = await request(app).delete('/api/material-suppliers/999');
      expect(res.status).toBe(404);
    });
  });
});
