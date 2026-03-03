/**
 * ig-member 서비스 연동 클라이언트
 * - MEMBER_API_BASE_URL 에 ig-member 서비스 URL 설정 시 사용
 * - 다양한 응답 형식(accessToken/token, data.user/user)을 bnk-mes 형식으로 정규화
 */
import fetch from 'node-fetch';

const BASE = (process.env.MEMBER_API_BASE_URL || '').replace(/\/$/, '');
const PATH_PREFIX = process.env.MEMBER_AUTH_PATH_PREFIX || '/api/auth';

function url(path) {
  return `${BASE}${PATH_PREFIX.replace(/\/$/, '')}${path}`;
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

function normalizeLoginResponse(data) {
  const token = data.token ?? data.accessToken ?? data.access_token ?? data.jwt;
  const userRaw = data.user ?? data.member ?? data.data?.user ?? data.data?.member;
  const user = normalizeUser(userRaw);
  return { token, user };
}

function normalizeMeResponse(data) {
  const userRaw = data.user ?? data.member ?? data.data?.user ?? data;
  const user = normalizeUser(userRaw);
  return { user };
}

async function request(method, path, options = {}) {
  if (!BASE) {
    throw new Error('MEMBER_API_BASE_URL is not set');
  }
  const res = await fetch(url(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // ignore
  }
  return { ok: res.ok, status: res.status, data };
}

export async function login(loginId, password) {
  const { ok, status, data } = await request('POST', '/login', {
    body: { loginId, password },
  });
  if (!ok) {
    return { ok: false, status, error: data.message ?? data.error ?? 'Login failed' };
  }
  return { ok: true, ...normalizeLoginResponse(data) };
}

export async function register(body) {
  const { ok, status, data } = await request('POST', '/register', { body });
  if (!ok) {
    return { ok: false, status, error: data.message ?? data.error ?? 'Register failed' };
  }
  return { ok: true, ...normalizeLoginResponse(data) };
}

export async function me(authorizationHeader) {
  const { ok, status, data } = await request('GET', '/me', {
    headers: authorizationHeader ? { Authorization: authorizationHeader } : {},
  });
  if (!ok) {
    return { ok: false, status, error: data.message ?? data.error ?? 'Unauthorized' };
  }
  return { ok: true, ...normalizeMeResponse(data) };
}

export async function logout(authorizationHeader) {
  const { ok, status } = await request('POST', '/logout', {
    headers: authorizationHeader ? { Authorization: authorizationHeader } : {},
  });
  return { ok, status };
}

/** ig-member 서비스 연결 확인 (health 등) */
export async function ping() {
  if (!BASE) return { available: false, reason: 'not_configured' };
  try {
    const res = await fetch(`${BASE}/api/health`.replace(/([^/])\/\/+/, '$1/'), {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return { available: res.ok, status: res.status };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}
