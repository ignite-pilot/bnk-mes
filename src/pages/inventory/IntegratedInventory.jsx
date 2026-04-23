/**
 * 통합 재고 관리 (일자별 스냅샷)
 * - 일자 선택 → 해당 일자 스냅샷 조회
 * - 업로드 시 날짜 지정 (기본: 오늘) → 해당 일자 데이터 교체
 */
import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/integrated-inventory';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 엑셀 원본 배경 색 매핑
const COLORS = {
  headerPeach: '#fde68a',      // 차종~규격 헤더
  headerCyan: '#a5f3fc',       // 경주상지, 경주표지, 하지 헤더
  headerYellow: '#fde047',     // 울산표지, 폼, 프라이머 헤더
  headerPurple: '#c4b5fd',     // 완제품 헤더
  bodyYellow: '#fffbeb',       // 울산표지, 폼, 프라이머 셀
  bodyCyan: '#ecfeff',         // 하지 셀
  bodyPurple: '#f5f3ff',       // 완제품 셀
  sumRow: '#e9d5ff',           // 합계 행
  accent: '#fb923c',           // 상단 "일일단위 업데이트" 태그
};

// 입력 필드와 같은 높이의 버튼 스타일 (padding을 input과 동일하게 맞춤)
const btnStyle = (bg, fg) => ({
  padding: '0.4rem 0.9rem',
  backgroundColor: bg,
  color: fg,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.8125rem',
  lineHeight: 1.2,
  height: '32px',
  boxSizing: 'border-box',
});

function fmtNum(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  if (n === 0) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtInt(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return Math.round(n).toLocaleString();
}

function IntegratedInventory() {
  const { user } = useAuth();
  const userName = user?.name || user?.loginId || '';
  const [list, setList] = useState([]);
  const [meta, setMeta] = useState(null);
  const [dateList, setDateList] = useState([]); // 스냅샷이 존재하는 일자
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState({ vehicle: '', part: '', color: '', productCode: '' });
  const [mismatchDetail, setMismatchDetail] = useState(null); // { loading, data, error }
  const fileInputRef = useRef(null);
  const theadRef = useRef(null);
  const [theadHeight, setTheadHeight] = useState(68);

  useLayoutEffect(() => {
    const el = theadRef.current; if (!el) return;
    const update = () => setTheadHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const openMismatch = async (id) => {
    setMismatchDetail({ loading: true });
    try {
      const res = await fetch(`${API}/mismatch/${id}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setMismatchDetail({ loading: false, data: d });
    } catch (err) {
      setMismatchDetail({ loading: false, error: err.message });
    }
  };
  const closeMismatch = () => setMismatchDetail(null);

  const fetchDates = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dates`);
      const d = await res.json();
      if (res.ok) setDateList(d.dates || []);
    } catch { /* noop */ }
  }, []);

  const fetchList = useCallback(async (date) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (date) q.set('date', date);
      const res = await fetch(`${API}?${q}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setList(d.list || []);
      setMeta(d.meta || null);
      if (d.snapshot_date && d.snapshot_date !== selectedDate) setSelectedDate(d.snapshot_date);
    } catch (err) {
      setError('조회 중 오류: ' + err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      await fetchDates();
      await fetchList();
    })();
  }, [fetchDates, fetchList]);

  const handleChangeDate = (date) => {
    setSelectedDate(date);
    fetchList(date);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedDate) {
      setError('일자를 선택하세요.');
      e.target.value = '';
      return;
    }
    const existing = dateList.find((d) => d.snapshot_date === selectedDate);
    if (existing && !window.confirm(`${selectedDate} 일자의 기존 데이터 ${existing.cnt}건이 교체됩니다. 계속하시겠습니까?`)) {
      e.target.value = '';
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('uploadedBy', userName);
      fd.append('snapshotDate', selectedDate);
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '업로드 실패'); return; }
      setMessage(`${d.snapshotDate} 일자 업로드 완료: ${d.inserted}건 저장`);
      await fetchDates();
      setSelectedDate(d.snapshotDate);
      await fetchList(d.snapshotDate);
    } catch (err) {
      setError('업로드 오류: ' + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteSnapshot = async () => {
    if (!selectedDate) return;
    if (!window.confirm(`${selectedDate} 일자 데이터를 삭제하시겠습니까?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}?date=${encodeURIComponent(selectedDate)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '삭제 실패'); return; }
      setMessage(`${selectedDate} 일자 데이터 삭제 완료`);
      await fetchDates();
      await fetchList();
    } catch (err) {
      setError('삭제 오류: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = (v) => String(v || '').toLowerCase();
    return list.filter((r) => {
      if (search.vehicle && !q(r.vehicle).includes(q(search.vehicle))) return false;
      if (search.part && !q(r.part).includes(q(search.part))) return false;
      if (search.color && !q(r.color).includes(q(search.color))) return false;
      if (search.productCode && !q(r.product_code).includes(q(search.productCode))) return false;
      return true;
    });
  }, [list, search]);

  const totals = useMemo(() => {
    const t = {
      gyeongju_top: 0, gyeongju_cover: 0, ulsan_cover: 0, bottom_qty: 0,
      foam_total: 0, foam_raw: 0, primer_qty: 0, finished_qty: 0,
    };
    for (const r of filtered) {
      for (const k of Object.keys(t)) t[k] += Number(r[k] || 0);
    }
    return t;
  }, [filtered]);

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>통합 재고 관리</h1>
        <span style={{
          display: 'inline-block', padding: '0.3rem 0.75rem',
          backgroundColor: COLORS.accent, color: '#fff',
          borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600,
        }}>
          일일단위 업데이트
        </span>
      </div>

      {/* 일자·업로드 + 검색 (단일 컨테이너, 2행 강제 분리) */}
      <div className={styles.searchForm} style={{ gap: '0.5rem 0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className={styles.searchLabel}>
          <span>일자</span>
          <input type="date" value={selectedDate} onChange={(e) => handleChangeDate(e.target.value)} className={styles.input} />
        </label>
        {selectedDate && dateList.find((d) => d.snapshot_date === selectedDate) && (
          <button type="button" onClick={handleDeleteSnapshot} disabled={loading} style={btnStyle('#fee2e2', '#991b1b')}>
            삭제
          </button>
        )}
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || !selectedDate} style={btnStyle('#10b981', '#fff')}>
          엑셀 업로드
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          marginLeft: '0.5rem',
          fontSize: '0.75rem', color: '#78350f',
          padding: '0.3rem 0.6rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: '6px',
        }}>
          <span aria-hidden>⚠</span>
          <span>엑셀 업로드 시 선택한 일자의 기존 데이터가 전체 교체됩니다.</span>
        </div>

        {/* 줄바꿈 강제 */}
        <div style={{ flexBasis: '100%', height: 0 }} />

        <label className={styles.searchLabel}>
          <span>차종</span>
          <input type="text" value={search.vehicle} onChange={(e) => setSearch((s) => ({ ...s, vehicle: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <label className={styles.searchLabel}>
          <span>부위</span>
          <input type="text" value={search.part} onChange={(e) => setSearch((s) => ({ ...s, part: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <label className={styles.searchLabel}>
          <span>칼라</span>
          <input type="text" value={search.color} onChange={(e) => setSearch((s) => ({ ...s, color: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <label className={styles.searchLabel}>
          <span>완제품 코드</span>
          <input type="text" value={search.productCode} onChange={(e) => setSearch((s) => ({ ...s, productCode: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <button type="button" onClick={() => setSearch({ vehicle: '', part: '', color: '', productCode: '' })} style={btnStyle('#e2e8f0', '#334155')}>
          초기화
        </button>
      </div>

      {/* 상태 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge label="총 항목" value={`${filtered.length}건`} color="#2563eb" />
        {filtered.some((r) => r.product_code && !r.is_registered) && (
          <Badge label="미등록" value={`${filtered.filter((r) => r.product_code && !r.is_registered).length}건`} color="#dc2626" />
        )}
        {selectedDate && (
          <Badge label="일자" value={selectedDate} color="#0ea5e9" />
        )}
        {meta && (
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            업로드 시각: {meta.uploaded_at}{meta.uploaded_by ? ` · ${meta.uploaded_by}` : ''}
          </span>
        )}
      </div>

      {error && <div style={{ padding: '0.5rem 0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: '0.5rem' }}>{error}</div>}
      {message && <div style={{ padding: '0.5rem 0.75rem', background: '#dbeafe', color: '#1e40af', borderRadius: '4px', marginBottom: '0.5rem' }}>{message}</div>}

      <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.82rem', minWidth: 1900 }}>
          <thead ref={theadRef} style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <Th rowSpan={2} align="center" bg={COLORS.headerPeach}>#</Th>
              <Th rowSpan={2} bg={COLORS.headerPeach}>차종</Th>
              <Th rowSpan={2} bg={COLORS.headerPeach}>부위</Th>
              <Th rowSpan={2} bg={COLORS.headerPeach}>칼라</Th>
              <Th rowSpan={2} bg={COLORS.headerPeach}>완제품 코드</Th>
              <Th rowSpan={2} bg={COLORS.headerPeach}>업체</Th>
              <Th colSpan={5} align="center" borderBottom bg={COLORS.headerPeach}>규격</Th>
              <Th colSpan={2} align="center" borderBottom bg={COLORS.headerCyan}>경주</Th>
              <Th rowSpan={2} align="right" bg={COLORS.headerYellow}>울산표지</Th>
              <Th rowSpan={2} align="right" bg={COLORS.headerCyan}>하지</Th>
              <Th colSpan={2} align="center" borderBottom bg={COLORS.headerYellow}>폼 (M)</Th>
              <Th rowSpan={2} align="right" bg={COLORS.headerYellow}>프라이머(M)</Th>
              <Th rowSpan={2} align="right" bg={COLORS.headerPurple}>완제품(EA)</Th>
            </tr>
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              <Th align="right" bg={COLORS.headerPeach}>두폭</Th>
              <Th align="right" bg={COLORS.headerPeach}>두께</Th>
              <Th align="right" bg={COLORS.headerPeach}>배율</Th>
              <Th align="right" bg={COLORS.headerPeach}>폭</Th>
              <Th align="right" bg={COLORS.headerPeach}>길이</Th>
              <Th align="right" bg={COLORS.headerCyan}>상지</Th>
              <Th align="right" bg={COLORS.headerCyan}>표지</Th>
              <Th align="right" bg={COLORS.headerYellow}>총수량</Th>
              <Th align="right" bg={COLORS.headerYellow}>미처리</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 && (() => {
              const sumSticky = {
                position: 'sticky', top: theadHeight, zIndex: 2,
                backgroundColor: COLORS.sumRow,
                backgroundClip: 'padding-box',
                borderTop: '1px solid #a78bfa',
                borderBottom: '2px solid #7c3aed',
                borderRight: '1px solid #c4b5fd',
              };
              return (
              <tr style={{ backgroundColor: COLORS.sumRow, borderBottom: '2px solid #e2e8f0', fontWeight: 700 }}>
                <Td colSpan={11} align="right" style={{ color: '#4c1d95', ...sumSticky }}>합계</Td>
                <Td align="right" style={sumSticky}>{fmtNum(totals.gyeongju_top)}</Td>
                <Td align="right" style={sumSticky}>{fmtNum(totals.gyeongju_cover)}</Td>
                <Td align="right" style={sumSticky}>{fmtNum(totals.ulsan_cover)}</Td>
                <Td align="right" style={sumSticky}>{fmtNum(totals.bottom_qty)}</Td>
                <Td align="right" style={sumSticky}>{fmtNum(totals.foam_total)}</Td>
                <Td align="right" style={sumSticky}>{fmtNum(totals.foam_raw)}</Td>
                <Td align="right" style={sumSticky}>{fmtNum(totals.primer_qty)}</Td>
                <Td align="right" style={sumSticky}>{fmtInt(totals.finished_qty)}</Td>
              </tr>
              );
            })()}
            {filtered.map((row, idx) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: !row.is_registered ? '#fff7f7' : undefined }}>
                <Td align="center" style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                    {idx + 1}
                    {!row.is_registered && (
                      <button type="button" onClick={() => openMismatch(row.id)}
                        title="클릭하여 불일치 상세 보기"
                        style={{
                          display: 'inline-block', padding: '1px 5px', borderRadius: '3px',
                          backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca',
                          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.02em',
                          cursor: 'pointer',
                        }}>
                        미등록
                      </button>
                    )}
                  </span>
                </Td>
                <Td>{row.vehicle || '-'}</Td>
                <Td>{row.part || '-'}</Td>
                <Td>{row.color || '-'}</Td>
                <Td>{row.product_code || '-'}</Td>
                <Td>{row.supplier || '-'}</Td>
                <Td align="right">{fmtNum(row.two_width)}</Td>
                <Td align="right">{fmtNum(row.thickness)}</Td>
                <Td align="right">{fmtNum(row.ratio)}</Td>
                <Td align="right">{fmtNum(row.width)}</Td>
                <Td align="right">{fmtNum(row.length)}</Td>
                <Td align="right">{fmtNum(row.gyeongju_top)}</Td>
                <Td align="right">{fmtNum(row.gyeongju_cover)}</Td>
                <Td align="right" bg={COLORS.bodyYellow}>{fmtNum(row.ulsan_cover)}</Td>
                <Td align="right" bg={COLORS.bodyCyan}>{fmtNum(row.bottom_qty)}</Td>
                <Td align="right" bg={COLORS.bodyYellow}>{fmtNum(row.foam_total)}</Td>
                <Td align="right" bg={COLORS.bodyYellow} style={{ color: Number(row.foam_raw) > 0 ? '#dc2626' : '#1e293b' }}>
                  {fmtNum(row.foam_raw)}
                </Td>
                <Td align="right" bg={COLORS.bodyYellow}>{fmtNum(row.primer_qty)}</Td>
                <Td align="right" bg={COLORS.bodyPurple} style={{ fontWeight: 600 }}>{fmtInt(row.finished_qty)}</Td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={20} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  {list.length === 0 ? '데이터가 없습니다. 업로드 날짜를 선택하고 엑셀을 업로드해 주세요.' : '검색 결과가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mismatchDetail && <MismatchModal detail={mismatchDetail} onClose={closeMismatch} />}
    </div>
  );
}

function MismatchModal({ detail, onClose }) {
  const { loading, error, data } = detail || {};
  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div
        style={{ background: '#fff', borderRadius: 8, maxWidth: 1100, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '1.25rem 1.5rem', boxShadow: '0 20px 50px -10px rgba(15,23,42,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#1e293b' }}>마스터 불일치 상세</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
        {loading && <div style={{ padding: '1rem', color: '#64748b' }}>불러오는 중...</div>}
        {error && <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: 4 }}>{error}</div>}
        {data && <MismatchBody data={data} />}
      </div>
    </div>
  );
}

function MismatchBody({ data }) {
  const { row, candidates, fullyMatched } = data;
  const FIELD_LABEL = {
    vehicle: '차종', part: '부위', color: '칼라',
    two_width: '두폭', thickness: '두께', ratio: '배율', width: '폭', length: '길이',
  };
  const fmt = (v) => v == null || v === '' ? <span style={{ color: '#94a3b8' }}>—</span> : String(v);
  return (
    <div>
      <div style={{ padding: '0.6rem 0.75rem', borderRadius: 6, background: '#f1f5f9', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
        <div style={{ color: '#64748b', fontSize: '0.72rem', marginBottom: '0.25rem' }}>통합재고 원본</div>
        <div>
          <strong>{row.vehicle}</strong> / <strong>{row.part}</strong> / <strong>{row.color}</strong>
          {row.product_code && <span style={{ color: '#64748b' }}> · 완제품코드: {row.product_code}</span>}
        </div>
        <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.3rem' }}>
          두폭 {fmt(row.two_width)} · 두께 {fmt(row.thickness)} · 배율 {fmt(row.ratio)} · 폭 {fmt(row.width)} · 길이 {fmt(row.length)}
        </div>
      </div>

      {candidates.length === 0 && (
        <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: 4, color: '#78350f', fontSize: '0.85rem' }}>
          같은 차종({row.vehicle})의 마스터 데이터가 없습니다. 차종 자체가 마스터에 등록되지 않았거나 다른 표기로 저장되어 있을 수 있습니다.
        </div>
      )}

      {candidates.length > 0 && (
        <>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.5rem' }}>
            차종이 일치하는 마스터 후보 {candidates.length}건 (일치 점수 내림차순, 상위 10건)
            {fullyMatched && <span style={{ marginLeft: '0.5rem', color: '#059669', fontWeight: 600 }}>※ 완전 일치 후보 존재</span>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>#</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>완제품 코드</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>차종</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>부위</th>
                <th style={{ padding: '0.4rem', textAlign: 'left' }}>칼라</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>두폭</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>두께</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>배율</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>폭</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>길이</th>
                <th style={{ padding: '0.4rem', textAlign: 'center' }}>일치</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, idx) => {
                const m = c.master;
                const cell = (ok, v) => (
                  <td style={{ padding: '0.35rem 0.4rem', backgroundColor: ok ? '#ecfdf5' : '#fef2f2', color: ok ? '#065f46' : '#991b1b' }}>{fmt(v)}</td>
                );
                const cellRight = (ok, v) => (
                  <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', backgroundColor: ok ? '#ecfdf5' : '#fef2f2', color: ok ? '#065f46' : '#991b1b' }}>{fmt(v)}</td>
                );
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.35rem 0.4rem' }}>{idx + 1}</td>
                    <td style={{ padding: '0.35rem 0.4rem' }}>{fmt(m.code)}</td>
                    {cell(c.checks.vehicle, `${m.vehicle_code || ''}${m.vehicle_name && m.vehicle_name !== m.vehicle_code ? ` (${m.vehicle_name})` : ''}`)}
                    {cell(c.checks.part, `${m.part_code || ''}${m.part_name && m.part_name !== m.part_code ? ` (${m.part_name})` : ''}`)}
                    {cell(c.checks.color, `${m.color_code || ''}${m.color_name && m.color_name !== m.color_code ? ` (${m.color_name})` : ''}`)}
                    {cellRight(c.checks.two_width, m.two_width)}
                    {cellRight(c.checks.thickness, m.thickness)}
                    {cellRight(c.checks.ratio, m.ratio)}
                    {cellRight(c.checks.width, m.width)}
                    {cellRight(c.checks.length, m.length)}
                    <td style={{ padding: '0.35rem 0.4rem', textAlign: 'center', fontWeight: 700, color: c.score === 8 ? '#059669' : (c.score >= 5 ? '#ca8a04' : '#dc2626') }}>
                      {c.score}/8
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#64748b' }}>
            초록색 = 일치 / 빨간색 = 불일치 · 각 후보의 일치 필드 수를 점수로 표시 (8 만점)
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children, align = 'left', colSpan, rowSpan, borderBottom, bg }) {
  return (
    <th colSpan={colSpan} rowSpan={rowSpan}
      style={{
        padding: '0.5rem 0.5rem', textAlign: align, fontWeight: 600,
        color: '#1e293b', fontSize: '0.78rem', whiteSpace: 'nowrap',
        borderRight: '1px solid #94a3b8',
        borderBottom: borderBottom ? '2px solid #475569' : '1px solid #94a3b8',
        backgroundColor: bg,
        backgroundClip: 'padding-box',
      }}>
      {children}
    </th>
  );
}
function Td({ children, align = 'left', colSpan, style, bg }) {
  return (
    <td colSpan={colSpan}
      style={{
        padding: '0.4rem 0.5rem', textAlign: align, color: '#1e293b',
        whiteSpace: 'nowrap', verticalAlign: 'middle',
        borderRight: '1px solid #e2e8f0',
        borderBottom: '1px solid #f1f5f9',
        backgroundColor: bg || '#ffffff',
        ...style,
      }}>
      {children}
    </td>
  );
}
function Badge({ label, value, color }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      padding: '0.35rem 0.7rem', borderRadius: '6px',
      border: `1px solid ${color}40`, backgroundColor: `${color}10`,
      color, fontSize: '0.8rem', fontWeight: 500,
    }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default IntegratedInventory;
