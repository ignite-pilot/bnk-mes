import { describe, expect, it } from '@jest/globals';
import {
  sanitizeSemiProductField,
  forwardFillMergedCells,
  toNullableTwoDecimal,
  toNullableInt,
} from './semi-product-import-helpers.js';

describe('semi-product-import-helpers', () => {
  it('sanitizeSemiProductField: \\r\\n → 한 칸 공백·공백 축약', () => {
    expect(sanitizeSemiProductField('a\r\nb')).toBe('a b');
    expect(sanitizeSemiProductField('  x   y  ')).toBe('x y');
    expect(sanitizeSemiProductField('')).toBe('');
  });

  it('forwardFillMergedCells: 빈 셀은 이전 행 값으로 채움', () => {
    const rows = [
      { 차종: 'RG3', 부위: 'MAIN', 칼라: '' },
      { 차종: '', 부위: '', 칼라: 'NNB' },
    ];
    const filled = forwardFillMergedCells(rows, ['차종', '부위', '칼라']);
    expect(filled[1].차종).toBe('RG3');
    expect(filled[1].부위).toBe('MAIN');
    expect(filled[1].칼라).toBe('NNB');
  });

  it('toNullableTwoDecimal / toNullableInt', () => {
    expect(toNullableTwoDecimal(0.256)).toBe(0.26);
    expect(toNullableInt(1180.6)).toBe(1181);
  });
});
