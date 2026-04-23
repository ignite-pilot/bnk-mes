/**
 * 통합 재고 관리 (일자별 스냅샷)
 * - 일자 선택 → 해당 일자 스냅샷 조회
 * - 업로드 시 날짜 지정 (기본: 오늘) → 해당 일자 데이터 교체
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  const fileInputRef = useRef(null);

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
    <div className={styles.page}>
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

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 1900 }}>
          <thead>
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
            {filtered.length > 0 && (
              <tr style={{ backgroundColor: COLORS.sumRow, borderBottom: '2px solid #e2e8f0', fontWeight: 700 }}>
                <Td colSpan={11} align="right" style={{ color: '#4c1d95' }}>합계</Td>
                <Td align="right">{fmtNum(totals.gyeongju_top)}</Td>
                <Td align="right">{fmtNum(totals.gyeongju_cover)}</Td>
                <Td align="right">{fmtNum(totals.ulsan_cover)}</Td>
                <Td align="right">{fmtNum(totals.bottom_qty)}</Td>
                <Td align="right">{fmtNum(totals.foam_total)}</Td>
                <Td align="right">{fmtNum(totals.foam_raw)}</Td>
                <Td align="right">{fmtNum(totals.primer_qty)}</Td>
                <Td align="right">{fmtInt(totals.finished_qty)}</Td>
              </tr>
            )}
            {filtered.map((row, idx) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <Td align="center" style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</Td>
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
    </div>
  );
}

function Th({ children, align = 'left', colSpan, rowSpan, borderBottom, bg }) {
  return (
    <th colSpan={colSpan} rowSpan={rowSpan}
      style={{
        padding: '0.5rem 0.5rem', textAlign: align, fontWeight: 600,
        color: '#1e293b', fontSize: '0.78rem', whiteSpace: 'nowrap',
        borderBottom: borderBottom ? '1px solid #0003' : undefined,
        borderRight: '1px solid #0002',
        backgroundColor: bg,
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
        borderRight: '1px solid #f1f5f9',
        backgroundColor: bg,
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
