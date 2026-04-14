/**
 * 규격 표시 포맷터
 * - 숫자를 소수점 2자리까지 반올림
 * - 소수점 이하가 0이면 정수로 표기 (20.00 → 20)
 * - null / 0 / 빈 값은 빈 문자열로
 */
export function fmtSpec(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n) || n === 0) return '';
  return (Math.round(n * 100) / 100).toString();
}
