/** ig-member 화면 연동 URL (로그인/회원가입 리다이렉트) */
export const MEMBER_UI_BASE = 'https://ig-member.ig-pilot.com';

export function getLoginRedirectUrl() {
  const returnUrl = typeof window !== 'undefined'
    ? encodeURIComponent(window.location.origin + '/auth/callback')
    : '';
  return `${MEMBER_UI_BASE}/login?returnUrl=${returnUrl}`;
}

export function getRegisterRedirectUrl() {
  const returnUrl = typeof window !== 'undefined'
    ? encodeURIComponent(window.location.origin + '/auth/callback')
    : '';
  return `${MEMBER_UI_BASE}/register?returnUrl=${returnUrl}`;
}
