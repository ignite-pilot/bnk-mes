/**
 * dateUtils 테스트: 목록 검색 기간 시작 00:00:00, 종료 23:59:59
 */
import {
  toDate,
  startOfDay,
  endOfDay,
  toDateString,
  toStartOfDayString,
  toEndOfDayString,
  optionalSqlDateRange,
} from './dateUtils.js';

describe('dateUtils', () => {
  const dateOnly = '2025-03-15';

  describe('toDate', () => {
    it('returns Date for Date input', () => {
      const d = new Date('2025-03-15');
      expect(toDate(d)).toEqual(d);
    });
    it('returns Date for string input', () => {
      const d = toDate('2025-03-15');
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(2);
      expect(d.getDate()).toBe(15);
    });
    it('returns null for invalid input', () => {
      expect(toDate(null)).toBeNull();
      expect(toDate(undefined)).toBeNull();
      expect(toDate('invalid')).toBeNull();
    });
  });

  describe('toDateString', () => {
    it('returns YYYY-MM-DD for given date', () => {
      expect(toDateString(new Date(2025, 2, 15))).toBe('2025-03-15');
      expect(toDateString('2025-03-15')).toBe('2025-03-15');
    });
    it('returns null for invalid', () => {
      expect(toDateString(null)).toBeNull();
      expect(toDateString('invalid')).toBeNull();
    });
  });

  describe('toStartOfDayString', () => {
    it('returns YYYY-MM-DD 00:00:00', () => {
      expect(toStartOfDayString(new Date(2025, 2, 15))).toBe('2025-03-15 00:00:00');
      expect(toStartOfDayString('2025-03-15')).toBe('2025-03-15 00:00:00');
    });
    it('returns null for invalid', () => {
      expect(toStartOfDayString(null)).toBeNull();
    });
  });

  describe('toEndOfDayString', () => {
    it('returns YYYY-MM-DD 23:59:59', () => {
      expect(toEndOfDayString(new Date(2025, 2, 15))).toBe('2025-03-15 23:59:59');
      expect(toEndOfDayString('2025-03-15')).toBe('2025-03-15 23:59:59');
    });
    it('returns null for invalid', () => {
      expect(toEndOfDayString(null)).toBeNull();
    });
  });

  describe('startOfDay', () => {
    it('sets time to 00:00:00.000', () => {
      const d = new Date(2025, 2, 15, 14, 30, 45, 100);
      const s = startOfDay(d);
      expect(s.getFullYear()).toBe(2025);
      expect(s.getMonth()).toBe(2);
      expect(s.getDate()).toBe(15);
      expect(s.getHours()).toBe(0);
      expect(s.getMinutes()).toBe(0);
      expect(s.getSeconds()).toBe(0);
      expect(s.getMilliseconds()).toBe(0);
    });
  });

  describe('optionalSqlDateRange', () => {
    it('빈 문자열이면 null', () => {
      expect(optionalSqlDateRange('', '')).toBeNull();
      expect(optionalSqlDateRange(undefined, undefined)).toBeNull();
    });
    it('시작·종료가 있으면 from/to 문자열', () => {
      const r = optionalSqlDateRange('2025-01-10', '2025-01-12');
      expect(r).not.toBeNull();
      expect(r.from).toMatch(/^2025-01-10 00:00:00$/);
      expect(r.to).toMatch(/^2025-01-12 23:59:59$/);
    });
  });

  describe('endOfDay', () => {
    it('sets time to 23:59:59.999', () => {
      const d = new Date(2025, 2, 15, 9, 0, 0, 0);
      const e = endOfDay(d);
      expect(e.getFullYear()).toBe(2025);
      expect(e.getMonth()).toBe(2);
      expect(e.getDate()).toBe(15);
      expect(e.getHours()).toBe(23);
      expect(e.getMinutes()).toBe(59);
      expect(e.getSeconds()).toBe(59);
      expect(e.getMilliseconds()).toBe(999);
    });
  });
});
