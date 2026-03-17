/**
 * ig-config-manager 코드 프록시 API
 * - CAR_MAKER, VEHICLE_CODE, PART_CODE, COLOR_CODE 코드를 조회하여 제공
 */
import { Router } from 'express';
import fetch from 'node-fetch';
import logger from '../lib/logger.js';

const router = Router();

const CONFIG_BASE = (process.env.CONFIG_MANAGER_URL || 'https://config-manager.ig-pilot.com').replace(/\/$/, '');
const CONFIG_API_KEY = process.env.CONFIG_MANAGER_API_KEY || '1df7b7a71fdb47f6b04e41662e7363f1';
const CONFIG_APP_CODE = process.env.CONFIG_MANAGER_APP_CODE || 'BNK_MES';

/** 공통 코드 조회 헬퍼 */
async function fetchConfigCode(codeValue) {
  const response = await fetch(`${CONFIG_BASE}/api/v1/codes/${codeValue}`, {
    headers: { 'X-API-Key': CONFIG_API_KEY, 'X-App-Code': CONFIG_APP_CODE, 'Accept': 'application/json' },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: false, status: response.status, error: data.error };
  }
  const data = await response.json();
  const children = data?.code?.children || [];
  const list = children.map((c) => ({
    id: c.id,
    name: c.name,
    value: c.value,
    description: c.description,
  }));
  return { ok: true, list };
}

/**
 * CAR_MAKER 코드 조회
 * GET /api/delivery-vehicles
 */
router.get('/', async (req, res) => {
  try {
    const result = await fetchConfigCode('CAR_MAKER');
    if (!result.ok) {
      logger.error('config-manager CAR_MAKER error', { status: result.status, error: result.error });
      return res.status(result.status).json({ error: result.error || '완성차 정보를 가져올 수 없습니다.' });
    }
    res.json({ list: result.list, total: result.list.length });
  } catch (err) {
    logger.error('delivery-vehicle list error', { error: err.message });
    res.status(502).json({ error: '설정 관리 서비스에 연결할 수 없습니다.' });
  }
});

/**
 * 특정 코드 조회 (VEHICLE_CODE, PART_CODE, COLOR_CODE 등)
 * GET /api/delivery-vehicles/codes/:codeValue
 */
const ALLOWED_CODES = ['VEHICLE_CODE', 'PART_CODE', 'COLOR_CODE'];

router.get('/codes/:codeValue', async (req, res) => {
  const { codeValue } = req.params;
  if (!ALLOWED_CODES.includes(codeValue)) {
    return res.status(400).json({ error: `허용되지 않는 코드입니다: ${codeValue}` });
  }
  try {
    const result = await fetchConfigCode(codeValue);
    if (!result.ok) {
      logger.error(`config-manager ${codeValue} error`, { status: result.status, error: result.error });
      return res.status(result.status).json({ error: result.error || `${codeValue} 정보를 가져올 수 없습니다.` });
    }
    res.json({ list: result.list, total: result.list.length });
  } catch (err) {
    logger.error(`config-code ${codeValue} error`, { error: err.message });
    res.status(502).json({ error: '설정 관리 서비스에 연결할 수 없습니다.' });
  }
});

export default router;
