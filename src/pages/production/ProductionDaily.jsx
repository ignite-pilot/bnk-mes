/**
 * 일별 생산 계획/실적 관리
 * - 탭: 표면처리 / 프라이머 / 엠보 / 재단 (1단계에서는 표면처리만 활성)
 * - 화면 입력 + 엑셀 업로드
 * - 마스터 미매칭(차종/칼라) 시각화
 */
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from '../material/MaterialInfo.module.css';
import SurfaceTreatmentTab from './tabs/SurfaceTreatmentTab';
import PrimerTab from './tabs/PrimerTab';
import EmbossTab from './tabs/EmbossTab';
import CuttingTab from './tabs/CuttingTab';

const TABS = [
  { key: 'surface', label: '표면처리', enabled: true },
  { key: 'primer', label: '프라이머', enabled: true },
  { key: 'emboss', label: '엠보', enabled: true },
  { key: 'cutting', label: '재단', enabled: true },
];

function ProductionDaily() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('surface');

  const userName = user?.name || user?.loginId || '';

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <h2 className={styles.title} style={{ margin: 0 }}>일별 생산 실적 관리</h2>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          ※{' '}
          <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>1. 표면처리 생산일지.xlsx</code>,{' '}
          <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>2. 프라이머 생산일지.xlsx</code>,{' '}
          <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>엠보_생산일지(2026년~).xlsx</code>,{' '}
          <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>재단일지(2026년 1월~).xlsx</code> 참고
        </span>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', marginBottom: '1rem', flexShrink: 0 }}>
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => t.enabled && setActiveTab(t.key)}
              disabled={!t.enabled}
              style={{
                padding: '0.6rem 1.25rem',
                border: 'none',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: !t.enabled ? '#cbd5e1' : isActive ? '#2563eb' : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.9rem',
                cursor: t.enabled ? 'pointer' : 'not-allowed',
                marginBottom: '-1px',
              }}
            >
              {t.label}
              {!t.enabled && <span style={{ fontSize: '0.7rem', marginLeft: '0.35rem', opacity: 0.7 }}>준비중</span>}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'surface' && <SurfaceTreatmentTab userName={userName} />}
        {activeTab === 'primer' && <PrimerTab userName={userName} />}
        {activeTab === 'emboss' && <EmbossTab userName={userName} />}
        {activeTab === 'cutting' && <CuttingTab userName={userName} />}
      </div>
    </div>
  );
}

export default ProductionDaily;
