/**
 * 원자재 입고 요청/입고 관리 API 테스트 (DB·notification 모킹)
 */
import { jest } from '@jest/globals';
import request from 'supertest';

const mockQuery = jest.fn();
const sendInboundEmail = jest.fn();

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
jest.unstable_mockModule('../lib/notification.js', () => ({
  sendInboundEmail,
}));

const { default: app } = await import('../index.js');

describe('원자재 입고 요청 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendInboundEmail.mockResolvedValue({ ok: true });
  });

  describe('GET /api/material-inbound', () => {
    it('view=requests 시 입고 요청 목록 200 및 list/total 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([
          [{ id: 1, supplier_id: 1, supplier_name: '업체A', desired_date: '2025-03-10', request_date: '2025-03-03', status: 'active', material_kind_count: 2, line_request_count: 1, line_received_count: 0, line_returned_count: 0 }],
        ])
        .mockResolvedValueOnce([[{ total: 1 }]]);
      const res = await request(app).get('/api/material-inbound?view=requests&page=1&limit=20');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('list');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body.list).toHaveLength(1);
      expect(res.body.list[0]).toHaveProperty('supplier_name', '업체A');
    });

    it('view=requests 시 request.status=received 이면 status_label 전체 입고', async () => {
      mockQuery
        .mockResolvedValueOnce([
          [{ id: 1, supplier_id: 1, supplier_name: '업체A', desired_date: '2025-03-10', request_date: '2025-03-03', status: 'received', material_kind_count: 2, line_request_count: 0, line_received_count: 2, line_returned_count: 0 }],
        ])
        .mockResolvedValueOnce([[{ total: 1 }]]);
      const res = await request(app).get('/api/material-inbound?view=requests&page=1&limit=20');
      expect(res.status).toBe(200);
      expect(res.body.list[0]).toHaveProperty('status_label', '전체 입고');
    });

    it('view=lines 시 입고 상세(라인) 목록 200 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([
          [
            {
              line_id: 1,
              request_id: 1,
              request_date: '2025-03-03',
              desired_date: '2025-03-10',
              supplier_name: '업체A',
              raw_material_name: '원자재1',
              raw_material_kind: '상지',
              line_status: 'request',
            },
          ],
        ])
        .mockResolvedValueOnce([[{ total: 1 }]]);
      const res = await request(app).get('/api/material-inbound?view=lines&page=1&limit=20');
      expect(res.status).toBe(200);
      expect(res.body.list).toHaveLength(1);
      expect(res.body.list[0]).toHaveProperty('line_status', 'request');
    });
  });

  describe('GET /api/material-inbound/export-excel', () => {
    it('엑셀 다운로드 시 CSV 200 및 헤더 반환', async () => {
      mockQuery.mockResolvedValueOnce([
        [{ request_date: '2025-03-03', desired_date: '2025-03-10', supplier_name: '업체A', material_kind_count: 2, status: 'active' }],
      ]);
      const res = await request(app).get('/api/material-inbound/export-excel?view=requests&startDate=2025-03-01&endDate=2025-03-31');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/csv/);
      expect(res.headers['content-disposition']).toMatch(/material_inbound_requests\.csv/);
      expect(res.text).toContain('입고 요청일');
      expect(res.text).toContain('원자재 업체');
    });
  });

  describe('GET /api/material-inbound/:id', () => {
    it('존재하는 요청 ID 시 200 및 요청+라인 반환', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, supplier_id: 1, supplier_name: '업체A', desired_date: '2025-03-10', request_date: '2025-03-03', status: 'active', manager_email: 'a@b.com' }]])
        .mockResolvedValueOnce([[{ id: 1, raw_material_id: 1, quantity: 10, status: 'request', raw_material_name: '원자재1', raw_material_kind: '상지' }]]);
      const res = await request(app).get('/api/material-inbound/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('supplier_name', '업체A');
      expect(res.body).toHaveProperty('lines');
      expect(res.body.lines).toHaveLength(1);
    });

    it('request.status=received 이면 status_label 전체 입고', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, supplier_id: 1, supplier_name: '업체A', desired_date: '2025-03-10', request_date: '2025-03-03', status: 'received', manager_email: null }]])
        .mockResolvedValueOnce([[{ id: 1, raw_material_id: 1, quantity: 10, status: 'received', raw_material_name: '원자재1', raw_material_kind: '상지' }]]);
      const res = await request(app).get('/api/material-inbound/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status_label', '전체 입고');
    });

    it('존재하지 않는 ID 시 404', async () => {
      mockQuery.mockResolvedValueOnce([[]]);
      const res = await request(app).get('/api/material-inbound/999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('숫자 아닌 ID 시 400', async () => {
      const res = await request(app).get('/api/material-inbound/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/material-inbound', () => {
    it('필수 필드 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-inbound')
        .send({ supplierId: 1 });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('수정자 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-inbound')
        .send({
          supplierId: 1,
          desiredDate: '2025-03-10',
          lines: [{ raw_material_id: 1, quantity: 10 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/수정자/);
    });

    it('원자재 라인 없으면 400', async () => {
      const res = await request(app)
        .post('/api/material-inbound')
        .send({
          supplierId: 1,
          desiredDate: '2025-03-10',
          lines: [],
          updatedBy: 'tester',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/원자재/);
    });

    it('정상 등록 시 201 및 이메일 발송 호출', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, name: '업체A', manager_email: 'a@b.com' }]])
        .mockResolvedValueOnce([{ insertId: 100 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ id: 100, supplier_id: 1, desired_date: '2025-03-10', request_date: '2025-03-03', status: 'active', supplier_name: '업체A' }]])
        .mockResolvedValueOnce([[{ id: 1, raw_material_id: 1, quantity: 10, status: 'request', raw_material_name: '원자재1', raw_material_kind: '상지' }]]);
      const res = await request(app)
        .post('/api/material-inbound')
        .set('Content-Type', 'application/json')
        .send({
          supplierId: 1,
          desiredDate: '2025-03-10',
          lines: [{ raw_material_id: 1, quantity: 10 }],
          updatedBy: 'tester',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 100);
      expect(res.body).toHaveProperty('lines');
      expect(sendInboundEmail).toHaveBeenCalledWith('a@b.com', expect.any(String), expect.any(String));
    });
  });

  describe('PATCH /api/material-inbound/:id', () => {
    it('action 없거나 잘못된 action 시 400', async () => {
      const res = await request(app)
        .patch('/api/material-inbound/1')
        .send({ updatedBy: 'tester' });
      expect(res.status).toBe(400);
    });

    it('cancel 시 요청 상태만 허용하고 200', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, supplier_name: '업체A', desired_date: '2025-03-10', manager_email: 'a@b.com' }]])
        .mockResolvedValueOnce([[{ id: 1, status: 'request' }, { id: 2, status: 'request' }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ id: 1, status: 'cancelled', supplier_name: '업체A' }]])
        .mockResolvedValueOnce([[{ id: 1, raw_material_name: '원자재1', raw_material_kind: '상지' }]]);
      const res = await request(app)
        .patch('/api/material-inbound/1')
        .set('Content-Type', 'application/json')
        .send({ action: 'cancel', updatedBy: 'tester' });
      expect(res.status).toBe(200);
      expect(sendInboundEmail).toHaveBeenCalled();
    });

    it('receive-all 시 200, 요청 status=received 로 갱신 및 이메일 발송', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, supplier_name: '업체A', manager_email: 'a@b.com', desired_date: '2025-03-10' }]])
        .mockResolvedValueOnce([[{ id: 1, status: 'request' }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ id: 1, status: 'received', supplier_name: '업체A' }]])
        .mockResolvedValueOnce([[{ id: 1, status: 'received', raw_material_name: '원자재1', raw_material_kind: '상지' }]]);
      const res = await request(app)
        .patch('/api/material-inbound/1')
        .set('Content-Type', 'application/json')
        .send({ action: 'receive-all', updatedBy: 'tester' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'received');
      expect(sendInboundEmail).toHaveBeenCalled();
    });

    it('return-all 시 요청 status=returned 로 갱신', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, supplier_name: '업체B', manager_email: null, desired_date: '2025-03-15' }]])
        .mockResolvedValueOnce([[{ id: 1, status: 'request' }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ id: 1, status: 'returned', supplier_name: '업체B' }]])
        .mockResolvedValueOnce([[{ id: 1, status: 'returned', raw_material_name: '원자재2', raw_material_kind: null }]]);
      const res = await request(app)
        .patch('/api/material-inbound/1')
        .set('Content-Type', 'application/json')
        .send({ action: 'return-all', updatedBy: 'tester' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'returned');
    });
  });

  describe('PATCH /api/material-inbound/:requestId/lines/:lineId', () => {
    it('status 없거나 잘못된 값 시 400', async () => {
      const res = await request(app)
        .patch('/api/material-inbound/1/lines/1')
        .send({ updatedBy: 'tester' });
      expect(res.status).toBe(400);
    });

    it('received 정상 시 200 및 해당 요청의 모든 라인이 received면 요청 status=received 로 갱신', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, request_id: 1, supplier_name: '업체A', manager_email: 'a@b.com', raw_material_name: '원자재1' }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ status: 'received' }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ id: 1, status: 'received', raw_material_name: '원자재1', raw_material_kind: '상지' }]]);
      const res = await request(app)
        .patch('/api/material-inbound/1/lines/1')
        .set('Content-Type', 'application/json')
        .send({ status: 'received', updatedBy: 'tester' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'received');
      expect(sendInboundEmail).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(5);
    });

    it('라인 반품 시 일부만 반품이면 요청은 active 유지', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ id: 2, request_id: 1, supplier_name: '업체A', manager_email: null, raw_material_name: '원자재2' }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ status: 'received' }, { status: 'returned' }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ id: 2, status: 'returned', raw_material_name: '원자재2', raw_material_kind: null }]]);
      const res = await request(app)
        .patch('/api/material-inbound/1/lines/2')
        .set('Content-Type', 'application/json')
        .send({ status: 'returned', updatedBy: 'tester' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'returned');
    });
  });
});
