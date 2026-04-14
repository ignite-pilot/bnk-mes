/**
 * 원자재 재고 현황 — 업체 창고(동적) + BNK 경주/울산 크로스탭
 */
import React, { useState, useEffect, useCallback } from 'react';
import './InventoryOverview.css';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';

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

function RawInventoryOverview() {
  const [warehouses, setWarehouses] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState({ kindName: '', vehicleCode: '', partCode: '', colorCode: '' });
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
      const res = await fetch('/api/inventory-matrix/raw');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || '조회 실패');
        return;
      }
      setWarehouses(d.warehouses || []);
      setRows(d.rows || []);
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const filtered = rows.filter((r) => {
    if (search.kindName && r.kind_name !== search.kindName) return false;
    if (search.vehicleCode && r.vehicle_code !== search.vehicleCode) return false;
    if (search.partCode && r.part_code !== search.partCode) return false;
    if (search.colorCode.trim() && !(r.color_code || '').includes(search.colorCode.trim())) return false;
    return true;
  });

  // 종류별로 묶어서 행 머지 (상지 | 협성 | 현진 | 경주 | 울산 형식)
  const kindOrder = ['상지', '하지', '프라이머', '접착제', 'Foam'];
  const kindOptions = [{ value: '', label: '전체' }, ...kindOrder.map((k) => ({ value: k, label: k }))];

  // rowSpan info
  const kindSpan = [];
  let i = 0;
  while (i < filtered.length) {
    let j = i + 1;
    while (j < filtered.length && filtered[j].kind_name === filtered[i].kind_name) j++;
    for (let k = i; k < j; k++) kindSpan.push({ show: k === i, span: k === i ? j - i : 0 });
    i = j;
  }

  const specCount = 5; // 차종, 적용부, 칼라, 두께, 폭
  const totalCols = 1 + specCount + warehouses.length + 2 + 1; // kind + spec + suppliers + gj/us + safety

  return (
    <div
      className={styles.page}
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}
    >
      <h1 className={styles.title} style={{ flexShrink: 0 }}>원자재 재고 현황</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); }}
        className={styles.searchForm}
        style={{ flexShrink: 0 }}
      >
        <label className={styles.searchLabel}>
          종류
          <SelectDropdown
            options={kindOptions}
            value={search.kindName}
            onChange={(val) => setSearch((s) => ({ ...s, kindName: val }))}
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
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => setSearch({ kindName: '', vehicleCode: '', partCode: '', colorCode: '' })}
        >
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
                <th className="th-info" rowSpan={2}>종류</th>
                <th className="th-info" rowSpan={2}>차종</th>
                <th className="th-info" rowSpan={2}>적용부</th>
                <th className="th-info" rowSpan={2}>칼라</th>
                <th className="th-spec" rowSpan={2}>두께</th>
                <th className="th-spec" rowSpan={2}>폭</th>
                {warehouses.length > 0 && (
                  <th className="th-supplier" colSpan={warehouses.length}>업체 창고</th>
                )}
                <th className="th-bnk" colSpan={2}>BNK 공장</th>
                <th className="th-safety" rowSpan={2}>안전재고</th>
              </tr>
              <tr>
                {warehouses.map((w) => (
                  <th key={w.id} className="th-supplier" title={w.warehouse_name}>
                    {w.supplier_name}
                  </th>
                ))}
                <th className="th-gj">경주</th>
                <th className="th-us">울산</th>
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
                filtered.map((row, idx) => {
                  const m = kindSpan[idx];
                  const safety = Number(row.safety_stock || 0);
                  const totalQty =
                    Object.values(row.supplier_qty || {}).reduce((a, b) => a + (Number(b) || 0), 0) +
                    Number(row.gj_qty || 0) +
                    Number(row.us_qty || 0);
                  const below = safety > 0 && totalQty < safety;
                  return (
                    <tr key={row.id}>
                      {m.show && (
                        <td className="td-info td-kind" rowSpan={m.span}>
                          {row.kind_name}
                        </td>
                      )}
                      <td className="td-info td-vehicle">{row.vehicle_code}</td>
                      <td className="td-info td-part">{row.part_code}</td>
                      <td className="td-info td-color">{row.color_code}</td>
                      <td className="td-spec">{Number(row.thickness || 0) || ''}</td>
                      <td className="td-spec">{Number(row.width || 0) || ''}</td>
                      {warehouses.map((w) => (
                        <td key={w.id} className="td-supplier">
                          {Number(row.supplier_qty?.[w.id] || 0).toLocaleString()}
                        </td>
                      ))}
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

export default RawInventoryOverview;
