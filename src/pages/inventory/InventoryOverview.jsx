/**
 * 재고 현황 — 읽기 전용 테이블 (차종/적용부 셀 병합)
 */
import React, { useState, useEffect, useCallback } from 'react';
import './InventoryOverview.css';
import { useAuth } from '../../context/AuthContext';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/inventory-overview';

const fetchCode = (code) =>
  fetch(`/api/delivery-vehicles/codes/${code}`)
    .then((r) => r.json())
    .then((d) => (d.items || d.list || []).map((c) => ({ value: c.codeValue || c.value || c.code, label: c.label || c.codeName || c.name || c.codeValue })))
    .catch(() => []);

function InventoryOverview() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState({ vehicleCode: '', partCode: '', colorCode: '' });
  const [vehicleCodes, setVehicleCodes] = useState([]);
  const [partCodes, setPartCodes] = useState([]);

  useEffect(() => {
    fetchCode('VEHICLE_CODE').then(setVehicleCodes);
    fetchCode('PART_CODE').then(setPartCodes);
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/daily-inventory/overview');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      let rows = d.list || [];
      if (search.vehicleCode) rows = rows.filter(r => r.vehicle_code === search.vehicleCode);
      if (search.partCode) rows = rows.filter(r => r.part_code === search.partCode);
      if (search.colorCode.trim()) rows = rows.filter(r => r.color_code.includes(search.colorCode.trim()));
      setData(rows);
      setTotal(rows.length);
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [search.vehicleCode, search.partCode, search.colorCode]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSearch = (e) => { e.preventDefault(); fetchList(); };
  const handleReset = () => { setSearch({ vehicleCode: '', partCode: '', colorCode: '' }); };

  const handleExcelDownload = async () => {
    const q = new URLSearchParams();
    if (search.vehicleCode) q.set('vehicleCode', search.vehicleCode);
    if (search.partCode) q.set('partCode', search.partCode);
    if (search.colorCode.trim()) q.set('colorCode', search.colorCode.trim());
    try {
      const res = await fetch(`${API}/export-excel?${q}`);
      if (!res.ok) { setError('다운로드 실패'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'inventory_overview.csv'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 200);
    } catch { setError('다운로드 중 오류'); }
  };

  // rowSpan 계산: 차종, 적용부
  const buildMergeInfo = (rows) => {
    const info = [];
    let i = 0;
    while (i < rows.length) {
      let vehicleEnd = i + 1;
      while (vehicleEnd < rows.length && rows[vehicleEnd].vehicle_code === rows[i].vehicle_code) vehicleEnd++;
      const vehicleSpan = vehicleEnd - i;

      let j = i;
      while (j < vehicleEnd) {
        let partEnd = j + 1;
        while (partEnd < vehicleEnd && rows[partEnd].part_code === rows[j].part_code) partEnd++;
        const partSpan = partEnd - j;

        for (let k = j; k < partEnd; k++) {
          info.push({
            showVehicle: k === i,
            vehicleSpan: k === i ? vehicleSpan : 0,
            showPart: k === j,
            partSpan: k === j ? partSpan : 0,
          });
        }
        j = partEnd;
      }
      i = vehicleEnd;
    }
    return info;
  };

  const mergeInfo = buildMergeInfo(data);

  const specColumns = [
    { key: 'two_width', label: '두폭' },
    { key: 'thickness', label: '두께' },
    { key: 'ratio', label: '배율' },
    { key: 'width', label: '폭' },
    { key: 'length', label: '길이' },
    { key: 'memo', label: '비고' },
  ];

  // 경주 공장 컬럼
  const gjColumns = [
    { key: 'qty_gj_sangji', label: '상지' },
    { key: 'qty_gj_surface', label: '표면처리제/접착제' },
    { key: 'qty_gj_foam', label: '폼' },
    { key: 'qty_gj_primer', label: '프라이머' },
    { key: 'qty_gj_pyoji', label: '표지' },
    { key: 'qty_gj_foam_primer', label: '폼 프라이머' },
  ];

  // 울산 공장 컬럼
  const usColumns = [
    { key: 'qty_us_haji', label: '하지' },
    { key: 'qty_us_foam_raw', label: '미처리 폼' },
    { key: 'qty_us_pyoji', label: '표지' },
    { key: 'qty_us_foam_primer', label: '폼 프라이머' },
    { key: 'qty_us_finished', label: '완제품' },
  ];

  const totalCols = 3 + specColumns.length + gjColumns.length + usColumns.length;

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <h1 className={styles.title} style={{ flexShrink: 0 }}>재고 현황</h1>

      <form onSubmit={handleSearch} className={styles.searchForm} style={{ flexShrink: 0 }}>
        <label className={styles.searchLabel}>
          차종
          <SelectDropdown
            options={[{ value: '', label: '전체' }, ...vehicleCodes]}
            value={search.vehicleCode}
            onChange={(val) => setSearch((s) => ({ ...s, vehicleCode: val }))}
            placeholder="전체"
            style={{ minWidth: 120 }}
            searchable
          />
        </label>
        <label className={styles.searchLabel}>
          적용부
          <SelectDropdown
            options={[{ value: '', label: '전체' }, ...partCodes]}
            value={search.partCode}
            onChange={(val) => setSearch((s) => ({ ...s, partCode: val }))}
            placeholder="전체"
            style={{ minWidth: 120 }}
            searchable
          />
        </label>
        <label className={styles.searchLabel}>
          칼라
          <input
            type="text"
            value={search.colorCode}
            onChange={(e) => setSearch((s) => ({ ...s, colorCode: e.target.value }))}
            className={styles.input}
            placeholder="검색"
          />
        </label>
        <button type="submit" className={styles.btnPrimary}>검색</button>
        <button type="button" className={styles.btnSecondary} onClick={handleReset}>초기화</button>
      </form>

      <div className={styles.toolbar} style={{ flexShrink: 0 }}>
        <button type="button" className={styles.btnSecondary} onClick={handleExcelDownload}>
          엑셀 다운로드
        </button>
      </div>

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}

      <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem', flexShrink: 0 }}>총 {total}건</div>

      {loading ? (
        <p className={styles.loading}>조회 중...</p>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th className="th-info" rowSpan={2}>차종</th>
                <th className="th-info" rowSpan={2}>적용부</th>
                <th className="th-info" rowSpan={2}>칼라</th>
                <th className="th-spec" colSpan={6}>규격</th>
                <th className="th-gj" colSpan={gjColumns.length}>경주 공장</th>
                <th className="th-us" colSpan={usColumns.length}>울산 공장</th>
              </tr>
              <tr>
                {specColumns.map(c => <th key={c.key} className="th-spec">{c.label}</th>)}
                {gjColumns.map(c => <th key={c.key} className="th-gj">{c.label}</th>)}
                {usColumns.map(c => <th key={c.key} className="th-us">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={totalCols} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>데이터가 없습니다.</td></tr>
              ) : data.map((row, idx) => {
                const m = mergeInfo[idx];
                return (
                  <tr key={idx}>
                    {m.showVehicle && <td className="td-info td-vehicle" rowSpan={m.vehicleSpan}>{row.vehicle_code}</td>}
                    {m.showPart && <td className="td-info td-part" rowSpan={m.partSpan}>{row.part_code}</td>}
                    <td className="td-info td-color">{row.color_code}</td>
                    {specColumns.map(c => {
                      const v = row[c.key];
                      const cls = c.key === 'memo' ? 'td-spec td-memo' : 'td-spec';
                      if (!v) return <td key={c.key} className={cls}></td>;
                      const n = Number(v);
                      return <td key={c.key} className={cls}>{isNaN(n) ? v : n.toString()}</td>;
                    })}
                    {gjColumns.map(c => (
                      <td key={c.key} className="td-gj">
                        {row[c.key] != null ? Number(row[c.key]).toLocaleString() : ''}
                      </td>
                    ))}
                    {usColumns.map(c => (
                      <td key={c.key} className="td-us">
                        {row[c.key] != null ? Number(row[c.key]).toLocaleString() : ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default InventoryOverview;
