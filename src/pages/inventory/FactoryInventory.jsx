/**
 * 공장별 재고 관리 — 공통 컴포넌트
 * props.factory: 'gj' | 'us'
 * props.title: 페이지 제목
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DynamicDataSheetGrid, textColumn, intColumn, keyColumn } from 'react-datasheet-grid';
import 'react-datasheet-grid/dist/style.css';
import './FactoryInventory.css';
import { useAuth } from '../../context/AuthContext';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/daily-inventory';

const FACTORY_TABS = {
  gj: [
    { key: 'gj_sangji', label: '상지', category: '원자재' },
    { key: 'gj_surface', label: '표면처리제/접착제', category: '원자재' },
    { key: 'gj_foam', label: '폼', category: '원자재' },
    { key: 'gj_primer', label: '프라이머', category: '원자재' },
    { key: 'gj_pyoji', label: '표지', category: '반제품' },
    { key: 'gj_foam_primer', label: '폼 프라이머', category: '반제품' },
  ],
  us: [
    { key: 'us_haji', label: '하지', category: '원자재' },
    { key: 'us_foam_raw', label: '미처리 폼', category: '원자재' },
    { key: 'us_pyoji', label: '표지', category: '반제품' },
    { key: 'us_foam_primer', label: '폼 프라이머', category: '반제품' },
    { key: 'us_finished', label: '완제품', category: '완제품' },
  ],
};

const fetchCode = (code) =>
  fetch(`/api/delivery-vehicles/codes/${code}`)
    .then((r) => r.json())
    .then((d) => (d.items || d.list || []).map((c) => ({ value: c.codeValue || c.value || c.code, label: c.label || c.codeName || c.name || c.codeValue })))
    .catch(() => []);

function getDefaultRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return { start, end };
}

function FactoryInventory({ factory, title }) {
  const tabs = FACTORY_TABS[factory] || [];
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || '');
  const [dateRange, setDateRange] = useState(getDefaultRange);
  const [gridData, setGridData] = useState([]);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 제품 추가 모달
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ vehicleCode: '', partCode: '', colorCode: '' });
  const [vehicleCodes, setVehicleCodes] = useState([]);
  const [partCodes, setPartCodes] = useState([]);
  const [colorCodes, setColorCodes] = useState([]);

  const gridContainerRef = useRef(null);
  const [gridHeight, setGridHeight] = useState(600);
  const pendingSaves = useRef(new Map());
  const saveTimer = useRef(null);

  const userName = user?.name || user?.loginId || '';

  useEffect(() => {
    fetchCode('VEHICLE_CODE').then(setVehicleCodes);
    fetchCode('PART_CODE').then(setPartCodes);
    fetchCode('COLOR_CODE').then(setColorCodes);
  }, []);

  useEffect(() => {
    const measure = () => {
      if (gridContainerRef.current) {
        const rect = gridContainerRef.current.getBoundingClientRect();
        setGridHeight(Math.max(400, window.innerHeight - rect.top - 20));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading]);

  const fetchList = useCallback(async () => {
    if (!activeTab) return;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        processType: activeTab,
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      const res = await fetch(`${API}?${q}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }

      setDates(d.dates || []);

      const specKeys = ['product_code', 'two_width', 'thickness', 'ratio', 'width', 'length', 'memo'];
      const makeKey = (p) => [p.vehicle_code, p.part_code, p.color_code, ...specKeys.map(k => p[k] || '')].join('|');
      const rows = (d.products || []).map((p) => {
        const key = makeKey(p);
        const row = {
          _key: key,
          vehicle_code: p.vehicle_code,
          part_code: p.part_code,
          color_code: p.color_code,
          product_code: p.product_code || '',
          two_width: p.two_width || '',
          thickness: p.thickness || '',
          ratio: p.ratio || '',
          width: p.width || '',
          length: p.length || '',
        };
        // 규격 소수점 정리
        for (const sk of specKeys) {
          if (row[sk]) row[sk] = parseFloat(row[sk]).toString();
        }
        for (const dt of d.dates || []) {
          row[`d_${dt}`] = d.dataMap?.[key]?.[dt] ?? null;
        }
        const latest = d.latestMap?.[key];
        row._current = latest?.quantity ?? null;
        row._currentDate = latest?.date ?? '';
        return row;
      });

      setGridData(rows);
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateRange.start, dateRange.end]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSearch = (e) => { e.preventDefault(); fetchList(); };

  // 셀 변경 → 디바운스 저장
  const flushSaves = useCallback(async () => {
    const entries = [...pendingSaves.current.entries()];
    pendingSaves.current.clear();
    if (entries.length === 0) return;

    const items = entries.map(([, v]) => v);
    try {
      await fetch(`${API}/bulk-upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, updatedBy: userName }),
      });
    } catch { /* silent */ }
  }, [userName]);

  const handleChange = useCallback((newData, operations) => {
    setGridData(newData);
    for (const op of operations) {
      if (op.type === 'UPDATE') {
        for (let i = op.fromRowIndex; i < op.toRowIndex; i++) {
          const row = newData[i];
          if (!row) continue;
          for (const dt of dates) {
            const colKey = `d_${dt}`;
            if (row[colKey] != null) {
              const saveKey = `${row._key}|${dt}`;
              pendingSaves.current.set(saveKey, {
                processType: activeTab,
                vehicleCode: row.vehicle_code,
                partCode: row.part_code,
                colorCode: row.color_code,
                productCode: row.product_code || null,
                twoWidth: row.two_width || null,
                thickness: row.thickness || null,
                ratio: row.ratio || null,
                width: row.width || null,
                length: row.length || null,
                memo: row.memo || null,
                stockDate: dt,
                quantity: row[colKey],
              });
            }
          }
        }
      }
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSaves, 800);
  }, [flushSaves, dates, activeTab]);

  // 컬럼 정의
  const columns = useMemo(() => {
    const cols = [
      { ...keyColumn('vehicle_code', textColumn), title: '차종', disabled: true, minWidth: 80 },
      { ...keyColumn('part_code', textColumn), title: '적용부', disabled: true, minWidth: 110 },
      { ...keyColumn('color_code', textColumn), title: '칼라', disabled: true, minWidth: 55 },
      { ...keyColumn('two_width', textColumn), title: '두폭', disabled: true, minWidth: 45 },
      { ...keyColumn('thickness', textColumn), title: '두께', disabled: true, minWidth: 45 },
      { ...keyColumn('ratio', textColumn), title: '배율', disabled: true, minWidth: 45 },
      { ...keyColumn('width', textColumn), title: '폭', disabled: true, minWidth: 50 },
      { ...keyColumn('length', textColumn), title: '길이', disabled: true, minWidth: 50 },
      { ...keyColumn('memo', textColumn), title: '비고', disabled: true, minWidth: 80 },
    ];
    for (const dt of dates) {
      const mm = dt.slice(5, 7);
      const dd = dt.slice(8, 10);
      cols.push({
        ...keyColumn(`d_${dt}`, intColumn),
        title: `${mm}/${dd}`,
        minWidth: 65,
      });
    }
    cols.push({
      ...keyColumn('_current', intColumn),
      title: '현재고',
      disabled: true,
      minWidth: 80,
    });
    return cols;
  }, [dates]);

  // 제품 추가
  const handleAddProduct = async () => {
    if (!addForm.vehicleCode || !addForm.partCode || !addForm.colorCode) {
      setError('차종/적용부/칼라를 모두 선택해 주세요.');
      return;
    }
    try {
      const res = await fetch(`${API}/add-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processType: activeTab,
          vehicleCode: addForm.vehicleCode,
          partCode: addForm.partCode,
          colorCode: addForm.colorCode,
          updatedBy: userName,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '추가 실패'); return; }
      setAddOpen(false);
      setAddForm({ vehicleCode: '', partCode: '', colorCode: '' });
      fetchList();
    } catch { setError('추가 중 오류'); }
  };

  const activeTabInfo = tabs.find((t) => t.key === activeTab);
  const tabLabel = activeTabInfo?.label || '';

  // 카테고리별 탭 그룹
  const categories = [...new Set(tabs.map(t => t.category))];

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <h1 className={styles.title} style={{ flexShrink: 0 }}>{title}</h1>

      <div className="factory-tab-bar" style={{ flexShrink: 0 }}>
        {categories.map(cat => (
          <div key={cat} className="factory-tab-group">
            <span className="factory-tab-category" data-cat={cat}>{cat}</span>
            <div className="factory-tab-buttons">
              {tabs.filter(t => t.category === cat).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  className={`factory-tab${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSearch} className={styles.searchForm} style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
        <label className={styles.searchLabel}>
          시작일
          <input type="date" value={dateRange.start} onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))} className={styles.input} />
        </label>
        <label className={styles.searchLabel}>
          종료일
          <input type="date" value={dateRange.end} onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))} className={styles.input} />
        </label>
        <button type="submit" className={styles.btnPrimary}>조회</button>
        <button type="button" className={styles.btnSecondary} onClick={() => setAddOpen(true)}>
          제품 추가
        </button>
      </form>

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}

      <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem', flexShrink: 0 }}>
        {tabLabel} — 총 {gridData.length}개 제품
      </div>

      {loading ? (
        <p className={styles.loading}>조회 중...</p>
      ) : (
        <div ref={gridContainerRef} style={{ flex: 1, minHeight: 0 }}>
          <DynamicDataSheetGrid
            value={gridData}
            onChange={handleChange}
            columns={columns}
            rowHeight={32}
            headerRowHeight={36}
            height={gridHeight}
            addRowsComponent={false}
            disableContextMenu
            lockRows
          />
        </div>
      )}

      {addOpen && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 460 }}>
            <h2 className={styles.modalTitle}>{tabLabel} — 제품 추가</h2>
            {error && <div className={styles.error}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>차종 <span className={styles.required}>*</span></div>
                <SelectDropdown options={vehicleCodes} value={addForm.vehicleCode} onChange={(v) => setAddForm((f) => ({ ...f, vehicleCode: v }))} placeholder="선택" searchable />
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>적용부 <span className={styles.required}>*</span></div>
                <SelectDropdown options={partCodes} value={addForm.partCode} onChange={(v) => setAddForm((f) => ({ ...f, partCode: v }))} placeholder="선택" searchable />
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>칼라 <span className={styles.required}>*</span></div>
                <SelectDropdown options={colorCodes} value={addForm.colorCode} onChange={(v) => setAddForm((f) => ({ ...f, colorCode: v }))} placeholder="선택" searchable />
              </div>
            </div>
            <div className={styles.formActions} style={{ marginTop: '1rem' }}>
              <button type="button" className={styles.btnPrimary} onClick={handleAddProduct}>추가</button>
              <button type="button" className={styles.btnSecondary} onClick={() => setAddOpen(false)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FactoryInventory;
