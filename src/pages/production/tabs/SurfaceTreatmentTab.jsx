/**
 * 표면처리 생산 실적 탭
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from '../../material/MaterialInfo.module.css';
import SelectDropdown from '../../../components/SelectDropdown';
import { useConfigCodes } from './useConfigCodes';
import useGrabScroll from '../../../hooks/useGrabScroll';

const API = '/api/production-surface';
const EMPTY_ROW = {
  prod_date: '',
  supplier: '',
  div: '',
  vehicle: '',
  color: '',
  thickness: '',
  width: '',
  top_lot: '',
  cover_lot: '',
  in_qty: '',
  out_qty: '',
  defect_qty: '',
  yield_rate: '',
  memo: '',
  status: '',
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SurfaceTreatmentTab({ userName }) {
  const grab = useGrabScroll();
  const [startDate, setStartDate] = useState(monthAgoISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [list, setList] = useState([]);
  const [mismatchCount, setMismatchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newRow, setNewRow] = useState({ ...EMPTY_ROW, prod_date: todayISO() });
  const [uploadResult, setUploadResult] = useState(null);
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const fileInputRef = useRef(null);
  const { vehicleCodes, colorCodes } = useConfigCodes();

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (startDate) q.set('startDate', startDate);
      if (endDate) q.set('endDate', endDate);
      const res = await fetch(`${API}?${q}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setList(d.list || []);
      setMismatchCount(d.mismatchCount || 0);
    } catch (err) {
      setError('조회 중 오류: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleAdd = async () => {
    if (!newRow.prod_date) { setError('생산일자를 입력하세요.'); return; }
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newRow, created_by: userName }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '저장 실패'); return; }
      setNewRow({ ...EMPTY_ROW, prod_date: newRow.prod_date });
      setMessage('1건 추가되었습니다.');
      fetchList();
    } catch (err) {
      setError('저장 오류: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '삭제 실패'); return; }
      fetchList();
    } catch (err) {
      setError('삭제 오류: ' + err.message);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setMessage('');
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', userName);
      formData.append('replace', 'true');
      const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '업로드 실패'); return; }
      setUploadResult(d);
      setMessage(`업로드 완료: ${d.inserted}건 저장 / 스킵 ${d.skipped}건 / 미매칭 차종 ${d.mismatch?.vehicle || 0}건, 칼라 ${d.mismatch?.color || 0}건`);
      fetchList();
    } catch (err) {
      setError('업로드 오류: ' + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = onlyMismatch ? list.filter((r) => !r.vehicleMatched || !r.colorMatched) : list;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* 검색/필터 */}
      <div className={styles.searchForm}>
        <label className={styles.searchLabel}>
          <span>시작일</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className={styles.searchLabel}>
          <span>종료일</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="button" onClick={fetchList} disabled={loading}
          style={{ padding: '0.45rem 1rem', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          조회
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={onlyMismatch} onChange={(e) => setOnlyMismatch(e.target.checked)} />
          마스터 미매칭만
        </label>
        <div style={{ flex: 1 }} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          fontSize: '0.75rem', color: '#78350f',
          padding: '0.3rem 0.6rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: '6px',
        }}>
          <span aria-hidden>⚠</span>
          업로드 시 전체 데이터가 삭제되고 새로 적재됩니다.
        </span>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}
          style={{ padding: '0.45rem 1rem', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          엑셀 업로드
        </button>
      </div>

      {/* 요약 배지 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <Badge label="조회 결과" value={`${list.length}건`} color="#2563eb" />
        <Badge
          label="마스터 미매칭"
          value={`${mismatchCount}건`}
          color={mismatchCount > 0 ? '#dc2626' : '#16a34a'}
          onClick={() => mismatchCount > 0 && setOnlyMismatch(true)}
          clickable={mismatchCount > 0}
        />
      </div>

      {error && <div style={{ padding: '0.5rem 0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: '0.5rem' }}>{error}</div>}
      {message && <div style={{ padding: '0.5rem 0.75rem', background: '#dbeafe', color: '#1e40af', borderRadius: '4px', marginBottom: '0.5rem' }}>{message}</div>}
      {uploadResult?.mismatch && (uploadResult.mismatch.vehicleList?.length > 0 || uploadResult.mismatch.colorList?.length > 0) && (
        <div style={{ padding: '0.5rem 0.75rem', background: '#fef3c7', color: '#78350f', borderRadius: '4px', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
          <strong>업로드 미매칭 목록</strong>
          {uploadResult.mismatch.vehicleList?.length > 0 && (
            <div>차종: {uploadResult.mismatch.vehicleList.join(', ')}</div>
          )}
          {uploadResult.mismatch.colorList?.length > 0 && (
            <div>칼라: {uploadResult.mismatch.colorList.join(', ')}</div>
          )}
        </div>
      )}

      {/* 데이터 테이블 */}
      <div ref={grab.ref} {...grab.props} style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'grab', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.82rem', minWidth: 1400 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <Th>생산일자</Th>
              <Th>업체</Th>
              <Th>구분</Th>
              <Th>차종</Th>
              <Th>칼라</Th>
              <Th align="right">두께</Th>
              <Th align="right">폭</Th>
              <Th>상지LOT</Th>
              <Th>표지LOT</Th>
              <Th align="right">입고수량</Th>
              <Th align="right">생산수량</Th>
              <Th align="right">불량수량</Th>
              <Th align="right">수율</Th>
              <Th>비고</Th>
              <Th>상태</Th>
              <Th>작업</Th>
            </tr>
          </thead>
          <tbody>
            {/* 신규 입력 행 */}
            <tr style={{ backgroundColor: '#f0fdf4', borderBottom: '1px solid #e2e8f0' }}>
              <Td><input type="date" value={newRow.prod_date} onChange={(e) => setNewRow({ ...newRow, prod_date: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.supplier} onChange={(e) => setNewRow({ ...newRow, supplier: e.target.value })} style={inputStyle} placeholder="업체" /></Td>
              <Td><input value={newRow.div} onChange={(e) => setNewRow({ ...newRow, div: e.target.value })} style={inputStyle} placeholder="구분" /></Td>
              <Td>
                <SelectDropdown
                  options={vehicleCodes}
                  value={newRow.vehicle}
                  onChange={(v) => setNewRow({ ...newRow, vehicle: v })}
                  placeholder="차종"
                  searchable
                  dropdownMinWidth={180}
                />
              </Td>
              <Td>
                <SelectDropdown
                  options={colorCodes.map((c) => ({ value: c.value, label: c.name ? `${c.name} (${c.value})` : c.label }))}
                  value={newRow.color}
                  onChange={(v) => setNewRow({ ...newRow, color: v })}
                  placeholder="칼라"
                  searchable
                  dropdownMinWidth={180}
                />
              </Td>
              <Td><input type="number" min="0" step="0.01" value={newRow.thickness} onChange={(e) => setNewRow({ ...newRow, thickness: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} /></Td>
              <Td><input type="number" min="0" value={newRow.width} onChange={(e) => setNewRow({ ...newRow, width: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} /></Td>
              <Td><input value={newRow.top_lot} onChange={(e) => setNewRow({ ...newRow, top_lot: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.cover_lot} onChange={(e) => setNewRow({ ...newRow, cover_lot: e.target.value })} style={inputStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.in_qty} onChange={(e) => setNewRow({ ...newRow, in_qty: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} /></Td>
              <Td><input type="number" min="0" value={newRow.out_qty} onChange={(e) => setNewRow({ ...newRow, out_qty: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} /></Td>
              <Td><input type="number" value={newRow.defect_qty} onChange={(e) => setNewRow({ ...newRow, defect_qty: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} /></Td>
              <Td><input type="number" min="0" step="0.001" value={newRow.yield_rate} onChange={(e) => setNewRow({ ...newRow, yield_rate: e.target.value })} style={{ ...inputStyle, textAlign: 'right' }} /></Td>
              <Td><input value={newRow.memo} onChange={(e) => setNewRow({ ...newRow, memo: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.status} onChange={(e) => setNewRow({ ...newRow, status: e.target.value })} style={inputStyle} /></Td>
              <Td>
                <button type="button" onClick={handleAdd}
                  style={{ padding: '0.25rem 0.6rem', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem' }}>
                  추가
                </button>
              </Td>
            </tr>

            {/* 조회된 데이터 */}
            {filtered.map((row) => {
              const hasMismatch = !row.vehicleMatched || !row.colorMatched;
              return (
                <tr key={row.id}
                  style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: hasMismatch ? '#fff7ed' : '#fff' }}>
                  <Td>{row.prod_date}</Td>
                  <Td>{row.supplier || '-'}</Td>
                  <Td>{row.div || '-'}</Td>
                  <Td>
                    {row.vehicle ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        color: row.vehicleMatched ? '#1e293b' : '#c2410c',
                        fontWeight: row.vehicleMatched ? 400 : 600,
                      }}>
                        {row.vehicle}
                        {!row.vehicleMatched && <span title="마스터에 없는 차종" style={{
                          fontSize: '0.65rem', padding: '0.05rem 0.3rem',
                          backgroundColor: '#fed7aa', color: '#9a3412', borderRadius: '3px',
                        }}>미등록</span>}
                      </span>
                    ) : '-'}
                  </Td>
                  <Td>
                    {row.color ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        color: row.colorMatched ? '#1e293b' : '#c2410c',
                        fontWeight: row.colorMatched ? 400 : 600,
                      }}>
                        {row.color}
                        {!row.colorMatched && <span title="마스터에 없는 칼라" style={{
                          fontSize: '0.65rem', padding: '0.05rem 0.3rem',
                          backgroundColor: '#fed7aa', color: '#9a3412', borderRadius: '3px',
                        }}>미등록</span>}
                      </span>
                    ) : '-'}
                  </Td>
                  <Td align="right">{row.thickness ?? '-'}</Td>
                  <Td align="right">{row.width ?? '-'}</Td>
                  <Td>{row.top_lot || '-'}</Td>
                  <Td>{row.cover_lot || '-'}</Td>
                  <Td align="right">{row.in_qty?.toLocaleString() ?? '-'}</Td>
                  <Td align="right">{row.out_qty?.toLocaleString() ?? '-'}</Td>
                  <Td align="right">{row.defect_qty?.toLocaleString() ?? '-'}</Td>
                  <Td align="right">{row.yield_rate != null ? (Number(row.yield_rate) * 100).toFixed(1) + '%' : '-'}</Td>
                  <Td>{row.memo || '-'}</Td>
                  <Td>{row.status || '-'}</Td>
                  <Td>
                    <button type="button" onClick={() => handleDelete(row.id)}
                      style={{ padding: '0.2rem 0.5rem', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.72rem' }}>
                      삭제
                    </button>
                  </Td>
                </tr>
              );
            })}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={16} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  {onlyMismatch ? '미매칭 데이터가 없습니다.' : '데이터가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '0.55rem 0.5rem', textAlign: align, fontWeight: 600,
      color: '#475569', fontSize: '0.78rem', whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  );
}
function Td({ children, align = 'left' }) {
  return (
    <td style={{
      padding: '0.4rem 0.5rem', textAlign: align, color: '#1e293b',
      whiteSpace: 'nowrap', verticalAlign: 'middle',
    }}>
      {children}
    </td>
  );
}
function Badge({ label, value, color, onClick, clickable }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.35rem 0.7rem', borderRadius: '6px',
        border: `1px solid ${color}40`, backgroundColor: `${color}10`,
        color, fontSize: '0.8rem', fontWeight: 500,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <span style={{ opacity: 0.8 }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.3rem 0.4rem', fontSize: '0.78rem',
  border: '1px solid #cbd5e1', borderRadius: '3px', boxSizing: 'border-box',
};

export default SurfaceTreatmentTab;
