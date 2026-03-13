/**
 * 전화번호에 하이픈 자동 삽입
 * 010-1234-5678, 02-1234-5678, 031-123-4567 등
 */
export default function formatPhone(value) {
  if (value == null || value === '') return null;
  const num = String(value).replace(/[^0-9]/g, '');
  if (num.length === 0) return String(value);

  // 휴대폰 (010, 011, 016, 017, 018, 019)
  if (/^01[016789]/.test(num)) {
    if (num.length === 11) return num.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if (num.length === 10) return num.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  // 서울 (02)
  if (/^02/.test(num)) {
    if (num.length === 10) return num.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
    if (num.length === 9) return num.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  // 지역번호 (031~064 등 3자리)
  if (/^0[3-6]\d/.test(num)) {
    if (num.length === 11) return num.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if (num.length === 10) return num.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  // 대표번호 (1588, 1577 등)
  if (/^1[0-9]{3}/.test(num) && num.length === 8) {
    return num.replace(/(\d{4})(\d{4})/, '$1-$2');
  }
  // 이미 하이픈이 있거나 매칭 안 되면 원본 반환
  return String(value);
}

/**
 * 입력 중 실시간 포맷 (타이핑할 때 하이픈 자동 삽입)
 * 숫자만 입력 가능하게 필터링 후 포맷 적용
 */
export function formatPhoneInput(value) {
  if (value == null) return '';
  const num = String(value).replace(/[^0-9]/g, '');
  if (num.length === 0) return '';

  // 휴대폰
  if (/^01[016789]/.test(num)) {
    if (num.length <= 3) return num;
    if (num.length <= 7) return num.replace(/(\d{3})(\d{1,4})/, '$1-$2');
    return num.slice(0, 11).replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
  }
  // 서울 (02)
  if (/^02/.test(num)) {
    if (num.length <= 2) return num;
    if (num.length <= 6) return num.replace(/(\d{2})(\d{1,4})/, '$1-$2');
    return num.slice(0, 10).replace(/(\d{2})(\d{4})(\d{0,4})/, '$1-$2-$3');
  }
  // 지역번호 3자리
  if (/^0[3-6]\d/.test(num)) {
    if (num.length <= 3) return num;
    if (num.length <= 7) return num.replace(/(\d{3})(\d{1,4})/, '$1-$2');
    return num.slice(0, 11).replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
  }
  // 대표번호 (1xxx)
  if (/^1/.test(num)) {
    if (num.length <= 4) return num;
    return num.slice(0, 8).replace(/(\d{4})(\d{0,4})/, '$1-$2');
  }
  return num;
}

/**
 * 하이픈 제거 (저장 시 사용)
 */
export function stripPhone(value) {
  if (value == null || value === '') return null;
  const num = String(value).replace(/[^0-9]/g, '');
  return num.length > 0 ? num : null;
}
