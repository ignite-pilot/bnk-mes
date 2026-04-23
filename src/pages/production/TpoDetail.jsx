/**
 * 월별 TPO 상세 (경주물류창고) — 1~3월 포맷 기준
 * 엑셀 파일과 동일한 컬럼 구성으로 표시
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from '../material/MaterialInfo.module.css';
import SelectDropdown from '../../components/SelectDropdown';

const API = '/api/tpo-detail';

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtInt(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0';
  return Math.trunc(n).toLocaleString();
}
function fmtDecimal(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtRate(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return (n * 100).toFixed(1) + '%';
}
function ymMonthNum(ym) {
  const m = String(ym || '').match(/-(\d{2})$/);
  return m ? Number(m[1]) : null;
}
function prevMonthNum(ym) {
  const m = ymMonthNum(ym);
  if (m == null) return null;
  return m === 1 ? 12 : m - 1;
}

function TpoDetail() {
  const { user } = useAuth();
  const userName = user?.name || user?.loginId || '';
  const [months, setMonths] = useState([]);
  const [selectedYm, setSelectedYm] = useState(currentYm());
  const [uploadYm, setUploadYm] = useState(currentYm());
  const [data, setData] = useState({ headers: [], dailyByHeader: {}, weeklyByHeader: {}, perfByHeader: {}, inboundByHeader: {}, dateList: [], dateWeek: {}, weekList: [], perfWeekList: [], inboundWeekList: [], meta: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState({ vehicle: '', supplier: '', partNo: '', materialCode: '' });
  const [collapsedWeeks, setCollapsedWeeks] = useState(new Set());
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });

  const handleMouseDown = (e) => {
    // 버튼 및 인터랙티브 요소는 드래그 대상에서 제외
    if (e.target.closest('button, input, select, a, [role="button"]')) return;
    const el = scrollRef.current; if (!el) return;
    dragRef.current = { active: true, startX: e.pageX, startY: e.pageY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };
  const handleMouseMove = (e) => {
    const d = dragRef.current; if (!d.active) return;
    const el = scrollRef.current; if (!el) return;
    const dx = e.pageX - d.startX;
    if (!d.moved && Math.abs(dx) > 3) d.moved = true;
    el.scrollLeft = d.scrollLeft - dx;
  };
  const endDrag = () => {
    const el = scrollRef.current; if (!el) return;
    dragRef.current.active = false;
    el.style.cursor = '';
    el.style.userSelect = '';
  };

  const fetchMonths = useCallback(async () => {
    try {
      const res = await fetch(`${API}/months`);
      const d = await res.json();
      if (res.ok) setMonths(d.months || []);
    } catch { /* noop */ }
  }, []);

  const fetchDetail = useCallback(async (ym) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (ym) q.set('ym', ym);
      const res = await fetch(`${API}?${q}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || '조회 실패'); return; }
      setData(d);
      if (d.ym && d.ym !== selectedYm) setSelectedYm(d.ym);
      setCollapsedWeeks(new Set(d.weekList || []));
    } catch (err) {
      setError('조회 중 오류: ' + err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { (async () => { await fetchMonths(); await fetchDetail(); })(); }, [fetchMonths, fetchDetail]);

  const handleChangeYm = (ym) => { setSelectedYm(ym); fetchDetail(ym); };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadYm) { setError('업로드할 월을 선택하세요.'); e.target.value = ''; return; }
    const existing = months.find((m) => m.year_month === uploadYm);
    if (existing && !window.confirm(`${uploadYm} 월의 기존 데이터(${existing.cnt}건)가 전체 삭제되고 새로 적재됩니다. 계속하시겠습니까?`)) {
      e.target.value = ''; return;
    }
    setLoading(true); setError(''); setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('uploadedBy', userName); fd.append('ym', uploadYm);
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '업로드 실패'); return; }
      setMessage(`${d.ym} 업로드 완료: 품번 ${d.headers}개 / 일별 ${d.dailyEntries}건 / 주차 ${d.weeklySummaries}건 / 입고실적 ${d.weeklyPerformance}건`);
      await fetchMonths(); setSelectedYm(d.ym); await fetchDetail(d.ym);
    } catch (err) {
      setError('업로드 오류: ' + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!selectedYm) return;
    if (!window.confirm(`${selectedYm} 월 데이터를 전체 삭제하시겠습니까?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}?ym=${encodeURIComponent(selectedYm)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { setError(d.error || '삭제 실패'); return; }
      setMessage(`${selectedYm} 월 데이터 삭제 완료`);
      await fetchMonths(); await fetchDetail();
    } catch (err) {
      setError('삭제 오류: ' + err.message);
    } finally { setLoading(false); }
  };

  const toggleWeek = (wk) => {
    setCollapsedWeeks((prev) => { const next = new Set(prev); if (next.has(wk)) next.delete(wk); else next.add(wk); return next; });
  };

  const filtered = useMemo(() => {
    const q = (v) => String(v || '').toLowerCase();
    return data.headers.filter((h) => {
      if (search.vehicle && !q(h.vehicle).includes(q(search.vehicle))) return false;
      if (search.supplier && !q(h.supplier).includes(q(search.supplier))) return false;
      if (search.partNo && !q(h.part_no).includes(q(search.partNo))) return false;
      if (search.materialCode && !q(h.material_code).includes(q(search.materialCode))) return false;
      return true;
    });
  }, [data.headers, search]);

  // 같은 차종/업체가 연속되는 행을 하나의 병합 셀로 표시하기 위한 rowSpan 계산
  const mergeSpans = useMemo(() => {
    const vSpans = new Array(filtered.length).fill(0);
    const sSpans = new Array(filtered.length).fill(0);
    for (let i = 0; i < filtered.length; ) {
      let j = i;
      const v = filtered[i].vehicle ?? null;
      while (j < filtered.length && (filtered[j].vehicle ?? null) === v) j++;
      vSpans[i] = j - i;
      i = j;
    }
    for (let i = 0; i < filtered.length; ) {
      let j = i;
      const s = filtered[i].supplier ?? null;
      const v = filtered[i].vehicle ?? null;
      // 업체는 차종 경계를 넘지 않도록: 차종이 바뀌면 그룹도 종료
      while (j < filtered.length
        && (filtered[j].supplier ?? null) === s
        && (filtered[j].vehicle ?? null) === v) j++;
      sSpans[i] = j - i;
      i = j;
    }
    return { vSpans, sSpans };
  }, [filtered]);

  const dateGroups = useMemo(() => {
    const groups = new Map();
    for (const d of data.dateList) {
      const wk = data.dateWeek?.[d] || 0;
      if (!groups.has(wk)) groups.set(wk, []);
      groups.get(wk).push(d);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [data.dateList, data.dateWeek]);

  const monthOptions = months.map((m) => ({ value: m.year_month, label: `${m.year_month} (${m.cnt}건)` }));
  const curMonthNum = ymMonthNum(selectedYm);
  const prevMonth = prevMonthNum(selectedYm);
  const perfWeekList = data.perfWeekList || [];

  return (
    <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>주문 출고 현황</h1>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>※ <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>26년3월 TPO 요청수량(경주물류창고)~.xlsx</code> 참고</span>
      </div>

      <div className={styles.searchForm} style={{ gap: '0.5rem 0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className={styles.searchLabel} style={{ minWidth: 180 }}>
          <span>조회 월</span>
          <SelectDropdown options={monthOptions} value={selectedYm} onChange={(v) => handleChangeYm(v)} placeholder="월 선택" searchable={months.length >= 6} dropdownMinWidth={200} />
        </label>
        {selectedYm && data.headers.length > 0 && (
          <button type="button" onClick={handleDelete} disabled={loading}
            style={{ padding: '0.4rem 0.9rem', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '32px', fontSize: '0.8125rem' }}>삭제</button>
        )}
        <div style={{ width: '4rem' }} />
        <label className={styles.searchLabel}>
          <span>업로드 월</span>
          <input type="month" value={uploadYm} onChange={(e) => setUploadYm(e.target.value)} className={styles.input} />
        </label>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || !uploadYm}
          style={{ padding: '0.4rem 0.9rem', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '32px', fontSize: '0.8125rem' }}>엑셀 업로드</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#78350f', padding: '0.3rem 0.6rem', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', height: '32px', boxSizing: 'border-box' }}>
          <span aria-hidden>⚠</span>1~3월 TPO 포맷만 지원. 해당 월의 기존 데이터가 전체 교체됩니다.
        </span>

        <div style={{ flexBasis: '100%', height: 0 }} />

        <label className={styles.searchLabel}><span>차종</span><input type="text" value={search.vehicle} onChange={(e) => setSearch((s) => ({ ...s, vehicle: e.target.value }))} className={styles.input} placeholder="검색" /></label>
        <label className={styles.searchLabel}><span>업체</span><input type="text" value={search.supplier} onChange={(e) => setSearch((s) => ({ ...s, supplier: e.target.value }))} className={styles.input} placeholder="검색" /></label>
        <label className={styles.searchLabel}><span>품번</span><input type="text" value={search.partNo} onChange={(e) => setSearch((s) => ({ ...s, partNo: e.target.value }))} className={styles.input} placeholder="검색" /></label>
        <label className={styles.searchLabel}><span>자재코드</span><input type="text" value={search.materialCode} onChange={(e) => setSearch((s) => ({ ...s, materialCode: e.target.value }))} className={styles.input} placeholder="검색" /></label>
        <button type="button" onClick={() => setSearch({ vehicle: '', supplier: '', partNo: '', materialCode: '' })}
          style={{ padding: '0.4rem 0.9rem', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '32px', fontSize: '0.8125rem' }}>초기화</button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge label="총 품번" value={`${filtered.length}건`} color="#2563eb" />
        {selectedYm && <Badge label="월" value={selectedYm} color="#0ea5e9" />}
        {data.meta && (<span style={{ fontSize: '0.75rem', color: '#64748b' }}>업로드: {data.meta.uploaded_at}{data.meta.uploaded_by ? ` · ${data.meta.uploaded_by}` : ''}</span>)}
        {dateGroups.length > 0 && (
          <div style={{ display: 'inline-flex', gap: '0.3rem', marginLeft: '0.5rem' }}>
            <button type="button" onClick={() => setCollapsedWeeks(new Set())} style={{ padding: '0.2rem 0.6rem', backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer' }}>전체 펼치기</button>
            <button type="button" onClick={() => setCollapsedWeeks(new Set(dateGroups.map(([w]) => w)))} style={{ padding: '0.2rem 0.6rem', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer' }}>전체 접기</button>
          </div>
        )}
      </div>

      {error && <div style={{ padding: '0.5rem 0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: '0.5rem' }}>{error}</div>}
      {message && <div style={{ padding: '0.5rem 0.75rem', background: '#dbeafe', color: '#1e40af', borderRadius: '4px', marginBottom: '0.5rem' }}>{message}</div>}

      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'grab', flex: 1, minHeight: 0 }}
      >
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.75rem' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            {/* Row 1: group headers */}
            <tr style={{ backgroundColor: '#f1f5f9' }}>
              <Th rowSpan={2} sticky left={0} width={50}>#</Th>
              <Th rowSpan={2} sticky left={50} width={70}>차종</Th>
              <Th rowSpan={2} sticky left={120} width={70}>업체</Th>
              <Th rowSpan={2} sticky left={190} width={90}>품번</Th>
              <Th rowSpan={2} sticky left={280} width={100}>규격</Th>
              <Th rowSpan={2} sticky left={380} width={90}>자재코드</Th>
              <Th colSpan={3} align="center" bg="#fef3c7">{curMonthNum ? `${curMonthNum}월계획[EA]` : '월계획[EA]'}</Th>
              <Th rowSpan={2} align="right" width={80} bg="#fef3c7">입고누계</Th>
              <Th rowSpan={2} align="right" width={80} bg="#fef3c7">현재고</Th>
              {dateGroups.map(([wk, dates]) => {
                const collapsed = collapsedWeeks.has(wk);
                const colSpan = collapsed ? 3 : (dates.length * 2 + 3);
                return (
                  <Th key={wk} colSpan={colSpan} align="center" bg="#e0f2fe" borderLeft>
                    <button type="button" onClick={() => toggleWeek(wk)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', fontWeight: 700, fontSize: '0.8rem' }}>
                      {collapsed ? '▶' : '▼'} {wk}주차
                    </button>
                  </Th>
                );
              })}
              <Th colSpan={3} align="center" bg="#fde68a">{curMonthNum ? `${curMonthNum}월 합계` : '월 합계'}</Th>
              <Th rowSpan={2} align="right" width={80} bg="#ecfccb">잔량</Th>
              <Th rowSpan={2} align="right" width={90} bg="#ecfccb">월말예상재고</Th>
              {perfWeekList.length > 0 && (
                <Th colSpan={perfWeekList.length * 3} align="center" bg="#e0e7ff" borderLeft>
                  입고실적{prevMonth ? ` (${prevMonth}월)` : ''}
                </Th>
              )}
              <Th rowSpan={2} align="right" width={80} bg="#fce7f3">월말재고</Th>
              <Th rowSpan={2} align="right" width={80} bg="#fce7f3">현재고(재고)</Th>
              <Th rowSpan={2} align="right" width={80} bg="#fce7f3">잔량(재고)</Th>
            </tr>
            {/* Row 2: leaf headers */}
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <Th align="right" width={80} bg="#fef3c7">전월말재고</Th>
              <Th align="right" width={80} bg="#fef3c7">{curMonthNum ? `${curMonthNum}월 판매` : '월판매'}</Th>
              <Th align="right" width={80} bg="#fef3c7">{curMonthNum ? `${curMonthNum}월 생산입고` : '월입고'}</Th>
              {dateGroups.map(([wk, dates]) => {
                const collapsed = collapsedWeeks.has(wk);
                return (
                  <React.Fragment key={wk}>
                    {!collapsed && dates.map((d) => (
                      <React.Fragment key={d}>
                        <Th align="right" width={55} bg="#f0f9ff" borderLeft>{d.slice(5).replace('-', '/')}<br /><span style={{ fontSize: '0.65rem', color: '#64748b' }}>주문</span></Th>
                        <Th align="right" width={55} bg="#f0f9ff">{d.slice(5).replace('-', '/')}<br /><span style={{ fontSize: '0.65rem', color: '#64748b' }}>출고</span></Th>
                      </React.Fragment>
                    ))}
                    <Th align="right" width={60} bg="#fffbeb" borderLeft>주문<br />합계</Th>
                    <Th align="right" width={60} bg="#fffbeb">출고<br />합계</Th>
                    <Th align="right" width={60} bg="#fee2e2">미출고<br />합계</Th>
                  </React.Fragment>
                );
              })}
              <Th align="right" width={80} bg="#fde68a">출고합계</Th>
              <Th align="right" width={80} bg="#fde68a">주문합계</Th>
              <Th align="right" width={80} bg="#fde68a">미출고합계</Th>
              {perfWeekList.map((w) => (
                <React.Fragment key={`pw-${w}`}>
                  <Th align="right" width={60} bg="#e0e7ff" borderLeft>{prevMonth ? `${prevMonth}월${w}주` : `${w}주`}<br /><span style={{ fontSize: '0.65rem', color: '#475569' }}>계획</span></Th>
                  <Th align="right" width={60} bg="#e0e7ff">{prevMonth ? `${prevMonth}월${w}주` : `${w}주`}<br /><span style={{ fontSize: '0.65rem', color: '#475569' }}>실적</span></Th>
                  <Th align="right" width={55} bg="#e0e7ff">{prevMonth ? `${prevMonth}월${w}주` : `${w}주`}<br /><span style={{ fontSize: '0.65rem', color: '#475569' }}>달성율</span></Th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={1000} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                {data.headers.length === 0 ? '데이터가 없습니다. 월을 선택하고 엑셀을 업로드해 주세요.' : '검색 결과가 없습니다.'}
              </td></tr>
            )}
            {filtered.map((h, idx) => {
              const dailyMap = data.dailyByHeader[h.id] || {};
              const weeklyMap = data.weeklyByHeader[h.id] || {};
              const perfMap = data.perfByHeader[h.id] || {};
              return (
                <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <Td align="center" sticky left={0} width={50} style={{ color: '#64748b' }}>{idx + 1}</Td>
                  {mergeSpans.vSpans[idx] > 0 && (
                    <Td sticky left={50} width={70} rowSpan={mergeSpans.vSpans[idx]} align="center" style={{ verticalAlign: 'middle', backgroundColor: '#fafafa', whiteSpace: 'pre-line' }}>{h.vehicle || '-'}</Td>
                  )}
                  {mergeSpans.sSpans[idx] > 0 && (
                    <Td sticky left={120} width={70} rowSpan={mergeSpans.sSpans[idx]} align="center" style={{ verticalAlign: 'middle', backgroundColor: '#fafafa' }}>{h.supplier || '-'}</Td>
                  )}
                  <Td sticky left={190} width={90}>{h.part_no || '-'}</Td>
                  <Td sticky left={280} width={100}>{h.spec || '-'}</Td>
                  <Td sticky left={380} width={90}>{h.material_code || '-'}</Td>
                  <Td align="right">{fmtInt(h.prev_stock)}</Td>
                  <Td align="right">{fmtInt(h.month_sales)}</Td>
                  <Td align="right">{fmtInt(h.month_in_qty)}</Td>
                  <Td align="right">{fmtInt(h.cumulative_in)}</Td>
                  <Td align="right">{fmtInt(h.current_stock)}</Td>
                  {dateGroups.map(([wk, dates]) => {
                    const collapsed = collapsedWeeks.has(wk);
                    const w = weeklyMap[wk] || {};
                    return (
                      <React.Fragment key={wk}>
                        {!collapsed && dates.map((d) => {
                          const entry = dailyMap[d] || {};
                          return (
                            <React.Fragment key={d}>
                              <Td align="right" borderLeft>{fmtInt(entry.order)}</Td>
                              <Td align="right">{fmtInt(entry.ship)}</Td>
                            </React.Fragment>
                          );
                        })}
                        <Td align="right" bg="#fffbeb" borderLeft style={{ fontWeight: 600 }}>{fmtInt(w.order)}</Td>
                        <Td align="right" bg="#fffbeb" style={{ fontWeight: 600 }}>{fmtInt(w.ship)}</Td>
                        <Td align="right" bg="#fff1f2" style={{ fontWeight: 600, color: Number(w.unship || 0) > 0 ? '#dc2626' : '#1e293b' }}>{fmtInt(w.unship)}</Td>
                      </React.Fragment>
                    );
                  })}
                  <Td align="right" bg="#fef3c7" style={{ fontWeight: 600 }}>{fmtInt(h.month_ship_total)}</Td>
                  <Td align="right" bg="#fef3c7" style={{ fontWeight: 600 }}>{fmtInt(h.month_order_total)}</Td>
                  <Td align="right" bg="#fef3c7" style={{ fontWeight: 600 }}>{fmtInt(h.month_unship_total)}</Td>
                  <Td align="right" bg="#f7fee7">{fmtDecimal(h.remaining)}</Td>
                  <Td align="right" bg="#f7fee7">{fmtDecimal(h.forecast_end_stock)}</Td>
                  {perfWeekList.map((w) => {
                    const p = perfMap[w] || {};
                    return (
                      <React.Fragment key={`pd-${w}`}>
                        <Td align="right" bg="#eef2ff">{fmtInt(p.plan)}</Td>
                        <Td align="right" bg="#eef2ff">{fmtInt(p.actual)}</Td>
                        <Td align="right" bg="#eef2ff">{fmtRate(p.rate)}</Td>
                      </React.Fragment>
                    );
                  })}
                  <Td align="right" bg="#fdf2f8">{fmtInt(h.month_end_stock_ib)}</Td>
                  <Td align="right" bg="#fdf2f8">{fmtInt(h.current_stock_ib)}</Td>
                  <Td align="right" bg="#fdf2f8">{fmtDecimal(h.remaining_ib)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = 'left', colSpan, rowSpan, width, sticky, left, top, bg, borderLeft }) {
  const stickyLeft = sticky || left != null;
  const stickyTop = top != null;
  const isSticky = stickyLeft || stickyTop;
  const zIndex = stickyLeft && stickyTop ? 4 : (stickyLeft ? 3 : 2);
  return (
    <th colSpan={colSpan} rowSpan={rowSpan}
      style={{
        padding: '0.3rem 0.4rem', textAlign: align, fontWeight: 600,
        color: '#1e293b', fontSize: '0.7rem', whiteSpace: 'nowrap',
        borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
        borderLeft: borderLeft ? '2px solid #cbd5e1' : undefined,
        backgroundColor: bg || '#f1f5f9',
        ...(width ? { minWidth: width, maxWidth: width, width } : {}),
        ...(isSticky ? { position: 'sticky', ...(stickyLeft ? { left } : {}), ...(stickyTop ? { top } : {}), zIndex } : {}),
      }}>
      {children}
    </th>
  );
}
function Td({ children, align = 'left', width, sticky, left, bg, borderLeft, style, rowSpan }) {
  const title = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  return (
    <td title={title} rowSpan={rowSpan}
      style={{
        padding: '0.25rem 0.35rem', textAlign: align, color: '#1e293b',
        whiteSpace: 'nowrap', verticalAlign: 'middle',
        overflow: 'hidden', textOverflow: 'ellipsis',
        borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #f1f5f9',
        borderLeft: borderLeft ? '2px solid #cbd5e1' : undefined,
        fontVariantNumeric: 'tabular-nums',
        backgroundColor: bg || '#ffffff',
        ...(width ? { minWidth: width, maxWidth: width, width } : {}),
        ...(sticky ? { position: 'sticky', left, backgroundColor: bg || '#ffffff', zIndex: 1 } : {}),
        ...style,
      }}>
      {children}
    </td>
  );
}
function Badge({ label, value, color }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.7rem', borderRadius: '6px', border: `1px solid ${color}40`, backgroundColor: `${color}10`, color, fontSize: '0.8rem', fontWeight: 500 }}>
      <span style={{ opacity: 0.8 }}>{label}</span><strong>{value}</strong>
    </div>
  );
}

export default TpoDetail;
