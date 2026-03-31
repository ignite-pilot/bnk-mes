/**
 * fetch 응답 text를 JSON으로 파싱. HTML/비JSON(프록시·라우팅 오류)일 때 안내 문구 반환.
 */
export function parseApiJsonBody(text, httpStatus) {
  const trimmed = text != null ? String(text).trim() : '';
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    if (httpStatus >= 500) {
      return {
        error: `서버 오류(HTTP ${httpStatus}). 관리자: 서버 로그에서 해당 API 오류의 code·sqlMessage를 확인하세요.`,
      };
    }
    return { error: `응답을 처리할 수 없습니다 (HTTP ${httpStatus}).` };
  }
}
