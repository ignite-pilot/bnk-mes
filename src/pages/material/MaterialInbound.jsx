/**
 * 원자재 입고 요청/입고 관리 (원자재.md, 기본규칙.md)
 * - Tab: 입고 요청 목록 / 입고 상세 현황
 * - 검색: 원자재 N개, 입고 상태, 기간(선택 시에만 필터)
 * - 등록: 업체, 입고 희망일, 원자재 N개
 * - 보기, 취소, 전체 입고/반품, 라인별 입고/반품
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import RawMaterialSelectPopup from '../../components/RawMaterialSelectPopup';
import styles from './MaterialInfo.module.css';

const API = '/api/material-inbound';
const SUPPLIER_API = '/api/material-suppliers';
const MATERIAL_API = '/api/material';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const PAGE_SIZES = [10, 15, 20, 50, 100];

/** 상세 원자재 입고 상태 라벨 */
const LINE_STATUS_LABEL = { request: '입고 요청', received: '입고', returned: '반품' };

/** 선택된 원자재 ID 배열과 전체 원자재 목록으로 표시 문자열 반환 */
function getSelectedMaterialLabel(ids, materials) {
  if (!ids?.length) return '원자재 선택';
  const names = (ids || [])
    .map((id) => materials.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => (m.kind ? `${m.kind} / ${m.name}` : m.name || '').trim())
    .join(', ');
  return names || `${ids.length}개 선택됨`;
}

function MaterialInbound() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({
    requestId: '',
    rawMaterialIds: [],
    inboundStatus: '',
    supplierId: '',
    startDate: '',
    endDate: '',
  });
  const isMobile = useIsMobile();
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [rawMaterialPopupOpen, setRawMaterialPopupOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  /** 선택한 공급 업체의 제공 원자재 ID 목록 (입고 요청 등록 시, 업체 선택 시 로드) */
  const [supplierMaterialIds, setSupplierMaterialIds] = useState(null);

  const userName = user?.name || user?.loginId || '';
  const LIST_FETCH_TIMEOUT_MS = 15000;

  /** 입고 요청 등록 폼에서 업체 선택 시 해당 업체 제공 원자재만 노출 */
  useEffect(() => {
    if (!formOpen || formMode !== 'add' || !formData?.supplierId) {
      setSupplierMaterialIds(null);
      return;
    }
    const sid = formData.supplierId;
    fetch(`${SUPPLIER_API}/${sid}`)
      .then((r) => r.json())
      .then((d) => setSupplierMaterialIds(Array.isArray(d.raw_material_ids) ? d.raw_material_ids : []))
      .catch(() => setSupplierMaterialIds([]));
  }, [formOpen, formMode, formData?.supplierId]);

  /** 등록 폼에서 노출할 원자재: 선택한 업체의 제공 원자재만 */
  const materialsForInbound =
    formMode === 'add' && formData?.supplierId
      ? Array.isArray(supplierMaterialIds)
        ? materials.filter((m) => supplierMaterialIds.includes(m.id))
        : [] /* 로딩 중 */
      : materials;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), LIST_FETCH_TIMEOUT_MS);
    try {
      const q = new URLSearchParams({
        view: 'requests',
        page: String(page),
        limit: String(limit),
        startDate: search.startDate,
        endDate: search.endDate,
      });
      const reqId = String(search.requestId ?? '').trim();
      if (reqId) q.set('requestId', reqId);
      if (search.rawMaterialIds.length) q.set('rawMaterialIds', search.rawMaterialIds.join(','));
      if (search.inboundStatus) q.set('inboundStatus', search.inboundStatus);
      if (search.supplierId) q.set('supplierId', search.supplierId);
      const res = await fetch(`${API}?${q}`, { signal: ac.signal });
      clearTimeout(t);
      const text = await res.text();
      const data = (() => { try { return JSON.parse(text); } catch { return {}; } })();
      if (!res.ok) {
        const msg = data.error || '목록 조회에 실패했습니다.';
        const detail = data.detail || (text && text.length < 200 ? text : null);
        setError(detail ? `${msg} (${detail})` : msg);
        return;
      }
      setList(data.list || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      clearTimeout(t);
      setError(err.name === 'AbortError' ? '응답이 지연되고 있습니다.' : '목록 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search.startDate, search.endDate, search.requestId, search.rawMaterialIds, search.inboundStatus, search.supplierId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetch(`${SUPPLIER_API}?limit=500`)
      .then((r) => r.json())
      .then((d) => setSuppliers(d.list || []))
      .catch(() => setSuppliers([]));
  }, []);
  useEffect(() => {
    fetch(`${MATERIAL_API}?limit=500`)
      .then((r) => r.json())
      .then((d) => setMaterials(d.list || []))
      .catch(() => setMaterials([]));
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };

  const initialSearch = {
    requestId: '',
    rawMaterialIds: [],
    inboundStatus: '',
    supplierId: '',
    startDate: '',
    endDate: '',
  };
  const handleResetSearch = () => {
    setSearch(initialSearch);
    setPage(1);
  };

  const openAdd = () => {
    setFormMode('add');
    setSupplierMaterialIds(null);
    setFormData({
      supplierId: suppliers.length ? String(suppliers[0].id) : '',
      desiredDate: formatDate(new Date()),
      lines: [{ raw_material_id: '', quantity: '' }],
    });
    setFormError('');
    setFormOpen(true);
  };

  const openView = async (id) => {
    setFormError('');
    try {
      const res = await fetch(`${API}/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '조회에 실패했습니다.');
        return;
      }
      setFormMode('view');
      setFormData(data);
      setFormOpen(true);
    } catch {
      setFormError('조회 중 오류가 발생했습니다.');
    }
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormData(null);
    setFormError('');
    fetchList();
  };

  const addLine = () => {
    setFormData((f) => ({
      ...f,
      lines: [...(f.lines || []), { raw_material_id: materialsForInbound[0]?.id ?? '', quantity: '' }],
    }));
  };
  const removeLine = (idx) => {
    setFormData((f) => {
      const lines = [...(f.lines || [])];
      lines.splice(idx, 1);
      return { ...f, lines: lines.length ? lines : [{ raw_material_id: '', quantity: '' }] };
    });
  };
  const updateLine = (idx, field, value) => {
    setFormData((f) => {
      const lines = [...(f.lines || [])];
      lines[idx] = { ...lines[idx], [field]: value };
      return { ...f, lines };
    });
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setFormError('수정자(등록자)는 필수입니다.');
      return;
    }
    const lineList = (formData.lines || []).filter((l) => l.raw_material_id && (l.quantity !== '' && l.quantity != null));
    if (lineList.length === 0) {
      setFormError('원자재 정보를 1건 이상 입력해 주세요.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: Number(formData.supplierId),
          desiredDate: formData.desiredDate,
          lines: lineList.map((l) => ({ raw_material_id: Number(l.raw_material_id), quantity: Number(l.quantity) || 0 })),
          updatedBy: userName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '등록에 실패했습니다.');
        return;
      }
      closeForm();
    } catch {
      setFormError('등록 중 오류가 발생했습니다.');
    } finally {
      setFormSaving(false);
    }
  };

  const runAction = async (requestId, action, updatedBy) => {
    const messages = {
      cancel: '이 입고 요청을 취소하시겠습니까?',
      'receive-all': '전체 입고 처리하시겠습니까?',
      'return-all': '전체 반품 처리하시겠습니까?',
    };
    if (!window.confirm(messages[action] ?? '처리하시겠습니까?')) return;
    setActionLoading(`${requestId}-${action}`);
    setError('');
    try {
      const res = await fetch(`${API}/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, updatedBy: updatedBy || userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '처리에 실패했습니다.');
        return;
      }
      fetchList();
      if (formOpen && formData?.id === requestId) setFormData(data);
    } catch {
      setError('처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const runLineAction = async (requestId, lineId, status, fromLineStatus) => {
    const messages = {
      received: '입고 처리하시겠습니까?',
      returned: '반품 처리하시겠습니까?',
      request_received: '입고 완료를 취소하고 요청 상태로 되돌리시겠습니까?',
      request_returned: '반품을 취소하고 요청 상태로 되돌리시겠습니까?',
    };
    const confirmMsg = status === 'request' && fromLineStatus
      ? (fromLineStatus === 'received' ? messages.request_received : messages.request_returned)
      : (messages[status] ?? '처리하시겠습니까?');
    if (!window.confirm(confirmMsg)) return;
    setActionLoading(`line-${lineId}-${status}`);
    setError('');
    try {
      const res = await fetch(`${API}/${requestId}/lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '처리에 실패했습니다.');
        return;
      }
      fetchList();
      if (formOpen && formData?.id === requestId) {
        const lines = (formData.lines || []).map((l) => (l.id === lineId ? { ...l, status } : l));
        setFormData((f) => ({ ...f, lines }));
      }
    } catch {
      setError('처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  /** 입고 요청 목록 엑셀 다운로드 */
  const handleExcelDownload = async () => {
    const q = new URLSearchParams({
      view: 'requests',
      startDate: search.startDate,
      endDate: search.endDate,
    });
    const reqId = String(search.requestId ?? '').trim();
    if (reqId) q.set('requestId', reqId);
    if (search.rawMaterialIds.length) q.set('rawMaterialIds', search.rawMaterialIds.join(','));
    if (search.inboundStatus) q.set('inboundStatus', search.inboundStatus);
    if (search.supplierId) q.set('supplierId', search.supplierId);
    setError('');
    try {
      const res = await fetch(`${API}/export-excel?${q}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '엑셀 다운로드에 실패했습니다.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'material_inbound_requests.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 200);
    } catch (err) {
      setError('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  const renderCell = (v) => (v != null && v !== '' ? String(v) : '-');
  /** 원자재 수량 등 숫자: 정수만 표시 */
  const formatQty = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? String(Math.round(Number(v))) : '-');
  const totalPages = Math.ceil(total / limit) || 1;
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  const uniqPages = [...new Set([1, ...Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i), totalPages].filter((p) => p >= 1 && p <= totalPages))].sort((a, b) => a - b);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>원자재 입고 요청/입고 관리</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        {!isMobile && (
          <label className={styles.searchLabel}>
            입고 상태
            <select
              value={search.inboundStatus}
              onChange={(e) => setSearch((s) => ({ ...s, inboundStatus: e.target.value }))}
              className={styles.input}
            >
              <option value="">전체</option>
              <option value="active">활성</option>
              <option value="cancelled">입고 취소</option>
            </select>
          </label>
        )}
        <label className={styles.searchLabel}>
          업체명
          <select
            value={String(search.supplierId ?? '')}
            onChange={(e) => setSearch((s) => ({ ...s, supplierId: e.target.value }))}
            className={styles.input}
          >
            <option value="">전체</option>
            {suppliers.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className={styles.searchLabel}>
          입고 요청일(시작)
          <input type="date" value={search.startDate} onChange={(e) => setSearch((s) => ({ ...s, startDate: e.target.value }))} className={styles.input} />
        </label>
        <label className={styles.searchLabel}>
          입고 요청일(종료)
          <input type="date" value={search.endDate} onChange={(e) => setSearch((s) => ({ ...s, endDate: e.target.value }))} className={styles.input} />
        </label>
        <button type="submit" className={styles.btnPrimary}>검색</button>
        <button type="button" className={styles.btnSecondary} onClick={handleResetSearch}>초기화</button>
      </form>

      <div className={styles.toolbar}>
        <button type="button" className={styles.btnPrimary} onClick={openAdd}>
          원자재 입고 요청
        </button>
        <button type="button" className={styles.btnSecondary} onClick={handleExcelDownload} title="입고 요청 엑셀 다운로드">
          엑셀 다운로드
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.listOptions}>
        <label>
          한번에 보기
          <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={styles.input} style={{ marginLeft: '0.35rem' }}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}개</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p className={styles.loading}>조회 중...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>입고 요청일</th>
                <th>원자재 업체</th>
                {!isMobile && (
                  <>
                    <th>원자재 종류 개수</th>
                    <th>입고 희망일</th>
                    <th>상태</th>
                  </>
                )}
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={isMobile ? 3 : 6} className={styles.empty}>조회된 입고 요청이 없습니다.</td></tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button type="button" className={styles.linkBtn} onClick={() => openView(row.id)}>
                        {formatDate(row.request_date)}
                      </button>
                    </td>
                    <td>{renderCell(row.supplier_name)}</td>
                    {!isMobile && (
                      <>
                        <td>{formatQty(row.material_kind_count)}</td>
                        <td>{formatDate(row.desired_date)}</td>
                        <td>{row.status_label ?? '입고 요청'}</td>
                      </>
                    )}
                    <td>
                      {(row.can_cancel === true || (row.status === 'active' && (row.status_label ?? '') === '입고 요청')) && (
                        <button type="button" className={styles.btnSmall} onClick={() => runAction(row.id, 'cancel')} disabled={!!actionLoading}>
                          입고 요청 취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className={styles.pagination}>
          <span className={styles.paginationTotal}>총 {total}건</span>
          <nav className={styles.pageNav} aria-label="페이지 네비게이션">
            <button type="button" className={styles.pageBtn} onClick={() => setPage(1)} disabled={page <= 1}>처음</button>
            <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>이전</button>
            {uniqPages.map((p, i) => (
              <span key={p}>
                {i > 0 && uniqPages[i - 1] !== p - 1 && <span style={{ padding: '0 0.25rem' }}>…</span>}
                <button type="button" className={p === page ? `${styles.pageBtn} ${styles.pageBtnCurrent}` : styles.pageBtn} onClick={() => setPage(p)}>{p}</button>
              </span>
            ))}
            <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</button>
            <button type="button" className={styles.pageBtn} onClick={() => setPage(totalPages)} disabled={page >= totalPages}>마지막</button>
          </nav>
        </div>
      )}

      {formOpen && formData && (
        <div className={styles.modalOverlay} onClick={closeForm} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 560 }}>
            <h2 className={styles.modalTitle}>
              {formMode === 'add' && '원자재 입고 요청'}
              {formMode === 'view' && '입고 요청 보기'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <label className={styles.label}>
                  원자재 업체 <span className={styles.required}>(필수)</span>
                  <select
                    value={String(formData.supplierId ?? '')}
                    onChange={(e) => setFormData((f) => ({ ...f, supplierId: e.target.value, lines: [{ raw_material_id: '', quantity: '' }] }))}
                    className={styles.input}
                    required
                  >
                    {suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </label>
                <label className={styles.label}>
                  입고 희망일 <span className={styles.required}>(필수)</span>
                  <input type="date" value={formData.desiredDate || ''} onChange={(e) => setFormData((f) => ({ ...f, desiredDate: e.target.value }))} className={styles.input} required />
                </label>
                <div className={styles.label}>원자재 정보 (선택한 업체의 원자재만 표시)</div>
                {(formData.lines || []).map((line, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <select value={String(line.raw_material_id ?? '')} onChange={(e) => updateLine(idx, 'raw_material_id', e.target.value)} className={styles.input} style={{ flex: 1 }}>
                      <option value="">원자재 선택</option>
                      {materialsForInbound.map((m) => <option key={m.id} value={String(m.id)}>{m.kind ? `${m.kind} / ${m.name}` : m.name}</option>)}
                    </select>
                    <input type="number" min={0} value={line.quantity ?? ''} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className={styles.input} placeholder="수량" style={{ width: 100 }} />
                    <button type="button" className={styles.btnSmall} onClick={() => removeLine(idx)}>삭제</button>
                  </div>
                ))}
                <button type="button" className={styles.btnSecondary} style={{ marginTop: '0.5rem' }} onClick={addLine} disabled={!formData.supplierId || materialsForInbound.length === 0}>
                  원자재 추가
                </button>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={formSaving}>{formSaving ? '등록 중...' : '등록'}</button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>취소</button>
                </div>
              </form>
            )}

            {formMode === 'view' && (
              <div className={styles.viewForm}>
                <dl className={styles.dl}>
                  <dt>입고 요청 ID</dt>
                  <dd>{formData.id ?? '-'}</dd>
                  <dt>원자재 업체</dt>
                  <dd>{renderCell(formData.supplier_name)}</dd>
                  <dt>입고 요청일</dt>
                  <dd>{formatDate(formData.request_date)}</dd>
                  <dt>입고 희망일</dt>
                  <dd>{formatDate(formData.desired_date)}</dd>
                  <dt>상태</dt>
                  <dd>{formData.status_label ?? '입고 요청'}</dd>
                </dl>
                <div className={styles.label} style={{ marginTop: '1rem' }}>상세 원자재 입고 상태</div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>원자재</th><th>수량</th><th>상태</th><th>기능</th></tr></thead>
                    <tbody>
                      {(formData.lines || []).map((l, i) => (
                        <tr key={l.id || i}>
                          <td>{[l.raw_material_kind, l.raw_material_name].filter(Boolean).join(' / ') || l.raw_material_name}</td>
                          <td>{formatQty(l.quantity)}</td>
                          <td>{formData.status === 'cancelled' ? '입고 취소' : (LINE_STATUS_LABEL[l.status] || l.status)}</td>
                          <td>
                            {formData.status !== 'cancelled' && l.status === 'request' && (
                              <>
                                <button type="button" className={styles.btnSmall} onClick={() => runLineAction(formData.id, l.id, 'received')} disabled={!!actionLoading}>
                                  입고 완료
                                </button>
                                <button type="button" className={styles.btnSmallDanger} onClick={() => runLineAction(formData.id, l.id, 'returned')} disabled={!!actionLoading}>
                                  반품
                                </button>
                              </>
                            )}
                            {formData.status !== 'cancelled' && l.status === 'received' && (
                              <button type="button" className={styles.btnSmall} onClick={() => runLineAction(formData.id, l.id, 'request', 'received')} disabled={!!actionLoading}>
                                입고 완료 취소
                              </button>
                            )}
                            {formData.status !== 'cancelled' && l.status === 'returned' && (
                              <button type="button" className={styles.btnSmall} onClick={() => runLineAction(formData.id, l.id, 'request', 'returned')} disabled={!!actionLoading}>
                                반품 취소
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.formActions}>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>닫기</button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

export default MaterialInbound;
