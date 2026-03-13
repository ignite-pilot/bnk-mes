/**
 * 완성차 정보 API
 * - ig-config-manager 외부 API에서 CAR_MAKER 코드를 조회하여 제공
 */
import { Router } from 'express';
import fetch from 'node-fetch';
import logger from '../lib/logger.js';

const router = Router();

const CONFIG_BASE = (process.env.CONFIG_MANAGER_URL || 'https://config-manager.ig-pilot.com').replace(/\/$/, '');
const CONFIG_API_KEY = process.env.CONFIG_MANAGER_API_KEY || '1df7b7a71fdb47f6b04e41662e7363f1';
const CONFIG_APP_CODE = process.env.CONFIG_MANAGER_APP_CODE || 'BNK_MES';

/**
 * CAR_MAKER 코드 조회 (ig-config-manager 프록시)
 * GET /api/delivery-vehicles
 */
router.get('/', async (req, res) => {
  try {
    const response = await fetch(`${CONFIG_BASE}/api/v1/codes/CAR_MAKER`, {
      headers: { 'X-API-Key': CONFIG_API_KEY, 'X-App-Code': CONFIG_APP_CODE, 'Accept': 'application/json' },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      logger.error('config-manager CAR_MAKER error', { status: response.status, error: data.error });
      return res.status(response.status).json({ error: data.error || '완성차 정보를 가져올 수 없습니다.' });
    }
    const data = await response.json();
    const children = data?.code?.children || [];
    const list = children.map((c) => ({
      id: c.id,
      name: c.name,
      value: c.value,
      description: c.description,
    }));
    res.json({ list, total: list.length });
  } catch (err) {
    logger.error('delivery-vehicle list error', { error: err.message });
    res.status(502).json({ error: '설정 관리 서비스에 연결할 수 없습니다.' });
  }
});

export default router;
