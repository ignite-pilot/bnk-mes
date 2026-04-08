/**
 * Config Manager 코드 조회 유틸
 * - VEHICLE_CODE, PART_CODE, COLOR_CODE 캐싱 (5분)
 */
const CONFIG_BASE = (process.env.CONFIG_MANAGER_URL || 'https://config-manager.ig-pilot.com').replace(/\/$/, '');
const CONFIG_API_KEY = process.env.CONFIG_MANAGER_API_KEY || '1df7b7a71fdb47f6b04e41662e7363f1';
const CONFIG_APP_CODE = process.env.CONFIG_MANAGER_APP_CODE || 'BNK_MES';

const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function getCodeMap(codeType) {
  const now = Date.now();
  if (cache[codeType] && now - cache[codeType].ts < CACHE_TTL) {
    return cache[codeType].map;
  }
  const response = await fetch(`${CONFIG_BASE}/api/v1/codes/${codeType}`, {
    headers: { 'X-API-Key': CONFIG_API_KEY, 'X-App-Code': CONFIG_APP_CODE, 'Accept': 'application/json' },
  });
  if (!response.ok) return {};
  const data = await response.json();
  const children = data?.code?.children || [];
  const map = {};
  for (const c of children) {
    map[c.value] = c.name || c.value;
  }
  cache[codeType] = { map, ts: now };
  return map;
}

/**
 * 차종/적용부/색상 코드를 한 번에 조회하여 { vehicleMap, partMap, colorMap } 반환
 */
export async function getAllCodeMaps() {
  const [vehicleMap, partMap, colorMap] = await Promise.all([
    getCodeMap('VEHICLE_CODE'),
    getCodeMap('PART_CODE'),
    getCodeMap('COLOR_CODE'),
  ]);
  return { vehicleMap, partMap, colorMap };
}
