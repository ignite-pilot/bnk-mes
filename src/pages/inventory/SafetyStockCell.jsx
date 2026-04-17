/**
 * react-datasheet-grid 안전재고 컬럼용 커스텀 셀
 * - 안전재고 값 옆에 현재 재고 대비 위험 수준을 색 점으로 표시
 * - 현재 재고 = 날짜 컬럼 중 가장 최신(`dates` 마지막)의 값
 */
import React from 'react';
import { RISK_COLORS, RISK_LEVELS, getRiskLevel } from './safetyRisk';

function SafetyStockCellFactory(dates) {
  return function SafetyStockCell({ rowData }) {
    const safety = Number(rowData?._safety ?? 0);
    const latestDate = dates && dates.length ? dates[dates.length - 1] : null;
    const latest = latestDate ? Number(rowData?.[`d_${latestDate}`] ?? 0) : 0;
    const { level, label, color } = getRiskLevel(latest, safety);
    const dotColor = RISK_COLORS[color] || '#94a3b8';

    const showDot = safety > 0;
    const isLowStock = level === 'shortage' || level === 'need';

    return (
      <div
        title={showDot ? `${label} (현재 ${latest.toLocaleString()} / 안전 ${safety.toLocaleString()})` : ''}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '6px',
          width: '100%',
          height: '100%',
          padding: '0 8px',
          boxSizing: 'border-box',
          fontVariantNumeric: 'tabular-nums',
          color: isLowStock ? dotColor : '#1e293b',
          fontWeight: isLowStock ? 600 : 400,
        }}
      >
        <span>{safety ? safety.toLocaleString() : ''}</span>
        {showDot && (
          <span
            aria-label={label}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: dotColor,
              flexShrink: 0,
              boxShadow: `0 0 0 1px ${dotColor}60`,
            }}
          />
        )}
      </div>
    );
  };
}

function SafetyStockLegend({ style }) {
  const items = [
    { color: RISK_COLORS.red, label: '재고 부족 위험', range: '< 50%' },
    { color: RISK_COLORS.orange, label: '재고 확보 필요', range: '< 85%' },
    { color: RISK_COLORS.green, label: '안전', range: '~115%' },
    { color: RISK_COLORS.lightbrown, label: '일부 공급 과잉', range: '< 150%' },
    { color: RISK_COLORS.darkbrown, label: '재고 과잉 위험', range: '≥ 150%' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        fontSize: '0.72rem',
        color: '#475569',
        ...style,
      }}
    >
      <span style={{ fontWeight: 600, color: '#64748b' }}>안전재고 표시</span>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: it.color,
              boxShadow: `0 0 0 1px ${it.color}60`,
              flexShrink: 0,
            }}
          />
          <span>
            {it.label}
            <span style={{ color: '#94a3b8', marginLeft: '0.2rem' }}>({it.range})</span>
          </span>
        </span>
      ))}
    </div>
  );
}

export { SafetyStockCellFactory, SafetyStockLegend, RISK_LEVELS, RISK_COLORS };
