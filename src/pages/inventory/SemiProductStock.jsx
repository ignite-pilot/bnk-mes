/**
 * 반제품 재고 관리 — master_semi_products 기준 일자별 수량 입력 (경주/울산 탭)
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DynamicDataSheetGrid, textColumn, intColumn, keyColumn } from 'react-datasheet-grid';
import 'react-datasheet-grid/dist/style.css';
import './FactoryInventory.css';
import { useAuth } from '../../context/AuthContext';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/product-stock';

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function SemiProductStock() {
  const { user } = useAuth();
  const userName = user?.name || user?.email || 'unknown';
  const [factory, setFactory] = useState('gj');
  const [rows, setRows] = useState([]);
  const [dates, setDates] = useState([]);
  const [dateRange, setDateRange] = useState({ start: daysAgo(6), end: todayStr() });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ semiType: '', vehicleCode: '', partCode: '', colorCode: '' });
  const [gridHeight, setGridHeight] = useState(600);
  const containerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef({});

  useEffect(() => {
    const calc = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setGridHeight(Math.max(400, window.innerHeight - rect.top - 80));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ start: dateRange.start, end: dateRange.end, factory });
      const res = await fetch(`${API}/semi?${q}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setDates(d.dates || []);
      setRows(d.rows || []);
    } catch {
      setError('조회 중 오류');
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end, factory]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const flushSaves = useCallback(async () => {
    const items = Object.values(pendingRef.current);
    pendingRef.current = {};
    if (items.length === 0) return;
    try {
      await fetch(`${API}/semi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factory, items, updatedBy: userName }),
      });
    } catch {
      setError('저장 중 오류');
    }
  }, [factory, userName]);

  const queueSave = useCallback((product_id, stock_date, quantity) => {
    pendingRef.current[`${product_id}_${stock_date}`] = { product_id, stock_date, quantity };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flushSaves(); }, 600);
  }, [flushSaves]);

  const handleChange = useCallback((newData) => {
    setRows((prev) => {
      const next = newData;
      for (let i = 0; i < next.length; i++) {
        const nr = next[i];
        const pr = prev[i];
        if (!pr || pr.id !== nr.id) continue;
        for (const dt of dates) {
          const k = `d_${dt}`;
          if (pr[k] !== nr[k]) {
            const v = nr[k];
            queueSave(nr.id, dt, v == null ? 0 : Number(v) || 0);
          }
        }
      }
      return next;
    });
  }, [dates, queueSave]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search.semiType && r.semi_type !== search.semiType) return false;
      if (search.vehicleCode && r.vehicle_code !== search.vehicleCode) return false;
      if (search.partCode && r.part_code !== search.partCode) return false;
      if (search.colorCode.trim() && !(r.color_code || '').includes(search.colorCode.trim())) return false;
      return true;
    });
  }, [rows, search]);

  const columns = useMemo(() => {
    const cols = [
      { ...keyColumn('semi_type', textColumn), title: '종류', disabled: true, minWidth: 70 },
      { ...keyColumn('vehicle_code', textColumn), title: '차종', disabled: true, minWidth: 80 },
      { ...keyColumn('part_code', textColumn), title: '적용부', disabled: true, minWidth: 110 },
      { ...keyColumn('color_code', textColumn), title: '칼라', disabled: true, minWidth: 55 },
      { ...keyColumn('thickness', textColumn), title: '두께', disabled: true, minWidth: 45 },
      { ...keyColumn('width', textColumn), title: '폭', disabled: true, minWidth: 50 },
      { ...keyColumn('ratio', textColumn), title: '배율', disabled: true, minWidth: 45 },
    ];
    for (const dt of dates) {
      cols.push({ ...keyColumn(`d_${dt}`, intColumn), title: `${dt.slice(5, 7)}/${dt.slice(8, 10)}`, minWidth: 65 });
    }
    cols.push({ ...keyColumn('_safety', intColumn), title: '안전재고', disabled: true, minWidth: 70 });
    return cols;
  }, [dates]);

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <h1 className={styles.title} style={{ flexShrink: 0 }}>반제품 재고 관리</h1>

      <div className="factory-tab-bar" style={{ flexShrink: 0 }}>
        <div className="factory-tab-group">
          <span className="factory-tab-category" data-cat="공장">공장</span>
          <div className="factory-tab-buttons">
            <button type="button" className={`factory-tab${factory === 'gj' ? ' active' : ''}`} onClick={() => setFactory('gj')}>경주</button>
            <button type="button" className={`factory-tab${factory === 'us' ? ' active' : ''}`} onClick={() => setFactory('us')}>울산</button>
          </div>
        </div>
      </div>

      <div className={styles.searchForm} style={{ flexShrink: 0 }}>
        <label className={styles.searchLabel}>시작일
          <input type="date" value={dateRange.start} onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))} className={styles.input} />
        </label>
        <label className={styles.searchLabel}>종료일
          <input type="date" value={dateRange.end} onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))} className={styles.input} />
        </label>
        <label className={styles.searchLabel}>종류
          <input type="text" value={search.semiType} onChange={(e) => setSearch((s) => ({ ...s, semiType: e.target.value }))} className={styles.input} placeholder="표지/프라이머" />
        </label>
        <label className={styles.searchLabel}>차종
          <input type="text" value={search.vehicleCode} onChange={(e) => setSearch((s) => ({ ...s, vehicleCode: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <label className={styles.searchLabel}>적용부
          <input type="text" value={search.partCode} onChange={(e) => setSearch((s) => ({ ...s, partCode: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <label className={styles.searchLabel}>칼라
          <input type="text" value={search.colorCode} onChange={(e) => setSearch((s) => ({ ...s, colorCode: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <button type="button" className={styles.btnPrimary} onClick={fetchList}>조회</button>
      </div>

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}
      <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem', flexShrink: 0 }}>
        총 {filtered.length}건
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <p className={styles.loading}>조회 중...</p>
        ) : (
          <DynamicDataSheetGrid
            value={filtered}
            onChange={handleChange}
            columns={columns}
            height={gridHeight}
            rowHeight={32}
            lockRows
          />
        )}
      </div>
    </div>
  );
}

export default SemiProductStock;
