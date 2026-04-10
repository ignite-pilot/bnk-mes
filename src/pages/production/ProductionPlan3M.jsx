/**
 * 3개월 주문 계획 관리 (TPO)
 * - 엑셀 업로드
 * - 월별 조회
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';
import './ProductionPlan3M.css';

const API = '/api/production-tpo';

function ProductionPlan3M() {
  const { user } = useAuth();
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [list, setList] = useState([]);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  const userName = user?.name || user?.loginId || '';

  const fetchList = useCallback(async (month) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (month) q.set('planMonth', month);
      const res = await fetch(`${API}?${q}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setMonths(d.months || []);
      setList(d.list || []);
      setDates(d.dates || []);
      // 초기 선택
      if (!month && d.months?.length > 0) {
        setSelectedMonth(d.months[0]);
      }
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { if (selectedMonth) fetchList(selectedMonth); }, [selectedMonth, fetchList]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', userName);
      const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || '업로드 실패');
        return;
      }
      setMessage(`업로드 완료: ${d.planMonth} / 제품 ${d.headers}건 / 일별 ${d.daily}건`);
      setSelectedMonth(d.planMonth);
      await fetchList(d.planMonth);
    } catch (err) {
      setError('업로드 중 오류: ' + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!selectedMonth) return;
    if (!window.confirm(`${selectedMonth} 데이터를 삭제하시겠습니까?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/${selectedMonth}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '삭제 실패'); return; }
      setMessage('삭제 완료');
      setSelectedMonth('');
      await fetchList();
    } catch { setError('삭제 중 오류'); }
    finally { setLoading(false); }
  };

  const fmt = (v) => v != null ? Number(v).toLocaleString() : '';

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <h1 className={styles.title} style={{ flexShrink: 0 }}>3개월 주문 계획 관리</h1>

      <div className="tpo-toolbar" style={{ flexShrink: 0 }}>
        <div className="tpo-toolbar-left">
          <div className="tpo-field">
            <label className="tpo-field-label">대상 월</label>
            <SelectDropdown
              options={[{ value: '', label: '전체' }, ...months.map(m => ({ value: m, label: m }))]}
              value={selectedMonth}
              onChange={setSelectedMonth}
              placeholder="선택"
              style={{ minWidth: 160 }}
            />
          </div>
          {selectedMonth && (
            <button type="button" className={styles.btnSecondary} onClick={handleDelete}>
              {selectedMonth} 삭제
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUpload}
            style={{ display: 'none' }}
            id="tpo-upload"
          />
          <label htmlFor="tpo-upload" className={styles.btnPrimary} style={{ cursor: 'pointer' }}>
            엑셀 업로드
          </label>
        </div>
      </div>

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}
      {message && <div className="tpo-message" style={{ flexShrink: 0 }}>{message}</div>}

      <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem', flexShrink: 0 }}>
        {selectedMonth ? `${selectedMonth} — 총 ${list.length}건` : '업로드된 데이터가 없습니다.'}
      </div>

      {loading ? (
        <p className={styles.loading}>처리 중...</p>
      ) : (
        <div className="tpo-table-wrap">
          <table className="tpo-table">
            <thead>
              <tr>
                <th rowSpan={2} className="th-fixed">차종</th>
                <th rowSpan={2} className="th-fixed">업체</th>
                <th rowSpan={2} className="th-fixed">품번</th>
                <th rowSpan={2} className="th-fixed">자재코드</th>
                <th rowSpan={2} className="th-summary">전월말재고</th>
                <th rowSpan={2} className="th-summary">월판매</th>
                <th rowSpan={2} className="th-summary">월생산입고</th>
                <th rowSpan={2} className="th-summary">입고누계</th>
                <th rowSpan={2} className="th-summary">현재고</th>
                <th colSpan={dates.length} className="th-daily">일자별 요청 수량</th>
                <th rowSpan={2} className="th-summary">합계</th>
              </tr>
              <tr>
                {dates.map(dt => <th key={dt} className="th-daily">{dt.slice(5).replace('-', '/')}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={10 + dates.length} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>데이터가 없습니다.</td></tr>
              ) : list.map(row => (
                <tr key={row.id}>
                  <td className="td-fixed">{row.vehicle}</td>
                  <td className="td-fixed">{row.supplier}</td>
                  <td className="td-fixed">{row.product_num}</td>
                  <td className="td-fixed">{row.material_code}</td>
                  <td className="td-num">{fmt(row.prev_stock)}</td>
                  <td className="td-num">{fmt(row.monthly_sales)}</td>
                  <td className="td-num">{fmt(row.monthly_production)}</td>
                  <td className="td-num">{fmt(row.stock_cumulative)}</td>
                  <td className="td-num">{fmt(row.current_stock)}</td>
                  {dates.map(dt => (
                    <td key={dt} className="td-daily">{fmt(row.daily?.[dt])}</td>
                  ))}
                  <td className="td-num">{fmt(row.total_qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ProductionPlan3M;
