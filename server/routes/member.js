import { Router } from 'express';
import * as igMember from '../lib/ig-member-client.js';

const router = Router();
const MEMBER_API_BASE = process.env.MEMBER_API_BASE_URL || '';

const devStore = new Map();

router.post('/login', async (req, res) => {
  if (MEMBER_API_BASE) {
    try {
      const { loginId, password } = req.body || {};
      if (!loginId || !password) {
        return res.status(400).json({ error: 'loginId and password required' });
      }
      const result = await igMember.login(loginId, password);
      if (!result.ok) {
        return res.status(result.status === 401 ? 401 : 400).json({ error: result.error });
      }
      return res.json({ token: result.token, user: result.user });
    } catch (err) {
      console.error('ig-member login error:', err.message);
      return res.status(502).json({ error: 'Member service unavailable' });
    }
  }
  const { loginId, password } = req.body || {};
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password required' });
  }
  const user = devStore.get(loginId);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = `dev-token-${Date.now()}-${loginId}`;
  res.json({ token, user: { id: user.id, loginId: user.loginId, name: user.name } });
});

router.post('/register', async (req, res) => {
  if (MEMBER_API_BASE) {
    try {
      const { loginId, password, name } = req.body || {};
      if (!loginId || !password) {
        return res.status(400).json({ error: 'loginId and password required' });
      }
      const result = await igMember.register({ loginId, password, name });
      if (!result.ok) {
        return res.status(result.status === 409 ? 409 : 400).json({ error: result.error });
      }
      return res.status(201).json({ token: result.token, user: result.user });
    } catch (err) {
      console.error('ig-member register error:', err.message);
      return res.status(502).json({ error: 'Member service unavailable' });
    }
  }
  const { loginId, password, name } = req.body || {};
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password required' });
  }
  if (devStore.has(loginId)) {
    return res.status(409).json({ error: 'loginId already exists' });
  }
  const id = String(devStore.size + 1);
  devStore.set(loginId, { id, loginId, password, name: name || loginId });
  const token = `dev-token-${Date.now()}-${loginId}`;
  res.status(201).json({ token, user: { id, loginId, name: name || loginId } });
});

router.get('/me', async (req, res) => {
  if (MEMBER_API_BASE) {
    try {
      const auth = req.headers.authorization;
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const result = await igMember.me(auth);
      if (!result.ok) {
        return res.status(result.status === 401 ? 401 : 400).json({ error: result.error });
      }
      return res.json({ user: result.user });
    } catch (err) {
      console.error('ig-member me error:', err.message);
      return res.status(502).json({ error: 'Member service unavailable' });
    }
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer dev-token-')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const loginId = auth.replace(/^Bearer dev-token-\d+-/, '');
  const user = devStore.get(loginId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: { id: user.id, loginId: user.loginId, name: user.name } });
});

router.post('/logout', async (req, res) => {
  if (MEMBER_API_BASE) {
    try {
      await igMember.logout(req.headers.authorization);
    } catch {
      // ignore
    }
  }
  res.json({ ok: true });
});

export default router;
