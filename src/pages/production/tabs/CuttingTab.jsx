/**
 * 재단 생산 실적 탭
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from '../../material/MaterialInfo.module.css';
import SelectDropdown from '../../../components/SelectDropdown';
import { useConfigCodes } from './useConfigCodes';

const API = '/api/production-cutting';
const EMPTY_ROW = {
  prod_date: '',
  machine_no: '',
  cut_lot: '',
  bnk_lot: '',
  sheet_lot: '',
  cover_lot: '',
  foam_lot: '',
  foam_back_lot: '',
  vehicle: '',
  part: '',
  color: '',
  emboss: '',
  spec: '',
  width_check: '',
  length_check: '',
  single_double: '',
  label_qty: '',
  real_qty: '',
  in_qty: '',
  input_remain: '',
  cut_qty: '',
  remain_qty: '',
  cal_pigment: '',
  cal_line: '',
  cal_other: '',
  foam_defect: '',
  top_knife_mark: '',
  top_flow_mark: '',
  emb_width_minor: '',
  emb_roll_mark: '',
  emb_oil_mark: '',
  emb_contamination: '',
  emb_wrinkle: '',
  emb_chew: '',
  emb_wind: '',
  emb_connect: '',
  cut_foreign: '',
  cut_length_defect: '',
  defect_subtotal: '',
  missing_qty: '',
  final_defect_m: '',
  memo: '',
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

function CuttingTab({ userName }) {
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
  const { vehicleCodes, partCodes, colorCodes } = useConfigCodes();

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
    if (!newRow.prod_date) { setError('재단일자를 입력하세요.'); return; }
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

  const setNR = (patch) => setNewRow((prev) => ({ ...prev, ...patch }));
  const filtered = onlyMismatch ? list.filter((r) => !r.vehicleMatched || !r.colorMatched) : list;
  const COL_COUNT = 43;

  return (
    <div>
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
          {uploadResult.mismatch.vehicleList?.length > 0 && <div>차종: {uploadResult.mismatch.vehicleList.join(', ')}</div>}
          {uploadResult.mismatch.colorList?.length > 0 && <div>칼라: {uploadResult.mismatch.colorList.join(', ')}</div>}
        </div>
      )}

      {/* 데이터 테이블 */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 3600 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <Th>재단일자</Th>
              <Th>설비</Th>
              <Th>재단LOT</Th>
              <Th>BnK LOT</Th>
              <Th>시트LOT</Th>
              <Th>표지LOT</Th>
              <Th>폼LOT</Th>
              <Th>폼이면LOT</Th>
              <Th>차종</Th>
              <Th>부위</Th>
              <Th>색상</Th>
              <Th>엠보</Th>
              <Th>양산규격</Th>
              <Th align="right">폭확인</Th>
              <Th align="right">길이확인</Th>
              <Th align="right">단/두폭</Th>
              <Th align="right">라벨(ea)</Th>
              <Th align="right">실갯수(ea)</Th>
              <Th align="right">입고(m)</Th>
              <Th align="right">투입잔량</Th>
              <Th align="right">재단(ea)</Th>
              <Th align="right">남은잔량</Th>
              <Th align="right">CAL안료</Th>
              <Th align="right">CAL경선</Th>
              <Th align="right">CAL기타</Th>
              <Th align="right">폼불량</Th>
              <Th align="right">칼줄</Th>
              <Th align="right">흐름자국</Th>
              <Th align="right">폭(미미)</Th>
              <Th align="right">롤자국</Th>
              <Th align="right">오일자국</Th>
              <Th align="right">오염</Th>
              <Th align="right">구김</Th>
              <Th align="right">씹힘</Th>
              <Th align="right">바람</Th>
              <Th align="right">연결</Th>
              <Th align="right">이물</Th>
              <Th align="right">길이불량</Th>
              <Th align="right">불량소계</Th>
              <Th align="right">누락</Th>
              <Th align="right">최종불량(m)</Th>
              <Th>비고</Th>
              <Th>작업</Th>
            </tr>
          </thead>
          <tbody>
            {/* 신규 입력 행 */}
            <tr style={{ backgroundColor: '#f0fdf4', borderBottom: '1px solid #e2e8f0' }}>
              <Td><input type="date" value={newRow.prod_date} onChange={(e) => setNR({ prod_date: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.machine_no} onChange={(e) => setNR({ machine_no: e.target.value })} style={inputStyle} placeholder="설비" /></Td>
              <Td><input value={newRow.cut_lot} onChange={(e) => setNR({ cut_lot: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.bnk_lot} onChange={(e) => setNR({ bnk_lot: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.sheet_lot} onChange={(e) => setNR({ sheet_lot: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.cover_lot} onChange={(e) => setNR({ cover_lot: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.foam_lot} onChange={(e) => setNR({ foam_lot: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.foam_back_lot} onChange={(e) => setNR({ foam_back_lot: e.target.value })} style={inputStyle} /></Td>
              <Td>
                <SelectDropdown
                  options={vehicleCodes}
                  value={newRow.vehicle}
                  onChange={(v) => setNR({ vehicle: v })}
                  placeholder="차종"
                  searchable
                  dropdownMinWidth={180}
                />
              </Td>
              <Td>
                <SelectDropdown
                  options={partCodes}
                  value={newRow.part}
                  onChange={(v) => setNR({ part: v })}
                  placeholder="부위"
                  searchable
                  dropdownMinWidth={210}
                />
              </Td>
              <Td>
                <SelectDropdown
                  options={colorCodes.map((c) => ({ value: c.value, label: c.name ? `${c.name} (${c.value})` : c.label }))}
                  value={newRow.color}
                  onChange={(v) => setNR({ color: v })}
                  placeholder="색상"
                  searchable
                  dropdownMinWidth={180}
                />
              </Td>
              <Td><input value={newRow.emboss} onChange={(e) => setNR({ emboss: e.target.value })} style={inputStyle} /></Td>
              <Td><input value={newRow.spec} onChange={(e) => setNR({ spec: e.target.value })} style={inputStyle} /></Td>
              <Td><input type="number" min="0" step="0.01" value={newRow.width_check} onChange={(e) => setNR({ width_check: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" step="0.01" value={newRow.length_check} onChange={(e) => setNR({ length_check: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.single_double} onChange={(e) => setNR({ single_double: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.label_qty} onChange={(e) => setNR({ label_qty: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.real_qty} onChange={(e) => setNR({ real_qty: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" step="0.01" value={newRow.in_qty} onChange={(e) => setNR({ in_qty: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" step="0.01" value={newRow.input_remain} onChange={(e) => setNR({ input_remain: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.cut_qty} onChange={(e) => setNR({ cut_qty: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" step="0.01" value={newRow.remain_qty} onChange={(e) => setNR({ remain_qty: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.cal_pigment} onChange={(e) => setNR({ cal_pigment: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.cal_line} onChange={(e) => setNR({ cal_line: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.cal_other} onChange={(e) => setNR({ cal_other: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.foam_defect} onChange={(e) => setNR({ foam_defect: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.top_knife_mark} onChange={(e) => setNR({ top_knife_mark: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.top_flow_mark} onChange={(e) => setNR({ top_flow_mark: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_width_minor} onChange={(e) => setNR({ emb_width_minor: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_roll_mark} onChange={(e) => setNR({ emb_roll_mark: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_oil_mark} onChange={(e) => setNR({ emb_oil_mark: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_contamination} onChange={(e) => setNR({ emb_contamination: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_wrinkle} onChange={(e) => setNR({ emb_wrinkle: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_chew} onChange={(e) => setNR({ emb_chew: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_wind} onChange={(e) => setNR({ emb_wind: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.emb_connect} onChange={(e) => setNR({ emb_connect: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.cut_foreign} onChange={(e) => setNR({ cut_foreign: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.cut_length_defect} onChange={(e) => setNR({ cut_length_defect: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" value={newRow.defect_subtotal} onChange={(e) => setNR({ defect_subtotal: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" step="0.001" value={newRow.missing_qty} onChange={(e) => setNR({ missing_qty: e.target.value })} style={numStyle} /></Td>
              <Td><input type="number" min="0" step="0.001" value={newRow.final_defect_m} onChange={(e) => setNR({ final_defect_m: e.target.value })} style={numStyle} /></Td>
              <Td><input value={newRow.memo} onChange={(e) => setNR({ memo: e.target.value })} style={inputStyle} /></Td>
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
                  <Td>{row.machine_no || '-'}</Td>
                  <Td>{row.cut_lot || '-'}</Td>
                  <Td>{row.bnk_lot || '-'}</Td>
                  <Td>{row.sheet_lot || '-'}</Td>
                  <Td>{row.cover_lot || '-'}</Td>
                  <Td>{row.foam_lot || '-'}</Td>
                  <Td>{row.foam_back_lot || '-'}</Td>
                  <Td>
                    {row.vehicle ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        color: row.vehicleMatched ? '#1e293b' : '#c2410c',
                        fontWeight: row.vehicleMatched ? 400 : 600,
                      }}>
                        {row.vehicle}
                        {!row.vehicleMatched && (
                          <span title="마스터에 없는 차종" style={{
                            fontSize: '0.65rem', padding: '0.05rem 0.3rem',
                            backgroundColor: '#fed7aa', color: '#9a3412', borderRadius: '3px',
                          }}>미등록</span>
                        )}
                      </span>
                    ) : '-'}
                  </Td>
                  <Td>{row.part || '-'}</Td>
                  <Td>
                    {row.color ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        color: row.colorMatched ? '#1e293b' : '#c2410c',
                        fontWeight: row.colorMatched ? 400 : 600,
                      }}>
                        {row.color}
                        {!row.colorMatched && (
                          <span title="마스터에 없는 색상" style={{
                            fontSize: '0.65rem', padding: '0.05rem 0.3rem',
                            backgroundColor: '#fed7aa', color: '#9a3412', borderRadius: '3px',
                          }}>미등록</span>
                        )}
                      </span>
                    ) : '-'}
                  </Td>
                  <Td>{row.emboss || '-'}</Td>
                  <Td>{row.spec || '-'}</Td>
                  <Td align="right">{fmtNum(row.width_check)}</Td>
                  <Td align="right">{fmtNum(row.length_check)}</Td>
                  <Td align="right">{row.single_double ?? '-'}</Td>
                  <Td align="right">{fmtInt(row.label_qty)}</Td>
                  <Td align="right">{fmtInt(row.real_qty)}</Td>
                  <Td align="right">{fmtNum(row.in_qty)}</Td>
                  <Td align="right">{fmtNum(row.input_remain)}</Td>
                  <Td align="right">{fmtInt(row.cut_qty)}</Td>
                  <Td align="right">{fmtNum(row.remain_qty)}</Td>
                  <Td align="right">{fmtInt(row.cal_pigment)}</Td>
                  <Td align="right">{fmtInt(row.cal_line)}</Td>
                  <Td align="right">{fmtInt(row.cal_other)}</Td>
                  <Td align="right">{fmtInt(row.foam_defect)}</Td>
                  <Td align="right">{fmtInt(row.top_knife_mark)}</Td>
                  <Td align="right">{fmtInt(row.top_flow_mark)}</Td>
                  <Td align="right">{fmtInt(row.emb_width_minor)}</Td>
                  <Td align="right">{fmtInt(row.emb_roll_mark)}</Td>
                  <Td align="right">{fmtInt(row.emb_oil_mark)}</Td>
                  <Td align="right">{fmtInt(row.emb_contamination)}</Td>
                  <Td align="right">{fmtInt(row.emb_wrinkle)}</Td>
                  <Td align="right">{fmtInt(row.emb_chew)}</Td>
                  <Td align="right">{fmtInt(row.emb_wind)}</Td>
                  <Td align="right">{fmtInt(row.emb_connect)}</Td>
                  <Td align="right">{fmtInt(row.cut_foreign)}</Td>
                  <Td align="right">{fmtInt(row.cut_length_defect)}</Td>
                  <Td align="right">{fmtInt(row.defect_subtotal)}</Td>
                  <Td align="right">{fmtNum(row.missing_qty)}</Td>
                  <Td align="right">{fmtNum(row.final_defect_m)}</Td>
                  <Td>{row.memo || '-'}</Td>
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
                <td colSpan={COL_COUNT} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
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

function fmtInt(v) {
  if (v == null) return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString();
}
function fmtNum(v) {
  if (v == null) return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
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
const numStyle = { ...inputStyle, textAlign: 'right' };

export default CuttingTab;
