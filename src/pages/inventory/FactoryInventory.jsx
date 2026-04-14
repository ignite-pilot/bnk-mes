/**
 * 공장별 재고 관리 — 공통 컴포넌트
 * props.factory: 'gj' | 'us'
 * props.title: 페이지 제목
 *
 * 구조: 공정 탭 → [현재고 관리 | 일자별 조회] 뷰 탭
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
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
    { key: 'gj_surface', label: '표면처리제/접착제', category: '원자재', bulk: true },
    { key: 'gj_foam', label: '폼', category: '원자재' },
    { key: 'gj_primer', label: '프라이머', category: '원자재', bulk: true },
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
  return { start: new Date(y, m, 1).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

function FactoryInventory({ factory, title }) {
  const tabs = FACTORY_TABS[factory] || [];
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || '');
  const [viewMode, setViewMode] = useState('current'); // 'current' | 'daily'
  const [dateRange, setDateRange] = useState(getDefaultRange);
  const [gridData, setGridData] = useState([]);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetchCode('VEHICLE_CODE').then(setVehicleCodes);
    fetchCode('PART_CODE').then(setPartCodes);
    fetchCode('COLOR_CODE').then(setColorCodes);
  }, []);

  useEffect(() => {
    const measure = () => {
      if (gridContainerRef.current) {
        const rect = gridContainerRef.current.getBoundingClientRect();
        setGridHeight(Math.max(400, window.innerHeight - rect.top - 80));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading, viewMode]);

  const activeTabInfo = tabs.find((t) => t.key === activeTab);
  const tabLabel = activeTabInfo?.label || '';
  const isBulk = activeTabInfo?.bulk || false;

  // ── 데이터 조회 ──
  const fetchList = useCallback(async () => {
    if (!activeTab) return;
    setLoading(true);
    setError('');
    try {
      const startDate = viewMode === 'current' ? today : dateRange.start;
      const endDate = viewMode === 'current' ? today : dateRange.end;
      const q = new URLSearchParams({ processType: activeTab, startDate, endDate });
      const res = await fetch(`${API}?${q}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }

      setDates(d.dates || []);

      let ssMap = {};
      try {
        const ssRes = await fetch(`${API}/safety-stock`);
        const ssData = await ssRes.json().catch(() => ({}));
        ssMap = ssData.map || {};
      } catch { /* silent */ }

      const specKeys = ['product_code', 'two_width', 'thickness', 'ratio', 'width', 'length', 'memo'];
      const makeKey = (p) => [p.vehicle_code, p.part_code, p.color_code, ...specKeys.map(k => p[k] || '')].join('|');
      const rows = (d.products || []).map((p) => {
        const key = makeKey(p);
        const row = {
          _key: key,
          vehicle_code: p.vehicle_code, part_code: p.part_code, color_code: p.color_code,
          product_code: p.product_code || '', two_width: p.two_width || '', thickness: p.thickness || '',
          ratio: p.ratio || '', width: p.width || '', length: p.length || '', memo: p.memo || '',
        };
        for (const sk of specKeys) { if (row[sk] && !isNaN(Number(row[sk]))) row[sk] = parseFloat(row[sk]).toString(); }
        for (const dt of d.dates || []) { row[`d_${dt}`] = d.dataMap?.[key]?.[dt] ?? null; }
        const latest = d.latestMap?.[key];
        row._current = latest?.quantity ?? null;
        row._currentDate = latest?.date ?? '';
        const ss = ssMap[key];
        row._safety = ss?.finished || ss?.semi || ss?.bnk || ss?.supplier || null;
        return row;
      });

      setGridData(rows);
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, viewMode, dateRange.start, dateRange.end, today]);

  useEffect(() => { if (!isBulk) fetchList(); }, [fetchList, isBulk]);

  // ── 총량 관리 (bulk) ──
  const [bulkQty, setBulkQty] = useState({});
  const bulkSaveTimer = useRef(null);

  const fetchBulk = useCallback(async () => {
    if (!activeTab || !isBulk) return;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ processType: activeTab, startDate: dateRange.start, endDate: dateRange.end });
      const res = await fetch(`${API}?${q}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setDates(d.dates || []);
      const qty = {};
      for (const [, dateMap] of Object.entries(d.dataMap || {})) {
        for (const [dt, val] of Object.entries(dateMap)) { qty[dt] = (qty[dt] || 0) + val; }
      }
      setBulkQty(qty);
    } catch { setError('조회 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  }, [activeTab, isBulk, dateRange.start, dateRange.end]);

  useEffect(() => { if (isBulk) fetchBulk(); }, [fetchBulk, isBulk]);

  const handleBulkChange = (dt, value) => {
    const qty = Number(value) || 0;
    setBulkQty(prev => ({ ...prev, [dt]: qty }));
    if (bulkSaveTimer.current) clearTimeout(bulkSaveTimer.current);
    bulkSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`${API}/upsert`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processType: activeTab, vehicleCode: '_BULK', partCode: '_BULK', colorCode: '_BULK', stockDate: dt, quantity: qty, updatedBy: userName }),
        });
      } catch { /* silent */ }
    }, 800);
  };

  // ── 셀 변경 → 디바운스 저장 ──
  const flushSaves = useCallback(async () => {
    const entries = [...pendingSaves.current.entries()];
    pendingSaves.current.clear();
    if (!entries.length) return;
    try {
      await fetch(`${API}/bulk-upsert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: entries.map(([, v]) => v), updatedBy: userName }),
      });
    } catch { /* silent */ }
  }, [userName]);

  const handleChange = useCallback((newData, operations) => {
    setGridData(newData);
    for (const op of operations) {
      if (op.type !== 'UPDATE') continue;
      for (let i = op.fromRowIndex; i < op.toRowIndex; i++) {
        const row = newData[i];
        if (!row) continue;
        for (const dt of dates) {
          const colKey = `d_${dt}`;
          if (row[colKey] != null) {
            pendingSaves.current.set(`${row._key}|${dt}`, {
              processType: activeTab, vehicleCode: row.vehicle_code, partCode: row.part_code, colorCode: row.color_code,
              productCode: row.product_code || null, twoWidth: row.two_width || null, thickness: row.thickness || null,
              ratio: row.ratio || null, width: row.width || null, length: row.length || null, memo: row.memo || null,
              stockDate: dt, quantity: row[colKey],
            });
          }
        }
      }
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSaves, 800);
  }, [flushSaves, dates, activeTab]);

  // ── 현재고 컬럼 (날짜 없이) ──
  const currentColumns = useMemo(() => [
    { ...keyColumn('vehicle_code', textColumn), title: '차종', disabled: true, minWidth: 60, grow: 0.48 },
    { ...keyColumn('part_code', textColumn), title: '적용부', disabled: true, minWidth: 108, grow: 0.9 },
    { ...keyColumn('color_code', textColumn), title: '칼라', disabled: true, minWidth: 48, grow: 0.36 },
    { ...keyColumn('two_width', textColumn), title: '두폭', disabled: true, minWidth: 35, grow: 0.2 },
    { ...keyColumn('thickness', textColumn), title: '두께', disabled: true, minWidth: 35, grow: 0.2 },
    { ...keyColumn('ratio', textColumn), title: '배율', disabled: true, minWidth: 35, grow: 0.2 },
    { ...keyColumn('width', textColumn), title: '폭', disabled: true, minWidth: 40, grow: 0.3 },
    { ...keyColumn('length', textColumn), title: '길이', disabled: true, minWidth: 40, grow: 0.3 },
    { ...keyColumn('memo', textColumn), title: '비고', disabled: true, minWidth: 80, grow: 0.5 },
    { ...keyColumn(`d_${today}`, intColumn), title: '현재고', minWidth: 80, grow: 0.5 },
    { ...keyColumn('_safety', intColumn), title: '안전재고', disabled: true, minWidth: 60, grow: 0.3 },
  ], [today]);

  // ── 일자별 컬럼 ──
  const dailyColumns = useMemo(() => {
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
      cols.push({ ...keyColumn(`d_${dt}`, intColumn), title: `${dt.slice(5, 7)}/${dt.slice(8, 10)}`, minWidth: 65, disabled: true });
    }
    cols.push({ ...keyColumn('_safety', intColumn), title: '안전재고', disabled: true, minWidth: 70 });
    return cols;
  }, [dates]);

  // ── 제품 추가 ──
  const handleAddProduct = async () => {
    if (!addForm.vehicleCode || !addForm.partCode || !addForm.colorCode) { setError('차종/적용부/칼라를 모두 선택해 주세요.'); return; }
    try {
      const res = await fetch(`${API}/add-product`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processType: activeTab, vehicleCode: addForm.vehicleCode, partCode: addForm.partCode, colorCode: addForm.colorCode, updatedBy: userName }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '추가 실패'); return; }
      setAddOpen(false); setAddForm({ vehicleCode: '', partCode: '', colorCode: '' }); fetchList();
    } catch { setError('추가 중 오류'); }
  };

  // ── 엑셀 다운로드 ──
  const handleExcelDownload = () => {
    if (gridData.length === 0) return;
    const specHeaders = ['차종', '적용부', '칼라', '두폭', '두께', '배율', '폭', '길이', '비고'];
    const dateHeaders = dates.map(dt => `${dt.slice(5, 7)}/${dt.slice(8, 10)}`);
    const headers = [...specHeaders, ...dateHeaders, '안전재고'];
    const aoa = [headers];
    for (const row of gridData) {
      aoa.push([
        row.vehicle_code, row.part_code, row.color_code,
        row.two_width, row.thickness, row.ratio, row.width, row.length, row.memo || '',
        ...dates.map(dt => row[`d_${dt}`] ?? ''),
        row._safety ?? '',
      ]);
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, '일자별재고');
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `${tabLabel}_일자별재고-${ymd}.xlsx`);
  };

  const categories = [...new Set(tabs.map(t => t.category))];

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <h1 className={styles.title} style={{ flexShrink: 0 }}>{title}</h1>

      {/* 공정 탭 */}
      <div className="factory-tab-bar" style={{ flexShrink: 0 }}>
        {categories.map(cat => (
          <div key={cat} className="factory-tab-group">
            <span className="factory-tab-category" data-cat={cat}>{cat}</span>
            <div className="factory-tab-buttons">
              {tabs.filter(t => t.category === cat).map(tab => (
                <button key={tab.key} type="button" className={`factory-tab${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => { setActiveTab(tab.key); setViewMode('current'); }}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 뷰 탭 (bulk가 아닌 경우만) */}
      {!isBulk && (
        <div className="view-tab-bar" style={{ flexShrink: 0 }}>
          <button type="button" className={`view-tab${viewMode === 'current' ? ' active' : ''}`} onClick={() => setViewMode('current')}>현재고 관리</button>
          <button type="button" className={`view-tab${viewMode === 'daily' ? ' active' : ''}`} onClick={() => setViewMode('daily')}>일자별 조회</button>
        </div>
      )}

      {/* 일자별 조회: 기간 선택 + 엑셀 다운로드 */}
      {!isBulk && viewMode === 'daily' && (
        <div className={styles.searchForm} style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
          <label className={styles.searchLabel}>시작일
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange(r => ({ ...r, start: e.target.value }))} className={styles.input} />
          </label>
          <label className={styles.searchLabel}>종료일
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange(r => ({ ...r, end: e.target.value }))} className={styles.input} />
          </label>
          <button type="button" className={styles.btnPrimary} onClick={fetchList}>조회</button>
          <button type="button" className={styles.btnSecondary} onClick={handleExcelDownload}>엑셀 다운로드</button>
        </div>
      )}

      {/* 현재고 관리: 제품 추가 버튼 */}
      {!isBulk && viewMode === 'current' && (
        <div className={styles.toolbar} style={{ flexShrink: 0 }}>
          <button type="button" className={styles.btnSecondary} onClick={() => setAddOpen(true)}>제품 추가</button>
        </div>
      )}

      {/* 총량 관리: 기간 선택 */}
      {isBulk && (
        <div className={styles.searchForm} style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
          <label className={styles.searchLabel}>시작일
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange(r => ({ ...r, start: e.target.value }))} className={styles.input} />
          </label>
          <label className={styles.searchLabel}>종료일
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange(r => ({ ...r, end: e.target.value }))} className={styles.input} />
          </label>
          <button type="button" className={styles.btnPrimary} onClick={fetchBulk}>조회</button>
        </div>
      )}

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}

      {loading ? (
        <p className={styles.loading}>조회 중...</p>
      ) : isBulk ? (
        /* ── 총량 관리: 달력 ── */
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div className="bulk-header">
            <div className="bulk-title-area">
              <h2 className="bulk-title">{tabLabel}</h2>
              <span className="bulk-badge">총량 관리</span>
            </div>
            <p className="bulk-desc">제품 구분 없이 전체 수량을 일별로 관리합니다.</p>
          </div>
          {(() => {
            if (dates.length === 0) return null;
            const todayStr = today;
            const dateSet = new Set(dates);
            const startDt = new Date(dates[0]);
            const endDt = new Date(dates[dates.length - 1]);
            const calStart = new Date(startDt);
            calStart.setDate(calStart.getDate() - calStart.getDay() - 7);
            const calEnd = new Date(endDt);
            calEnd.setDate(calEnd.getDate() + (6 - calEnd.getDay()) + 7);
            const allDays = [];
            const d = new Date(calStart);
            while (d <= calEnd) { allDays.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
            const firstMonth = `${startDt.getFullYear()}년 ${startDt.getMonth() + 1}월`;
            const lastMonth = `${endDt.getFullYear()}년 ${endDt.getMonth() + 1}월`;
            const monthLabel = firstMonth === lastMonth ? firstMonth : `${firstMonth} ~ ${lastMonth}`;

            return (
              <div className="cal-month">
                <div className="cal-month-title">{monthLabel}</div>
                <div className="cal-weekdays">
                  {['일', '월', '화', '수', '목', '금', '토'].map(wd => (
                    <div key={wd} className={`cal-weekday${wd === '일' || wd === '토' ? ' weekend' : ''}`}>{wd}</div>
                  ))}
                </div>
                <div className="cal-grid">
                  {allDays.map(dt => {
                    const dayNum = Number(dt.slice(8));
                    const dayOfWeek = new Date(dt).getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const isToday = dt === todayStr;
                    const inRange = dateSet.has(dt);
                    return (
                      <div key={dt} className={`cal-cell${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}${!inRange ? ' out' : ''}`}>
                        <span className="cal-day">{dayNum === 1 ? `${Number(dt.slice(5, 7))}/${dayNum}` : dayNum}</span>
                        {inRange ? (
                          <input type="number" min="0" className="cal-input" value={bulkQty[dt] || ''} onChange={(e) => handleBulkChange(dt, e.target.value)} placeholder="0" />
                        ) : (
                          <span className="cal-no-data">-</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        /* ── 제품별 관리 ── */
        <>
          <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem', flexShrink: 0 }}>
            {tabLabel} — 총 {gridData.length}개 제품
          </div>
          <div ref={gridContainerRef} style={{ flex: 1, minHeight: 0 }}>
            <DynamicDataSheetGrid
              value={gridData}
              onChange={viewMode === 'current' ? handleChange : undefined}
              columns={viewMode === 'current' ? currentColumns : dailyColumns}
              rowHeight={32}
              headerRowHeight={36}
              height={gridHeight}
              addRowsComponent={false}
              disableContextMenu
              lockRows
            />
          </div>
        </>
      )}

      {/* 제품 추가 모달 */}
      {addOpen && !isBulk && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 460 }}>
            <h2 className={styles.modalTitle}>{tabLabel} — 제품 추가</h2>
            {error && <div className={styles.error}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>차종 <span className={styles.required}>*</span></div>
                <SelectDropdown options={vehicleCodes} value={addForm.vehicleCode} onChange={(v) => setAddForm(f => ({ ...f, vehicleCode: v }))} placeholder="선택" searchable />
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>적용부 <span className={styles.required}>*</span></div>
                <SelectDropdown options={partCodes} value={addForm.partCode} onChange={(v) => setAddForm(f => ({ ...f, partCode: v }))} placeholder="선택" searchable />
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>칼라 <span className={styles.required}>*</span></div>
                <SelectDropdown options={colorCodes} value={addForm.colorCode} onChange={(v) => setAddForm(f => ({ ...f, colorCode: v }))} placeholder="선택" searchable />
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
