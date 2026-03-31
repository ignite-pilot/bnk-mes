/**
 * 원자재 API 테스트 (DB 모킹)
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

describe('원자재 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/material', () => {
    it('목록 조회 시 200과 list/total 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, kind: 'A', name: '원자재1' }]])
        .mockResolvedValueOnce([[{ total: 1 }]]);
      const res = await request(app).get('/api/material');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('list');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body.list).toHaveLength(1);
      expect(res.body.list[0]).toHaveProperty('kind', 'A');
    });

    it('검색 파라미터 전달 시 query 호출', async () => {
      mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
      await request(app).get('/api/material?kindId=1&name=plate&page=1&limit=10');
      expect(mockQuery).toHaveBeenCalled();
    });

    it('목록 조회 WHERE에 등록일자 범위(created_at >=) 조건을 넣지 않는다', async () => {
      mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
      await request(app).get('/api/material');
      const listSql = mockQuery.mock.calls[0][0];
      expect(String(listSql)).not.toMatch(/created_at\s*>/);
    });
  });

  describe('GET /api/material/types', () => {
    it('원자재 종류 목록 200 및 list 반환', async () => {
      mockQuery.mockResolvedValueOnce([[{ id: 1, name: '상지', sort_order: 1 }]]);
      const res = await request(app).get('/api/material/types');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('list');
      expect(res.body.list[0]).toHaveProperty('name', '상지');
    });
  });

  describe('GET /api/material/export-excel', () => {
    it('엑셀 다운로드 시 CSV 헤더와 200 반환', async () => {
      mockQuery.mockResolvedValueOnce([
        [{ kind: 'A', name: '테스트', color: null, thickness: null, width: null, length: null, supplier_safety_stock: 0, bnk_warehouse_safety_stock: 0, created_at: new Date(), updated_at: new Date(), created_by: null, updated_by: null }],
      ]);
      const res = await request(app).get('/api/material/export-excel');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/csv/);
      expect(res.headers['content-disposition']).toMatch(/raw_materials\.csv/);
      expect(res.text).toContain('원자재 종류');
    });

    it('엑셀 조회 WHERE에 등록일자 범위(created_at >=) 조건을 넣지 않는다', async () => {
      mockQuery.mockResolvedValueOnce([[]]);
      await request(app).get('/api/material/export-excel');
      const sql = mockQuery.mock.calls[0][0];
      expect(String(sql)).not.toMatch(/created_at\s*>/);
    });
  });

  describe('GET /api/material/:id', () => {
    it('존재하지 않는 ID 시 404', async () => {
      mockQuery.mockResolvedValue([[]]);
      const res = await request(app).get('/api/material/999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('숫자 아닌 ID 시 400', async () => {
      const res = await request(app).get('/api/material/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/material', () => {
    it('kind_id/name 없으면 400', async () => {
      const res = await request(app).post('/api/material').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/필수/);
    });

    it('등록자(createdBy) 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material')
        .send({ kind_id: 1, name: '판재' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/등록자/);
    });

    it('kind_id/name/createdBy 있으면 201 및 생성 데이터 반환', async () => {
      const created = { id: 1, kind_id: 1, kind: '상지', name: '판재', created_at: new Date() };
      mockQuery
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[created]]);
      const res = await request(app)
        .post('/api/material')
        .send({ kind_id: 1, name: '판재', createdBy: '홍길동' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('kind', '상지');
    });

    it('원자재 이름 중복 시 409', async () => {
      mockQuery.mockResolvedValueOnce([[{ id: 99 }]]);
      const res = await request(app)
        .post('/api/material')
        .send({ kind_id: 1, name: '판재', createdBy: '홍길동' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/이미 사용 중인 원자재 이름/);
    });
  });

  describe('PATCH /api/material/:id', () => {
    it('수정 항목 없으면 400', async () => {
      mockQuery.mockResolvedValue([[{ id: 1 }]]);
      const res = await request(app).patch('/api/material/1').send({});
      expect(res.status).toBe(400);
    });

    it('수정 시 원자재 이름이 다른 행과 중복이면 409', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[{ id: 2 }]]);
      const res = await request(app)
        .patch('/api/material/1')
        .send({ name: '중복이름', updatedBy: '수정자' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/이미 사용 중인 원자재 이름/);
    });
  });

  describe('DELETE /api/material/:id', () => {
    it('삭제 시 200 및 ok 반환', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).delete('/api/material/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
    });

    it('없는 ID 삭제 시 404', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const res = await request(app).delete('/api/material/999');
      expect(res.status).toBe(404);
    });

    it('삭제 시 body에 updatedBy 전달하면 수정일자·수정자 갱신용으로 사용', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app)
        .delete('/api/material/1')
        .send({ updatedBy: '삭제작업자' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/updated_at|updated_by/),
        expect.arrayContaining(['삭제작업자', 1])
      );
    });
  });
});
