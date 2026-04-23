/**
 * 코오롱 주문 계획 관리 (TPO)
 * - 엑셀 업로드 + 월별 조회
 * - 일자별 요청 수량 셀 편집 (모달) + 메모
 * - 원본과 다른 셀은 붉은색 강조
 * - 월별 변경 이력 팝업
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
  const [editCell, setEditCell] = useState(null); // { row, date, cell }
  const [historyOpen, setHistoryOpen] = useState(false);
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
      if (!month && d.months?.length > 0) setSelectedMonth(d.months[0]);
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
    setLoading(true); setError(''); setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', userName);
      const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || '업로드 실패'); return; }
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

  const openEdit = (row, date) => {
    const cell = row.daily?.[date] || null;
    setEditCell({ row, date, cell });
  };
  const closeEdit = () => setEditCell(null);

  const saveEdit = async ({ qty, memo }) => {
    if (!editCell) return;
    try {
      const res = await fetch(`${API}/daily`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headerId: editCell.row.id,
          planDate: editCell.date,
          requestQty: qty === '' ? null : qty,
          memo: memo || null,
          updatedBy: userName,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '저장 실패'); return; }
      setMessage(`${editCell.date} 수정 완료`);
      await fetchList(selectedMonth);
      closeEdit();
    } catch (err) {
      setError('저장 오류: ' + err.message);
    }
  };

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexShrink: 0 }}>
        <h1 className={styles.title} style={{ margin: 0 }}>코오롱 주문 계획 관리</h1>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>※ <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>26년3월 TPO 납품요청자료.xlsx</code> 참고</span>
      </div>

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
            <button type="button" onClick={handleDelete} className={styles.btnPrimary}
              style={{ background: '#dc2626' }}>
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
        {selectedMonth && (
          <div className="tpo-toolbar-right">
            <button type="button" onClick={() => setHistoryOpen(true)} className={styles.btnPrimary}>
              변경 이력
            </button>
          </div>
        )}
      </div>

      {error && <div className={styles.error} style={{ flexShrink: 0 }}>{error}</div>}
      {message && <div className="tpo-message" style={{ flexShrink: 0 }}>{message}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', flexShrink: 0 }}>
        <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
          {selectedMonth ? `${selectedMonth} — 총 ${list.length}건` : '업로드된 데이터가 없습니다.'}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.72rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#475569' }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 2 }} />
            엑셀 원본과 다른 수정값
          </span>
          <span style={{ color: '#94a3b8' }}>· 수량 셀 클릭 시 편집 가능</span>
        </div>
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
              ) : list.map(row => {
                // 실시간 합계: daily 셀들의 현재 수량 합 (수정된 값 반영)
                const liveTotal = Object.values(row.daily || {}).reduce((acc, c) => acc + (c?.qty != null ? Number(c.qty) : 0), 0);
                const origTotal = row.total_qty == null ? null : Number(row.total_qty);
                const totalChanged = origTotal == null ? liveTotal !== 0 : liveTotal !== origTotal;
                return (
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
                  {dates.map(dt => {
                    const cell = row.daily?.[dt];
                    const modified = cell?.modified;
                    const qtyVal = cell?.qty;
                    return (
                      <td key={dt}
                        onClick={() => openEdit(row, dt)}
                        className="td-daily"
                        title={cell?.memo ? `메모: ${cell.memo}` : (modified ? `원본: ${cell?.original ?? '(없음)'}` : '수량 편집')}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: modified ? '#fee2e2' : undefined,
                          color: modified ? '#991b1b' : undefined,
                          fontWeight: modified ? 600 : undefined,
                          position: 'relative',
                        }}>
                        {fmt(qtyVal)}
                        {cell?.memo && <span style={{ position: 'absolute', top: 1, right: 2, fontSize: '0.55rem', color: '#dc2626' }}>✎</span>}
                      </td>
                    );
                  })}
                  <td className="td-num"
                    title={totalChanged ? `엑셀 원본 합계: ${origTotal != null ? origTotal.toLocaleString() : '-'}` : undefined}
                    style={{
                      backgroundColor: totalChanged ? '#fee2e2' : undefined,
                      color: totalChanged ? '#991b1b' : undefined,
                      fontWeight: totalChanged ? 700 : undefined,
                    }}>
                    {fmt(liveTotal)}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {editCell && (
        <EditModal cell={editCell} onClose={closeEdit} onSave={saveEdit} />
      )}
      {historyOpen && (
        <HistoryModal planMonth={selectedMonth} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}

function EditModal({ cell, onClose, onSave }) {
  const { row, date, cell: data } = cell;
  const [qty, setQty] = useState(data?.qty != null ? String(data.qty) : '');
  const [memo, setMemo] = useState(data?.memo || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ qty: qty === '' ? null : Number(qty), memo });
    setSaving(false);
  };

  const prettyDate = (() => {
    const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return date;
    const weekday = ['일','월','화','수','목','금','토'][new Date(date).getDay()];
    return `${m[1]}. ${Number(m[2])}. ${Number(m[3])}. (${weekday})`;
  })();

  const Field = ({ label, value, color = '#0f172a' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '0.95rem', fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
        {value || <span style={{ color: '#cbd5e1', fontWeight: 400 }}>—</span>}
      </span>
    </div>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, width: 560, maxWidth: '94vw', padding: 0, boxShadow: '0 24px 60px -10px rgba(15,23,42,0.55)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#cbd5e1', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.15rem' }}>요청 수량 편집</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{prettyDate}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', borderRadius: 6, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="닫기">✕</button>
        </div>

        {/* Meta grid */}
        <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Field label="차종" value={row.vehicle} color="#1e40af" />
          <Field label="업체" value={row.supplier} color="#166534" />
          <Field label="품번" value={row.product_num} color="#7c2d12" />
          <Field label="자재코드" value={row.material_code} color="#4c1d95" />
        </div>

        {/* Original / last modified */}
        {data && (
          <div style={{ padding: '0.7rem 1.25rem', fontSize: '0.78rem', color: '#475569', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ color: '#64748b' }}>엑셀 원본:</strong>{' '}
              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                {data.original != null ? Number(data.original).toLocaleString() : '(엑셀에 없음)'}
              </span>
            </span>
            {data.updated_at && (
              <span>
                <strong style={{ color: '#64748b' }}>마지막 수정:</strong>{' '}
                {data.updated_at}{data.updated_by ? ` · ${data.updated_by}` : ''}
              </span>
            )}
          </div>
        )}

        {/* Edit form */}
        <div style={{ padding: '1.1rem 1.25rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>요청 수량</label>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} min="0" autoFocus
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '1rem', fontWeight: 600, boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>메모 <span style={{ fontWeight: 400, color: '#94a3b8' }}>(선택)</span></label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={500}
              placeholder="변경 사유나 참고 내용을 입력하세요"
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.88rem', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.15rem' }}>{memo.length}/500</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} disabled={saving}
              style={{ padding: '0.5rem 1rem', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 500 }}>취소</button>
            <button type="button" onClick={handleSave} disabled={saving}
              style={{ padding: '0.5rem 1.2rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ planMonth, onClose }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/history?planMonth=${encodeURIComponent(planMonth)}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || '조회 실패');
        setList(d.list || []);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [planMonth]);

  const fmtQty = (v) => v == null ? '-' : Number(v).toLocaleString();

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div
        style={{ background: '#fff', borderRadius: 8, width: 1100, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: '1.25rem 1.5rem', boxShadow: '0 20px 50px -10px rgba(15,23,42,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>{planMonth} 변경 이력 ({list.length}건)</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
        {loading && <div style={{ padding: '1rem', color: '#64748b' }}>불러오는 중...</div>}
        {err && <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: 4 }}>{err}</div>}
        {!loading && !err && list.length === 0 && (
          <div style={{ padding: '1rem', color: '#94a3b8', textAlign: 'center' }}>변경 이력이 없습니다.</div>
        )}
        {!loading && list.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>변경 시각</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>변경자</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>일자</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>차종</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>품번</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>자재코드</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>이전 수량</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>변경 수량</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>메모</th>
                <th style={{ padding: '0.4rem', textAlign: 'center' }}>구분</th>
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.35rem 0.4rem', color: '#475569' }}>{h.changed_at}</td>
                  <td style={{ padding: '0.35rem 0.4rem' }}>{h.changed_by || '-'}</td>
                  <td style={{ padding: '0.35rem 0.4rem' }}>{h.plan_date}</td>
                  <td style={{ padding: '0.35rem 0.4rem' }}>{h.vehicle || '-'}</td>
                  <td style={{ padding: '0.35rem 0.4rem' }}>{h.product_num || '-'}</td>
                  <td style={{ padding: '0.35rem 0.4rem' }}>{h.material_code || '-'}</td>
                  <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', color: '#64748b' }}>{fmtQty(h.prev_qty)}</td>
                  <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', fontWeight: 600, color: '#991b1b' }}>{fmtQty(h.new_qty)}</td>
                  <td style={{ padding: '0.35rem 0.4rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.new_memo || ''}>
                    {h.new_memo || '-'}
                  </td>
                  <td style={{ padding: '0.35rem 0.4rem', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: '0.68rem',
                      background: h.action === 'create' ? '#dcfce7' : '#fef3c7',
                      color: h.action === 'create' ? '#166534' : '#92400e',
                    }}>
                      {h.action === 'create' ? '추가' : '수정'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ProductionPlan3M;
