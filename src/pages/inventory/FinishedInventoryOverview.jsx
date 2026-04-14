/**
 * 완제품 재고 현황 — 울산 공장 + 납품처(동적) 크로스탭
 */
import React, { useState, useEffect, useCallback } from 'react';
import './InventoryOverview.css';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';
import { fmtSpec } from './formatSpec';

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

function FinishedInventoryOverview() {
  const [affiliates, setAffiliates] = useState([]);
  const [rows, setRows] = useState([]);
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
      const res = await fetch('/api/inventory-matrix/finished');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setAffiliates(d.affiliates || []);
      setRows(d.rows || []);
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const filtered = rows.filter((r) => {
    if (search.vehicleCode && r.vehicle_code !== search.vehicleCode) return false;
    if (search.partCode && r.part_code !== search.partCode) return false;
    if (search.colorCode.trim() && !(r.color_code || '').includes(search.colorCode.trim())) return false;
    return true;
  });

  const totalCols = 7 + 1 + affiliates.length + 1;

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <h1 className={styles.title} style={{ flexShrink: 0 }}>완제품 재고 현황</h1>

      <form onSubmit={(e) => e.preventDefault()} className={styles.searchForm} style={{ flexShrink: 0 }}>
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
        <button type="button" className={styles.btnSecondary} onClick={() => setSearch({ vehicleCode: '', partCode: '', colorCode: '' })}>
          초기화
        </button>
      </form>

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}
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
                <th className="th-info" rowSpan={2}>차종</th>
                <th className="th-info" rowSpan={2}>적용부</th>
                <th className="th-info" rowSpan={2}>칼라</th>
                <th className="th-spec" colSpan={5}>규격</th>
                <th className="th-bnk" rowSpan={2}>울산 공장</th>
                {affiliates.length > 0 && (
                  <th className="th-aff" colSpan={affiliates.length}>납품처</th>
                )}
                <th className="th-safety" rowSpan={2}>안전재고</th>
              </tr>
              <tr>
                <th className="th-spec">두폭</th>
                <th className="th-spec">두께</th>
                <th className="th-spec">배율</th>
                <th className="th-spec">폭</th>
                <th className="th-spec">길이</th>
                {affiliates.map((a) => (
                  <th key={a.id} className="th-aff">{a.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const safety = Number(row.safety_stock || 0);
                  const totalQty =
                    Number(row.us_qty || 0) +
                    Object.values(row.affiliate_qty || {}).reduce((a, b) => a + (Number(b) || 0), 0);
                  const below = safety > 0 && totalQty < safety;
                  return (
                    <tr key={row.id}>
                      <td className="td-info td-vehicle">{row.vehicle_code}</td>
                      <td className="td-info td-part">{row.part_code}</td>
                      <td className="td-info td-color">{row.color_code}</td>
                      <td className="td-spec">{fmtSpec(row.two_width)}</td>
                      <td className="td-spec">{fmtSpec(row.thickness)}</td>
                      <td className="td-spec">{fmtSpec(row.ratio)}</td>
                      <td className="td-spec">{fmtSpec(row.width)}</td>
                      <td className="td-spec">{fmtSpec(row.length)}</td>
                      <td className="td-us">{Number(row.us_qty || 0).toLocaleString()}</td>
                      {affiliates.map((a) => (
                        <td key={a.id} className="td-aff">
                          {Number(row.affiliate_qty?.[a.id] || 0).toLocaleString()}
                        </td>
                      ))}
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

export default FinishedInventoryOverview;
