/**
 * 원자재 업체 창고 정보 API 테스트 (DB 모킹)
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

describe('원자재 업체 창고 정보 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/material-warehouses', () => {
    it('목록 조회 시 200과 list/total 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              supplier_id: 10,
              supplier_name: 'A업체',
              name: '1호 창고',
              address: '서울시',
              updated_at: new Date(),
              updated_by: 'user',
            },
          ],
        ])
        .mockResolvedValueOnce([[{ total: 1 }]]);
      const res = await request(app).get('/api/material-warehouses');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('list');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body.list[0]).toHaveProperty('supplier_name', 'A업체');
      expect(res.body.list[0]).toHaveProperty('name', '1호 창고');
    });

    it('검색 파라미터 전달 시 query 호출', async () => {
      mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
      const q = new URLSearchParams({ supplierId: '1', warehouseName: '창고', page: '1', limit: '10' });
      await request(app).get(`/api/material-warehouses?${q.toString()}`);
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('GET /api/material-warehouses/export-excel', () => {
    it('엑셀 다운로드 시 CSV 헤더와 200 반환', async () => {
      mockQuery.mockResolvedValueOnce([
        [
          {
            supplier_name: 'A업체',
            name: '1호 창고',
            address: '서울시',
            postal_code: null,
            address_detail: null,
            updated_at: new Date(),
            updated_by: 'user',
          },
        ],
      ]);
      const res = await request(app).get('/api/material-warehouses/export-excel');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/csv/);
      expect(res.headers['content-disposition']).toMatch(/supplier_warehouses\.csv/);
      expect(res.text).toContain('원자재 공급 업체');
      expect(res.text).toContain('창고 이름');
    });
  });

  describe('GET /api/material-warehouses/:id', () => {
    it('존재하지 않는 ID 시 404', async () => {
      mockQuery.mockResolvedValueOnce([[]]);
      const res = await request(app).get('/api/material-warehouses/999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('단건 조회 시 raw_material_ids 포함', async () => {
      mockQuery
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              supplier_id: 10,
              supplier_name: 'A업체',
              name: '1호 창고',
              address: '서울시',
            },
          ],
        ])
        .mockResolvedValueOnce([[{ raw_material_id: 10 }, { raw_material_id: 20 }]]);
      const res = await request(app).get('/api/material-warehouses/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('raw_material_ids');
      expect(res.body.raw_material_ids).toEqual([10, 20]);
    });
  });

  describe('POST /api/material-warehouses', () => {
    it('supplier_id/name/address 없으면 400', async () => {
      const res = await request(app).post('/api/material-warehouses').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/필수|공급 업체|창고 이름|주소|수정자/);
    });

    it('수정자(updatedBy) 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-warehouses')
        .send({ supplier_id: 1, name: '1호 창고', address: '서울시' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/수정자/);
    });

    it('필수 항목 있으면 201 및 생성 데이터 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              supplier_id: 1,
              supplier_name: 'A업체',
              name: '1호 창고',
              address: '서울시',
            },
          ],
        ])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .post('/api/material-warehouses')
        .send({
          supplier_id: 1,
          name: '1호 창고',
          address: '서울시',
          updatedBy: 'user',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('name', '1호 창고');
      expect(res.body).toHaveProperty('raw_material_ids');
    });
  });

  describe('DELETE /api/material-warehouses/:id', () => {
    it('삭제 시 플래그만 변경하고 200', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app)
        .delete('/api/material-warehouses/1')
        .send({ updatedBy: 'user' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("deleted = 'Y'"),
        expect.any(Array)
      );
    });

    it('존재하지 않는 ID 삭제 시 404', async () => {
      mockQuery.mockResolvedValue([{ affectedRows: 0 }]);
      const res = await request(app).delete('/api/material-warehouses/999');
      expect(res.status).toBe(404);
    });
  });
});
