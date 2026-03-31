import { describe, it, expect } from 'vitest';
import { parseApiJsonBody } from './parseApiJsonBody.js';

describe('parseApiJsonBody', () => {
  it('빈 문자열이면 빈 객체', () => {
    expect(parseApiJsonBody('', 500)).toEqual({});
    expect(parseApiJsonBody('   ', 404)).toEqual({});
  });

  it('유효 JSON이면 파싱 결과', () => {
    expect(parseApiJsonBody('{"error":"bad"}', 400)).toEqual({ error: 'bad' });
  });

  it('비JSON이고 5xx면 서버 오류 안내', () => {
    const d = parseApiJsonBody('<!DOCTYPE html>', 502);
    expect(d.error).toMatch(/서버 오류/);
    expect(d.error).toMatch(/sqlMessage/);
  });

  it('비JSON이고 4xx면 짧은 안내', () => {
    const d = parseApiJsonBody('<html>', 404);
    expect(d.error).toMatch(/HTTP 404/);
  });
});
