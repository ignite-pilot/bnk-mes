/**
 * 납품사 정보 API — 삭제 시 참조 검사(활성 행만) 테스트
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

describe('납품사 정보 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DELETE /api/delivery-suppliers/:id', () => {
    it('참조 조회에 deleted = N 조건을 사용한다', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
      await request(app).delete('/api/delivery-suppliers/99').send({ updatedBy: 'u' });
      const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
      expect(sqls.some((s) => s.includes('delivery_affiliates') && s.includes("deleted = 'N'"))).toBe(true);
      expect(sqls.some((s) => s.includes('delivery_warehouses') && s.includes("deleted = 'N'"))).toBe(true);
      expect(sqls.some((s) => s.includes('delivery_requests') && s.includes("deleted = 'N'"))).toBe(true);
    });

    it('활성 참조가 없으면 소프트 삭제 성공', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).delete('/api/delivery-suppliers/1').send({ updatedBy: '관리자' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('활성 연계 업체가 있으면 400', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ cnt: 1 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]]);
      const res = await request(app).delete('/api/delivery-suppliers/1').send({ updatedBy: '관리자' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/사용하는 곳/);
    });
  });
});
