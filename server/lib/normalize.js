/**
 * 차종 / 부위 정규화 공용 유틸
 * - 대소문자 통일 (toUpperCase)
 * - 공백·줄바꿈 정리
 * - 알려진 별칭 매핑
 */

const VEHICLE_ALIASES = {
  'ME1A': 'ME1A',
  'CN7 PE': 'CN7PE',
  'RG3 PE': 'RG3PE',
  'NX4 PE': 'NX4PE',
  'RG3 PE EV': 'RG3PE EV',
  'RG3 EV PE': 'RG3PE EV',
  'KA4 PE': 'KA4 PE',
  'GL3 PE': 'GL3PE',
  'CE PE': 'CE1 PE',
  'CE1PE': 'CE1 PE',
  'LX2 PE 변경분': 'LX2 PE 변경분',
  'SX2 사이즈변경분': 'SX2 사이즈변경분',
  'LX3(규격 변경)': 'LX3(규격 변경)',
};

const PART_ALIASES = {
  'MAIN': 'MAIN',
  'MAIN FRT': 'MAIN FRT',
  'MAIN RR': 'MAIN RR',
  'MAIN/FRT': 'MAIN FRT',
  'MAIN/RR': 'MAIN RR',
  'A/REST': 'A/REST',
  'A/REST FRT': 'A/REST FRT',
  'A/REST RR': 'A/REST RR',
  'A/REST UPR FRT': 'A/REST UPR FRT',
  'A/REST/FRT': 'A/REST FRT',
  'CTR/FRT': 'CTR FRT',
  'CTR/RR': 'CTR RR',
  'UPR/FRT': 'UPR FRT',
  'UPR/RR': 'UPR RR',
  'UPR F': 'UPR FRT',
  'UPR R': 'UPR RR',
  'H/INR': 'H/INNER',
  'M/P F': 'M/P FRT',
};

function clean(v) {
  if (!v) return '';
  return String(v).trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
}

export function normVehicle(v) {
  const s = clean(v).toUpperCase();
  return VEHICLE_ALIASES[s] || VEHICLE_ALIASES[clean(v)] || s;
}

export function normPart(v) {
  const s = clean(v).toUpperCase();
  return PART_ALIASES[s] || PART_ALIASES[clean(v)] || s;
}

export function normColor(v) {
  return clean(v).toUpperCase();
}

export { VEHICLE_ALIASES, PART_ALIASES };
