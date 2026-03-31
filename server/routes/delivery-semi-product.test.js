/**
 * 반제품 정보 API 테스트 (DB 모킹)
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

describe('반제품 정보 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST 등록 시 ratio를 저장한다', async () => {
    mockQuery
      .mockResolvedValueOnce([[]]) // dup code
      .mockResolvedValueOnce([{ insertId: 3 }]) // insert
      .mockResolvedValueOnce([[{ id: 3, ratio: 1.25 }]]); // select created

    const res = await request(app).post('/api/delivery-semi-products').send({
      name: '반제품A',
      code: 'S-001',
      ratio: 1.25,
      updatedBy: 'tester',
    });

    expect(res.status).toBe(201);
    const insertSql = String(mockQuery.mock.calls[1][0]);
    const insertParams = mockQuery.mock.calls[1][1];
    expect(insertSql).toMatch(/ratio/);
    expect(insertParams[6]).toBe(1);
  });

  it('PATCH 수정 시 ratio를 업데이트한다', async () => {
    mockQuery
      .mockResolvedValueOnce([[{ id: 1 }]]) // existing check
      .mockResolvedValueOnce([[]]) // dup code check
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // update
      .mockResolvedValueOnce([[{ id: 1, ratio: 0.8 }]]); // select updated

    const res = await request(app).patch('/api/delivery-semi-products/1').send({
      name: '반제품A',
      code: 'S-001',
      ratio: 0.8,
      updatedBy: 'tester',
    });

    expect(res.status).toBe(200);
    const updateSql = String(mockQuery.mock.calls[2][0]);
    const updateParams = mockQuery.mock.calls[2][1];
    expect(updateSql).toMatch(/ratio = \?/);
    expect(updateParams).toContain(1);
  });

  it('POST 등록 시 code 없이도 등록되고 semi_product_type을 저장한다', async () => {
    mockQuery
      .mockResolvedValueOnce([{ insertId: 4 }]) // insert (code null이므로 dup check 없음)
      .mockResolvedValueOnce([[{ id: 4, code: null, semi_product_type: 'SEMI_A' }]]); // select created

    const res = await request(app).post('/api/delivery-semi-products').send({
      semi_product_type: 'SEMI_A',
      updatedBy: 'tester',
    });

    expect(res.status).toBe(201);
    const insertSql = String(mockQuery.mock.calls[0][0]);
    expect(insertSql).toMatch(/semi_product_type/);
  });

  it('POST 등록 시 vehicle_code, part_code, color_code를 저장한다', async () => {
    mockQuery
      .mockResolvedValueOnce([[]]) // dup code
      .mockResolvedValueOnce([{ insertId: 6 }]) // insert
      .mockResolvedValueOnce([[{ id: 6 }]]); // select created

    const res = await request(app).post('/api/delivery-semi-products').send({
      code: 'S-600',
      vehicle_code: 'RG3PE',
      part_code: 'MAIN',
      color_code: 'NNB',
      updatedBy: 'tester',
    });

    expect(res.status).toBe(201);
    const insertSql = String(mockQuery.mock.calls[1][0]);
    const insertParams = mockQuery.mock.calls[1][1];
    expect(insertSql).toMatch(/vehicle_code/);
    expect(insertSql).toMatch(/part_code/);
    expect(insertParams[3]).toBe('RG3PE');
    expect(insertParams[4]).toBe('MAIN');
    expect(insertParams[7]).toBe('NNB');
  });

  it('POST 등록 시 supplier_name을 저장한다', async () => {
    mockQuery
      .mockResolvedValueOnce([[]]) // dup code
      .mockResolvedValueOnce([{ insertId: 7 }]) // insert
      .mockResolvedValueOnce([[{ id: 7 }]]); // select created

    const res = await request(app).post('/api/delivery-semi-products').send({
      code: 'S-700',
      supplier_name: '한진피엘',
      updatedBy: 'tester',
    });

    expect(res.status).toBe(201);
    const insertSql = String(mockQuery.mock.calls[1][0]);
    const insertParams = mockQuery.mock.calls[1][1];
    expect(insertSql).toMatch(/supplier_name/);
    expect(insertParams[5]).toBe('한진피엘');
  });

  it('POST 등록 시 두께는 소수점 2자리, 폭/배율은 정수로 저장한다', async () => {
    mockQuery
      .mockResolvedValueOnce([[]]) // dup code
      .mockResolvedValueOnce([{ insertId: 5 }]) // insert
      .mockResolvedValueOnce([[{ id: 5 }]]); // select created

    const res = await request(app).post('/api/delivery-semi-products').send({
      code: 'S-500',
      thickness: 0.256,
      width: 1180.6,
      ratio: 1.7,
      updatedBy: 'tester',
    });

    expect(res.status).toBe(201);
    const insertParams = mockQuery.mock.calls[1][1];
    expect(insertParams[6]).toBe(2);
    expect(insertParams[9]).toBe(0.26);
    expect(insertParams[10]).toBe(1181);
  });
});
