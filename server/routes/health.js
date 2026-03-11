import { Router } from 'express';
import * as igMember from '../lib/ig-member-client.js';

const router = Router();

router.get('/', async (req, res) => {
  const payload = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'bnk-mes',
  };
  if (process.env.MEMBER_UI_BASE_URL || process.env.MEMBER_API_BASE_URL) {
    try {
      payload.member = await igMember.ping();
    } catch (err) {
      payload.member = { available: false, reason: err.message };
    }
  }
  res.json(payload);
});

export default router;
