export const RISK_COLORS = {
  red: '#dc2626',
  orange: '#ea580c',
  green: '#16a34a',
  lightbrown: '#b45309',
  darkbrown: '#78350f',
};

export const RISK_LEVELS = [
  { level: 'shortage', label: '재고 부족 위험', color: 'red' },
  { level: 'need', label: '재고 확보 필요', color: 'orange' },
  { level: 'safe', label: '안전', color: 'green' },
  { level: 'excess_low', label: '일부 공급 과잉', color: 'lightbrown' },
  { level: 'excess_high', label: '재고 과잉 위험', color: 'darkbrown' },
];

export function getRiskLevel(quantity, safetyStock) {
  const q = Number(quantity) || 0;
  const safe = Number(safetyStock);
  if (!safe || safe <= 0) return { level: 'safe', label: '안전', color: 'green' };
  const ratio = q / safe;
  if (ratio < 0.5) return { level: 'shortage', label: '재고 부족 위험', color: 'red' };
  if (ratio < 0.85) return { level: 'need', label: '재고 확보 필요', color: 'orange' };
  if (ratio < 1.15) return { level: 'safe', label: '안전', color: 'green' };
  if (ratio < 1.5) return { level: 'excess_low', label: '일부 공급 과잉', color: 'lightbrown' };
  return { level: 'excess_high', label: '재고 과잉 위험', color: 'darkbrown' };
}
