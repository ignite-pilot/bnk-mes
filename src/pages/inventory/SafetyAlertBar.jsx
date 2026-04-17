import React, { useState } from 'react';
import { RISK_LEVELS, RISK_COLORS, getRiskLevel } from './safetyRisk';

function SafetyAlertBar({ rows, getTotal, getLabel }) {
  const [openLevel, setOpenLevel] = useState(null);

  const grouped = Object.fromEntries(RISK_LEVELS.map((l) => [l.level, []]));
  for (const row of rows) {
    const { level } = getRiskLevel(getTotal(row), row.safety_stock);
    grouped[level].push(row);
  }

  const visible = RISK_LEVELS.filter((l) => ['shortage', 'need'].includes(l.level) && grouped[l.level].length > 0);
  if (visible.length === 0) return null;

  const ICONS = { shortage: '⛔', need: '⚠️' };
  const toggle = (level) => setOpenLevel((prev) => (prev === level ? null : level));

  return (
    <div style={{ flexShrink: 0, marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: openLevel ? '0.5rem' : 0 }}>
        {visible.map((l) => {
          const isOpen = openLevel === l.level;
          const color = RISK_COLORS[l.color];
          return (
            <button
              key={l.level}
              type="button"
              onClick={() => toggle(l.level)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: color,
                border: isOpen ? '2px solid #1e293b' : `2px solid ${color}`,
                cursor: 'pointer',
                outline: 'none',
                boxShadow: isOpen ? `0 0 0 2px ${color}40` : '0 1px 3px rgba(0,0,0,0.15)',
              }}
            >
              <span style={{ fontSize: '1rem', lineHeight: 1 }}>{ICONS[l.level]}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1 }}>{grouped[l.level].length}</span>
              <span style={{ opacity: 0.92, letterSpacing: '-0.01em' }}>{l.label}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.1rem' }}>{isOpen ? '▲' : '▼'}</span>
            </button>
          );
        })}
      </div>

      {openLevel && grouped[openLevel] && (() => {
        const levelMeta = RISK_LEVELS.find((l) => l.level === openLevel);
        const accentColor = RISK_COLORS[levelMeta?.color];
        return (
          <div style={{
            border: `1px solid ${accentColor}50`,
            borderRadius: '8px',
            overflow: 'hidden',
            maxHeight: '280px',
            overflowY: 'auto',
            maxWidth: '800px',
            fontSize: '0.78rem',
          }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: `2px solid ${accentColor}30`, position: 'sticky', top: 0 }}>
                  <th style={{ ...thStyle, textAlign: 'left' }}>품목</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>현재재고</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>안전재고</th>
                  <th style={{ ...thStyle, textAlign: 'right', color: accentColor }}>부족량</th>
                </tr>
              </thead>
              <tbody>
                {grouped[openLevel].map((row, idx) => {
                  const total = getTotal(row);
                  const safety = Number(row.safety_stock || 0);
                  const shortage = safety - total;
                  const label = getLabel ? getLabel(row) : String(row.id ?? idx);
                  const parts = label.split(' / ');

                  return (
                    <tr key={row.id ?? idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdStyle, color: '#1e293b' }}>
                        {parts.join(' / ')}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{total.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>{safety ? safety.toLocaleString() : '-'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: shortage > 0 ? accentColor : '#94a3b8' }}>
                        {shortage > 0 ? shortage.toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

const thStyle = {
  padding: '0.35rem 0.75rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  color: '#475569',
  fontSize: '0.73rem',
  letterSpacing: '0.02em',
};

const tdStyle = {
  padding: '0.3rem 0.75rem',
  verticalAlign: 'middle',
};

export default SafetyAlertBar;
