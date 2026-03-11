/**
 * ig-member 서비스 연동 클라이언트 (화면 연동)
 * - MEMBER_UI_BASE_URL: ig-member URL (기본 https://ig-member.ig-pilot.com)
 * - 토큰 교환 GET /api/auth/token/:code, 사용자 조회 GET /api/users/me
 */
import fetch from 'node-fetch';
import logger from './logger.js';

const BASE = (process.env.MEMBER_UI_BASE_URL || process.env.MEMBER_API_BASE_URL || 'https://ig-member.ig-pilot.com').replace(/\/$/, '');

function authUrl(path) {
  return `${BASE}/api/auth${path}`;
}

function usersUrl(path) {
  return `${BASE}/api/users${path}`;
}

function normalizeUser(raw) {
  if (!raw) return null;
  if (typeof raw !== 'object') return { loginId: String(raw) };
  return {
    id: raw.id ?? raw.userId,
    loginId: raw.loginId ?? raw.username ?? raw.email,
    name: raw.name ?? raw.nickname ?? raw.loginId ?? raw.username,
  };
}

/** ig-member 응답: { success: true, data: { token, user } } 또는 { token, user } */
function normalizeLoginResponse(body) {
  const data = body.data ?? body;
  const token = data?.token ?? data?.accessToken ?? body?.token;
  const userRaw = data?.user ?? data?.member ?? body?.user ?? body?.member;
  const user = normalizeUser(userRaw);
  return { token, user };
}

/** ig-member 응답: { success: true, data: { id, email, name, provider } } */
function normalizeMeResponse(body) {
  const userRaw = body?.data ?? body?.user ?? body;
  const user = normalizeUser(userRaw);
  return { user };
}

async function request(method, fullUrl, options = {}) {
  if (!BASE) throw new Error('MEMBER_UI_BASE_URL is not set');
  const res = await fetch(fullUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text && text.trim().startsWith('{') ? JSON.parse(text) : {};
  } catch {
    // ignore
  }
  return { ok: res.ok, status: res.status, data, rawText: text?.slice(0, 200) };
}

/** 로그인 (이메일/비밀번호): POST /api/auth/login */
export async function login(loginId, password) {
  const rawEmail = typeof loginId === 'string' ? loginId.trim() : loginId;
  const email = rawEmail ? String(rawEmail).toLowerCase() : '';
  const pwd = typeof password === 'string' ? password : String(password ?? '');
  if (!email || !pwd) {
    return { ok: false, status: 400, error: '이메일과 비밀번호를 입력하세요.' };
  }
  const loginUrl = authUrl('/login');
  logger.info('ig-member login attempt', { url: loginUrl, email, hasPassword: !!pwd });
  const { ok, status, data, rawText } = await request('POST', loginUrl, {
    body: { email, password: pwd },
  });
  const errMsg = data?.message ?? data?.error ?? null;
  logger.info('ig-member login response', {
    status,
    ok,
    success: data?.success,
    hasToken: !!(data?.data?.token ?? data?.token),
    message: errMsg,
    rawKeys: data ? Object.keys(data) : [],
  });
  if (!ok) {
    const isServerError = status >= 500;
    const noJson = !data || Object.keys(data).length === 0;
    if (isServerError || (noJson && status !== 400)) {
      logger.warn('ig-member login: non-ok response', { status, body: data, rawPreview: rawText });
    }
    const fallback = status >= 500
      ? '회원 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.'
      : (errMsg || '로그인에 실패했습니다.');
    return { ok: false, status, error: fallback };
  }
  if (data && data.success === false) {
    logger.warn('ig-member login: success=false', { status, body: data });
    return { ok: false, status: 401, error: errMsg || '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }
  const normalized = normalizeLoginResponse(data);
  if (!normalized.token) {
    logger.warn('ig-member login: 200 but no token in response', { status, body: data });
    return { ok: false, status: 401, error: errMsg || '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }
  return { ok: true, ...normalized };
}

/** 화면 연동: 일회용 코드로 토큰 조회 GET /api/auth/token/:code */
export async function getTokenFromCode(code) {
  if (!code) return { ok: false, error: 'code required' };
  const { ok, status, data } = await request('GET', authUrl('/token/' + encodeURIComponent(code)));
  if (!ok) {
    return { ok: false, status, error: data?.message ?? data?.error ?? 'Invalid or expired code' };
  }
  const payload = data?.data ?? data;
  return { ok: true, ...normalizeLoginResponse(payload || data) };
}

/** ig-member: GET /api/users/me, Authorization: Bearer {token} */
export async function me(authorizationHeader) {
  const { ok, status, data } = await request('GET', usersUrl('/me'), {
    headers: authorizationHeader ? { Authorization: authorizationHeader } : {},
  });
  if (!ok) {
    return { ok: false, status, error: data?.message ?? data?.error ?? 'Unauthorized' };
  }
  return { ok: true, ...normalizeMeResponse(data) };
}

/** ig-member 서비스 연결 확인: GET /api/health */
export async function ping() {
  if (!BASE) return { available: false, reason: 'not_configured' };
  try {
    const res = await fetch(`${BASE}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return { available: res.ok, status: res.status };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}
