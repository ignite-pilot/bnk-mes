import { Router } from 'express';
import * as igMember from '../lib/ig-member-client.js';
import logger from '../lib/logger.js';

const router = Router();

/** 로그인 (이메일/비밀번호) → ig-member API 호출 */
router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const loginId = (body.loginId ?? body.email ?? '').toString().trim();
    const password = body.password != null ? String(body.password) : '';
    if (!loginId || !password) {
      return res.status(400).json({ error: '이메일(아이디)과 비밀번호를 입력하세요.' });
    }
    const result = await igMember.login(loginId, password);
    if (!result.ok) {
      return res.status(result.status === 401 ? 401 : 400).json({ error: result.error });
    }
    return res.json({ token: result.token, user: result.user });
  } catch (err) {
    logger.error('ig-member login error', { error: err.message });
    return res.status(502).json({ error: '회원 서비스를 사용할 수 없습니다.' });
  }
});

/** 화면 연동: ig-member 로그인 후 리다이렉트된 일회용 코드로 토큰 교환 */
router.get('/auth/token/:code', async (req, res) => {
  try {
    const result = await igMember.getTokenFromCode(req.params.code);
    if (!result.ok) {
      return res.status(result.status === 401 ? 401 : 400).json({ error: result.error });
    }
    return res.json({ token: result.token, user: result.user });
  } catch (err) {
    logger.error('ig-member token exchange error', { error: err.message });
    return res.status(502).json({ error: 'Member service unavailable' });
  }
});

/** 로그인된 사용자 정보 (ig-member /api/users/me 프록시) */
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const result = await igMember.me(auth);
    if (!result.ok) {
      return res.status(result.status === 401 ? 401 : 400).json({ error: result.error });
    }
    return res.json({ user: result.user });
  } catch (err) {
    logger.error('ig-member me error', { error: err.message });
    return res.status(502).json({ error: 'Member service unavailable' });
  }
});

/** 로그아웃 (클라이언트에서 토큰 삭제, 서버는 성공만 반환) */
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

export default router;
