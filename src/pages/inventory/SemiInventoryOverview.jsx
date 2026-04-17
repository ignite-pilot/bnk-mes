/**
 * 반제품 재고 현황 — 경주 | 울산 크로스탭
 */
import React, { useState, useEffect, useCallback } from 'react';
import './InventoryOverview.css';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';
import { fmtSpec } from './formatSpec';
import SafetyAlertBar from './SafetyAlertBar';

const fetchCode = (code) =>
  fetch(`/api/delivery-vehicles/codes/${code}`)
    .then((r) => r.json())
    .then((d) =>
      (d.items || d.list || []).map((c) => ({
        value: c.codeValue || c.value || c.code,
        label: c.label || c.codeName || c.name || c.codeValue,
      }))
    )
    .catch(() => []);

function SemiInventoryOverview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ semiType: '', vehicleCode: '', partCode: '', colorCode: '' });
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
      const res = await fetch('/api/inventory-matrix/semi');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setRows(d.rows || []);
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const filtered = rows.filter((r) => {
    if (search.semiType && r.semi_type !== search.semiType) return false;
    if (search.vehicleCode && r.vehicle_code !== search.vehicleCode) return false;
    if (search.partCode && r.part_code !== search.partCode) return false;
    if (search.colorCode.trim() && !(r.color_code || '').includes(search.colorCode.trim())) return false;
    return true;
  });

  const typeSpan = [];
  let i = 0;
  while (i < filtered.length) {
    let j = i + 1;
    while (j < filtered.length && filtered[j].semi_type === filtered[i].semi_type) j++;
    for (let k = i; k < j; k++) typeSpan.push({ show: k === i, span: k === i ? j - i : 0 });
    i = j;
  }

  const semiTypeOptions = [
    { value: '', label: '전체' },
    { value: '표지', label: '표지' },
    { value: '프라이머', label: '프라이머' },
  ];

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <h1 className={styles.title} style={{ flexShrink: 0 }}>반제품 재고 현황</h1>

      <form onSubmit={(e) => e.preventDefault()} className={styles.searchForm} style={{ flexShrink: 0 }}>
        <label className={styles.searchLabel}>
          종류
          <SelectDropdown
            options={semiTypeOptions}
            value={search.semiType}
            onChange={(val) => setSearch((s) => ({ ...s, semiType: val }))}
            placeholder="전체"
            style={{ minWidth: 120 }}
          />
        </label>
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
        <button type="button" className={styles.btnPrimary} onClick={fetchList}>검색</button>
        <button type="button" className={styles.btnSecondary} onClick={() => setSearch({ semiType: '', vehicleCode: '', partCode: '', colorCode: '' })}>
          초기화
        </button>
      </form>

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}
      <SafetyAlertBar
        rows={filtered}
        getTotal={(row) => Number(row.gj_qty || 0) + Number(row.us_qty || 0)}
        getLabel={(row) => [row.semi_type, row.vehicle_code, row.part_code, row.color_code].filter(Boolean).join(' / ')}
      />
      <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem', flexShrink: 0 }}>
        총 {filtered.length}건
      </div>

      {loading ? (
        <p className={styles.loading}>조회 중...</p>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th className="th-info" rowSpan={2}>종류</th>
                <th className="th-info" rowSpan={2}>차종</th>
                <th className="th-info" rowSpan={2}>적용부</th>
                <th className="th-info" rowSpan={2}>칼라</th>
                <th className="th-spec" rowSpan={2}>두께</th>
                <th className="th-spec" rowSpan={2}>폭</th>
                <th className="th-spec" rowSpan={2}>배율</th>
                <th className="th-bnk" colSpan={2}>BNK 공장</th>
                <th className="th-safety" rowSpan={2}>안전재고</th>
              </tr>
              <tr>
                <th className="th-gj">경주</th>
                <th className="th-us">울산</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const m = typeSpan[idx];
                  const safety = Number(row.safety_stock || 0);
                  const total = Number(row.gj_qty || 0) + Number(row.us_qty || 0);
                  const below = safety > 0 && total < safety;
                  return (
                    <tr key={row.id}>
                      {m.show && <td className="td-info td-kind" rowSpan={m.span}>{row.semi_type}</td>}
                      <td className="td-info td-vehicle">{row.vehicle_code}</td>
                      <td className="td-info td-part">{row.part_code}</td>
                      <td className="td-info td-color">{row.color_code}</td>
                      <td className="td-spec">{fmtSpec(row.thickness)}</td>
                      <td className="td-spec">{fmtSpec(row.width)}</td>
                      <td className="td-spec">{fmtSpec(row.ratio)}</td>
                      <td className="td-gj">{Number(row.gj_qty || 0).toLocaleString()}</td>
                      <td className="td-us">{Number(row.us_qty || 0).toLocaleString()}</td>
                      <td className={`td-safety${below ? ' below-safety' : ''}`}>
                        {safety ? safety.toLocaleString() : ''}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default SemiInventoryOverview;
