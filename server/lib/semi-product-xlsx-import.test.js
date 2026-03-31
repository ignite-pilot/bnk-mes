import { describe, expect, it, jest } from '@jest/globals';
import { runSemiProductImportRows } from './semi-product-xlsx-import.js';

describe('runSemiProductImportRows', () => {
  it('rowExcelNumbers 가 있으면 해당 엑셀 행만 처리한다', async () => {
    const inserts = [];
    const conn = {
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes('SELECT id FROM delivery_semi_products')) {
          return [[]];
        }
        if (String(sql).includes('INSERT INTO delivery_semi_products')) {
          inserts.push(params);
          return [{}];
        }
        return [[]];
      }),
    };

    const vehicle = new Set(['A']);
    const part = new Set(['P']);
    const color = new Set(['C']);

    const rows = [
      {},
      { 차종: 'A', 부위: 'P', 칼라: 'C', '완제품 코드': '1' },
      { 차종: 'A', 부위: 'P', 칼라: 'C', '완제품 코드': '2' },
    ];

    const result = await runSemiProductImportRows({
      conn,
      rows,
      rowExcelNumbers: new Set([3]),
      vehicleCodeSet: vehicle,
      partCodeSet: part,
      colorCodeSet: color,
    });

    expect(result.inserted).toBe(1);
    expect(inserts.length).toBe(1);
    // 엑셀 행 3 = rows[1], 완제품 코드 '1'
    expect(inserts[0][0]).toBe('1');
  });

  it('semiProductType 을 지정하면 INSERT 파라미터에 반영한다', async () => {
    const inserts = [];
    const conn = {
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes('SELECT id FROM delivery_semi_products')) {
          return [[]];
        }
        if (String(sql).includes('INSERT INTO delivery_semi_products')) {
          inserts.push(params);
          return [{}];
        }
        return [[]];
      }),
    };

    const vehicle = new Set(['A']);
    const part = new Set(['P']);
    const color = new Set(['C']);

    const rows = [{ 차종: 'A', 부위: 'P', 칼라: 'C', '완제품 코드': 'X' }];

    await runSemiProductImportRows({
      conn,
      rows,
      rowExcelNumbers: null,
      vehicleCodeSet: vehicle,
      partCodeSet: part,
      colorCodeSet: color,
      semiProductType: 'UNDERLAYER',
    });

    expect(inserts.length).toBe(1);
    expect(inserts[0][1]).toBe('UNDERLAYER');
  });
});
