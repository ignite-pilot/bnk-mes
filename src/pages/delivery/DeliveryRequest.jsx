import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useAuth } from '../../context/AuthContext';
import styles from '../material/MaterialInfo.module.css';
import dtStyles from './DeliveryTable.module.css';
import SelectDropdown from '../../components/SelectDropdown';

const API = '/api/delivery-requests';
const SUPPLIER_API = '/api/delivery-suppliers';
const FINISHED_PRODUCT_API = '/api/delivery-finished-products';
const SEMI_PRODUCT_API = '/api/delivery-semi-products';

const STATUS_LABELS = {
  requested: '납품 요청',
  partial: '부분 납품/반품',
  completed: '전체 납품',
  all_returned: '전체 반품',
  cancelled: '납품 요청 취소',
};

const ITEM_STATUS_LABELS = {
  requested: '납품 요청',
  delivered: '납품',
  returned: '반품',
  cancelled: '납품 취소',
};

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const PAGE_SIZES = [10, 15, 20, 50, 100];

function DeliveryRequest() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [suppliers, setSuppliers] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [semiProducts, setSemiProducts] = useState([]);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ supplierName: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add'); // add | view | edit
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [supplierProductIds, setSupplierProductIds] = useState({ finished: [], semi: [] });

  const userName = user?.name || user?.loginId || '';

  const LIST_FETCH_TIMEOUT_MS = 15000;

  /* 납품사 + 완제품 + 반제품 목록 로드 */
  useEffect(() => {
    fetch(`${SUPPLIER_API}?limit=500`)
      .then((r) => r.json())
      .then((d) => setSuppliers(d.list || []))
      .catch(() => setSuppliers([]));
    fetch(`${FINISHED_PRODUCT_API}?limit=500`)
      .then((r) => r.json())
      .then((d) => setFinishedProducts(d.list || []))
      .catch(() => setFinishedProducts([]));
    fetch(`${SEMI_PRODUCT_API}?limit=500`)
      .then((r) => r.json())
      .then((d) => setSemiProducts(d.list || []))
      .catch(() => setSemiProducts([]));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), LIST_FETCH_TIMEOUT_MS);
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.supplierName.trim()) q.set('supplierName', search.supplierName.trim());
      const res = await fetch(`${API}?${q}`, { signal: ac.signal });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '목록 조회에 실패했습니다.');
        return;
      }
      setList(data.list || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setError('응답이 지연되고 있습니다. 백엔드 서버(포트 3000)와 DB가 실행 중인지 확인해 주세요.');
      } else {
        setError('목록 조회 중 오류가 발생했습니다. (백엔드·DB 연결 확인)');
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, search.supplierName]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };
  const handleResetSearch = () => {
    setSearch({ supplierName: '' });
    setPage(1);
  };

  const getSupplierName = (sid) => {
    const s = suppliers.find((x) => x.id === sid);
    return s ? s.name : '-';
  };

  const getProductName = (itemType, productId) => {
    if (itemType === 'finished') {
      const p = finishedProducts.find((x) => x.id === productId);
      return p ? p.name : '-';
    }
    const p = semiProducts.find((x) => x.id === productId);
    return p ? p.name : '-';
  };

  /* ── 납품사별 제품 필터링 ── */
  const fetchSupplierProducts = useCallback(async (supplierId) => {
    if (!supplierId) {
      setSupplierProductIds({ finished: [], semi: [] });
      return;
    }
    try {
      const res = await fetch(`${SUPPLIER_API}/${supplierId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSupplierProductIds({
          finished: data.finished_product_ids || [],
          semi: data.semi_product_ids || [],
        });
      }
    } catch {
      setSupplierProductIds({ finished: [], semi: [] });
    }
  }, []);

  const filteredFinishedProducts = useMemo(() => {
    if (!supplierProductIds.finished.length) return [];
    return finishedProducts.filter((p) => supplierProductIds.finished.includes(p.id));
  }, [finishedProducts, supplierProductIds.finished]);

  const filteredSemiProducts = useMemo(() => {
    if (!supplierProductIds.semi.length) return [];
    return semiProducts.filter((p) => supplierProductIds.semi.includes(p.id));
  }, [semiProducts, supplierProductIds.semi]);

  /* ── ADD ── */
  const openAdd = () => {
    setFormMode('add');
    setFormData({
      supplier_id: '',
      request_date: formatDate(new Date()),
      desired_date: '',
      items: [{ item_type: 'finished', product_id: '', quantity: 1 }],
    });
    setSupplierProductIds({ finished: [], semi: [] });
    setFormError('');
    setFormOpen(true);
  };

  /* ── VIEW (detail) ── */
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

  const refreshDetail = async (id) => {
    try {
      const res = await fetch(`${API}/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFormData(data);
      }
    } catch {
      /* silent */
    }
  };

  /* ── EDIT ── */
  const openEdit = (row) => {
    setFormMode('edit');
    setFormData({
      id: row.id,
      supplier_id: row.supplier_id ?? '',
      request_date: row.request_date ? formatDate(row.request_date) : '',
      desired_date: row.desired_date ? formatDate(row.desired_date) : '',
      status: row.status,
      items: (row.items || []).map((it) => ({
        id: it.id,
        item_type: it.item_type || 'finished',
        product_id: it.product_id ?? '',
        quantity: it.quantity ?? 1,
        item_status: it.item_status,
      })),
    });
    if (row.supplier_id) fetchSupplierProducts(row.supplier_id);
    setFormError('');
    setFormOpen(true);
  };

  const loadDetailForEdit = async (id) => {
    try {
      const res = await fetch(`${API}/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) openEdit(data);
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

  /* ── Items helpers ── */
  const addItem = () => {
    setFormData((f) => ({
      ...f,
      items: [...(f.items || []), { item_type: 'finished', product_id: '', quantity: 1 }],
    }));
  };

  const removeItem = (idx) => {
    setFormData((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== idx),
    }));
  };

  const updateItem = (idx, field, value) => {
    setFormData((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }));
  };

  /* ── SUBMIT ADD ── */
  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName || String(userName).trim() === '') {
      setFormError('수정자는 필수입니다. 로그인 후 등록해 주세요.');
      return;
    }
    if (!formData.supplier_id) {
      setFormError('납품사는 필수입니다.');
      return;
    }
    if (!formData.request_date) {
      setFormError('납품 요청일은 필수입니다.');
      return;
    }
    if (!formData.desired_date) {
      setFormError('납품 희망일은 필수입니다.');
      return;
    }
    if (!formData.items?.length) {
      setFormError('품목을 최소 1개 추가해 주세요.');
      return;
    }
    for (let i = 0; i < formData.items.length; i++) {
      const it = formData.items[i];
      if (!it.product_id) {
        setFormError(`품목 ${i + 1}번: 제품을 선택해 주세요.`);
        return;
      }
      if (!it.quantity || Number(it.quantity) < 1) {
        setFormError(`품목 ${i + 1}번: 수량은 1 이상이어야 합니다.`);
        return;
      }
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: formData.supplier_id,
          request_date: formData.request_date,
          desired_date: formData.desired_date,
          items: formData.items.map((it) => ({
            item_type: it.item_type,
            product_id: it.product_id,
            quantity: Number(it.quantity),
          })),
          updatedBy: userName,
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

  /* ── SUBMIT EDIT ── */
  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!formData.supplier_id) {
      setFormError('납품사는 필수입니다.');
      return;
    }
    if (!formData.request_date) {
      setFormError('납품 요청일은 필수입니다.');
      return;
    }
    if (!formData.desired_date) {
      setFormError('납품 희망일은 필수입니다.');
      return;
    }
    if (!formData.items?.length) {
      setFormError('품목을 최소 1개 추가해 주세요.');
      return;
    }
    for (let i = 0; i < formData.items.length; i++) {
      const it = formData.items[i];
      if (!it.product_id) {
        setFormError(`품목 ${i + 1}번: 제품을 선택해 주세요.`);
        return;
      }
      if (!it.quantity || Number(it.quantity) < 1) {
        setFormError(`품목 ${i + 1}번: 수량은 1 이상이어야 합니다.`);
        return;
      }
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: formData.supplier_id,
          request_date: formData.request_date,
          desired_date: formData.desired_date,
          items: formData.items.map((it) => ({
            id: it.id,
            item_type: it.item_type,
            product_id: it.product_id,
            quantity: Number(it.quantity),
          })),
          updatedBy: userName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '수정에 실패했습니다.');
        return;
      }
      closeForm();
    } catch {
      setFormError('수정 중 오류가 발생했습니다.');
    } finally {
      setFormSaving(false);
    }
  };

  /* ── CANCEL request ── */
  const handleCancel = async (id) => {
    if (!window.confirm('납품 요청을 취소하시겠습니까?')) return;
    setError('');
    try {
      const res = await fetch(`${API}/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '취소에 실패했습니다.');
        return;
      }
      fetchList();
    } catch {
      setError('취소 중 오류가 발생했습니다.');
    }
  };

  /* ── CANCEL from detail view ── */
  const handleCancelFromDetail = async () => {
    if (!window.confirm('납품 요청을 취소하시겠습니까?')) return;
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '취소에 실패했습니다.');
        return;
      }
      await refreshDetail(formData.id);
    } catch {
      setFormError('취소 중 오류가 발생했습니다.');
    }
  };

  /* ── DELIVER item ── */
  const handleDeliverItem = async (itemId) => {
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}/items/${itemId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '납품 처리에 실패했습니다.');
        return;
      }
      await refreshDetail(formData.id);
    } catch {
      setFormError('납품 처리 중 오류가 발생했습니다.');
    }
  };

  /* ── RETURN item ── */
  const handleReturnItem = async (itemId) => {
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}/items/${itemId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '반품 처리에 실패했습니다.');
        return;
      }
      await refreshDetail(formData.id);
    } catch {
      setFormError('반품 처리 중 오류가 발생했습니다.');
    }
  };

  const handleExcelDownload = async () => {
    const q = new URLSearchParams();
    if (search.supplierName.trim()) q.set('supplierName', search.supplierName.trim());
    setError('');
    try {
      const res = await fetch(`${API}/export-excel?${q}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '엑셀 다운로드에 실패했습니다.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'delivery_requests.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  const renderCell = (v) => (v != null && v !== '' ? String(v) : '-');

  const allItemsRequested = (items) => {
    if (!items?.length) return false;
    return items.every((it) => it.item_status === 'requested');
  };

  /* ── Items form (add / edit) ── */
  const itemCardStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.75rem',
    marginBottom: '0.5rem',
    background: '#fafbfc',
  };
  const itemFieldRow = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  };
  const itemFieldInline = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  };
  const itemFieldLabel = {
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: '#64748b',
    flexShrink: 0,
    minWidth: '40px',
  };

  const renderItemsForm = () => (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.75rem',
        paddingBottom: '0.5rem',
        borderBottom: '2px solid #e2e8f0',
      }}>
        <strong style={{ fontSize: '0.9375rem', color: '#1e293b' }}>
          품목 목록 <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: '#64748b' }}>({(formData.items || []).length}건)</span>
        </strong>
        <button type="button" className={styles.btnPrimary} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8125rem' }} onClick={addItem}>
          + 품목 추가
        </button>
      </div>
      {(formData.items || []).map((item, idx) => (
        <div key={idx} style={itemCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>품목 {idx + 1}</span>
            <button
              type="button"
              className={styles.btnSmallDanger}
              onClick={() => removeItem(idx)}
            >
              삭제
            </button>
          </div>
          <div style={itemFieldRow}>
            <div style={itemFieldInline}>
              <span style={itemFieldLabel}>유형</span>
              <div style={{ flex: 1 }}>
                <SelectDropdown
                  options={[
                    { value: 'finished', label: '완제품' },
                    { value: 'semi', label: '반제품' },
                  ]}
                  value={item.item_type}
                  onChange={(val) => {
                    updateItem(idx, 'item_type', val);
                    updateItem(idx, 'product_id', '');
                  }}
                  placeholder="선택"
                />
              </div>
            </div>
            <div style={itemFieldInline}>
              <span style={itemFieldLabel}>제품</span>
              <div style={{ flex: 1 }}>
                <SelectDropdown
                  options={(item.item_type === 'finished' ? filteredFinishedProducts : filteredSemiProducts).map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.code})`,
                  }))}
                  value={item.product_id}
                  onChange={(val) => updateItem(idx, 'product_id', val)}
                  placeholder={formData.supplier_id ? '제품 선택' : '납품사를 먼저 선택하세요'}
                  disabled={!formData.supplier_id}
                />
              </div>
            </div>
            <div style={itemFieldInline}>
              <span style={itemFieldLabel}>수량</span>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                className={styles.input}
                style={{ flex: 1 }}
                required
              />
            </div>
          </div>
        </div>
      ))}
      {(!formData.items || formData.items.length === 0) && (
        <div style={{
          textAlign: 'center',
          padding: '1.5rem',
          color: '#94a3b8',
          fontSize: '0.875rem',
          border: '1px dashed #cbd5e1',
          borderRadius: '8px',
          background: '#f8fafc',
        }}>
          품목을 추가해 주세요.
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>완제품 입고요청/납품 관리</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          납품사 이름
          <input
            type="text"
            value={search.supplierName}
            onChange={(e) => setSearch((s) => ({ ...s, supplierName: e.target.value }))}
            className={styles.input}
            placeholder="검색"
          />
        </label>
        <button type="submit" className={styles.btnPrimary}>
          검색
        </button>
        <button type="button" className={styles.btnSecondary} onClick={handleResetSearch}>
          초기화
        </button>
      </form>

      <div className={styles.toolbar}>
        <button type="button" className={styles.btnPrimary} onClick={openAdd}>
          등록
        </button>
        <button type="button" className={styles.btnSecondary} onClick={handleExcelDownload}>
          엑셀 다운로드
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.listOptions}>
        <label>
          한번에 보기
          <select
            value={limit}
            onChange={(e) => {
              const val = Number(e.target.value);
              setLimit(val);
              setPage(1);
            }}
            aria-label="페이지당 건수"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}개
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className={styles.loading}>조회 중...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${dtStyles.fixedTable}`}>
            <colgroup>
              {isMobile ? (
                <>
                  <col style={{ width: '35%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '35%' }} />
                </>
              ) : (
                <>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '25%' }} />
                </>
              )}
            </colgroup>
            <thead>
              <tr>
                <th>납품사</th>
                {!isMobile && <th>납품 요청일</th>}
                <th>납품 희망일</th>
                {!isMobile && (
                  <>
                    <th>상태</th>
                    <th>품목 수</th>
                  </>
                )}
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={isMobile ? 3 : 6} className={styles.empty}>
                    조회된 납품 요청이 없습니다.
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => openView(row.id)}
                      >
                        {getSupplierName(row.supplier_id)}
                      </button>
                    </td>
                    {!isMobile && <td>{row.request_date ? formatDate(row.request_date) : '-'}</td>}
                    <td>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => openView(row.id)}
                      >
                        {row.desired_date ? formatDate(row.desired_date) : '-'}
                      </button>
                    </td>
                    {!isMobile && (
                      <>
                        <td>{STATUS_LABELS[row.status] || renderCell(row.status)}</td>
                        <td>{row.item_count != null ? String(row.item_count) : '-'}</td>
                      </>
                    )}
                    <td>
                      {row.status === 'requested' && (
                        <button
                          type="button"
                          className={styles.btnSmall}
                          onClick={() => loadDetailForEdit(row.id)}
                        >
                          수정
                        </button>
                      )}
                      {row.status === 'requested' && (
                        <button
                          type="button"
                          className={styles.btnSmallDanger}
                          onClick={() => handleCancel(row.id)}
                        >
                          납품 요청 취소
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

      {total > 0 && (() => {
        const totalPages = Math.ceil(total / limit) || 1;
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(totalPages, page + 2);
        const pages = [];
        for (let i = startPage; i <= endPage; i++) pages.push(i);
        if (startPage > 1) pages.unshift(1);
        if (endPage < totalPages) pages.push(totalPages);
        const uniq = [...new Set(pages)].sort((a, b) => a - b);
        return (
          <div className={styles.pagination}>
            <span className={styles.paginationTotal}>총 {total}건</span>
            <nav className={styles.pageNav} aria-label="페이지 네비게이션">
              <button type="button" className={styles.pageBtn} onClick={() => setPage(1)} disabled={page <= 1} aria-label="처음">처음</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="이전">이전</button>
              {uniq.map((p, i) => (
                <span key={p}>
                  {i > 0 && uniq[i - 1] !== p - 1 && <span style={{ padding: '0 0.25rem' }}>…</span>}
                  <button
                    type="button"
                    className={p === page ? `${styles.pageBtn} ${styles.pageBtnCurrent}` : styles.pageBtn}
                    onClick={() => setPage(p)}
                    aria-label={`${p}페이지`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                </span>
              ))}
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="다음">다음</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="마지막">마지막</button>
            </nav>
          </div>
        );
      })()}

      {formOpen && formData && (
        <div className={styles.modalOverlay} onClick={closeForm} role="presentation">
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-form-title"
          >
            <h2 id="request-form-title" className={styles.modalTitle}>
              {formMode === 'add' && '납품 요청 등록'}
              {formMode === 'view' && '납품 요청 상세'}
              {formMode === 'edit' && '납품 요청 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {/* ── ADD ── */}
            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <p className={styles.optionalHint}>수정일자·수정자는 자동 기록됩니다.</p>
                <label className={styles.label}>
                  납품사 <span className={styles.required}>(필수)</span>
                  <SelectDropdown
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    value={formData.supplier_id}
                    onChange={(val) => {
                      setFormData((f) => ({
                        ...f,
                        supplier_id: val,
                        items: f.items.map((it) => ({ ...it, product_id: '' })),
                      }));
                      fetchSupplierProducts(val);
                    }}
                    placeholder="선택"
                  />
                </label>
                <label className={styles.label}>
                  납품 요청일 <span className={styles.required}>(필수)</span>
                  <input
                    type="date"
                    value={formData.request_date}
                    onChange={(e) => setFormData((f) => ({ ...f, request_date: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  납품 희망일 <span className={styles.required}>(필수)</span>
                  <input
                    type="date"
                    value={formData.desired_date}
                    onChange={(e) => setFormData((f) => ({ ...f, desired_date: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                {renderItemsForm()}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={formSaving}>
                    {formSaving ? '등록 중...' : '등록'}
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>
                    취소
                  </button>
                </div>
              </form>
            )}

            {/* ── VIEW ── */}
            {formMode === 'view' && (
              <div className={styles.viewForm}>
                <dl className={styles.dl}>
                  <dt>납품사</dt>
                  <dd>{getSupplierName(formData.supplier_id)}</dd>
                  <dt>납품 요청일</dt>
                  <dd>{formData.request_date ? formatDate(formData.request_date) : '-'}</dd>
                  <dt>납품 희망일</dt>
                  <dd>{formData.desired_date ? formatDate(formData.desired_date) : '-'}</dd>
                  <dt>상태</dt>
                  <dd>{STATUS_LABELS[formData.status] || renderCell(formData.status)}</dd>
                  <dt>수정일자</dt>
                  <dd>{formData.updated_at ? formatDate(formData.updated_at) : '-'}</dd>
                  <dt>수정자</dt>
                  <dd>{renderCell(formData.updated_by)}</dd>
                </dl>

                {/* Items table */}
                <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9375rem' }}>품목</h3>
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${dtStyles.fixedTable}`}>
                    <thead>
                      <tr>
                        <th style={{ width: '12%' }}>유형</th>
                        <th style={{ width: '30%' }}>제품명</th>
                        <th style={{ width: '13%' }}>수량</th>
                        <th style={{ width: '15%' }}>납품 상태</th>
                        <th style={{ width: '30%' }}>기능</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(formData.items || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className={styles.empty}>품목이 없습니다.</td>
                        </tr>
                      ) : (
                        (formData.items || []).map((item) => (
                          <tr key={item.id}>
                            <td>{item.item_type === 'finished' ? '완제품' : '반제품'}</td>
                            <td>{getProductName(item.item_type, item.product_id)}</td>
                            <td>{item.quantity != null ? String(item.quantity) : '-'}</td>
                            <td>{ITEM_STATUS_LABELS[item.item_status] || renderCell(item.item_status)}</td>
                            <td>
                              {formData.status !== 'cancelled' && (
                                <>
                                  {item.item_status === 'requested' && (
                                    <button
                                      type="button"
                                      className={styles.btnSmall}
                                      onClick={() => handleDeliverItem(item.id)}
                                    >
                                      납품 완료
                                    </button>
                                  )}
                                  {item.item_status === 'delivered' && (
                                    <button
                                      type="button"
                                      className={styles.btnSmallDanger}
                                      onClick={() => handleReturnItem(item.id)}
                                    >
                                      반품
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={styles.formActions}>
                  {allItemsRequested(formData.items) && formData.status !== 'cancelled' && (
                    <button type="button" className={styles.btnPrimary} onClick={() => openEdit(formData)}>
                      수정
                    </button>
                  )}
                  {allItemsRequested(formData.items) && formData.status !== 'cancelled' && (
                    <button type="button" className={styles.btnSmallDanger} onClick={handleCancelFromDetail}>
                      납품 요청 취소
                    </button>
                  )}
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>
                    닫기
                  </button>
                </div>
              </div>
            )}

            {/* ── EDIT ── */}
            {formMode === 'edit' && (
              <form onSubmit={handleSubmitEdit} className={styles.form}>
                <label className={styles.label}>
                  납품사 <span className={styles.required}>*</span>
                  <SelectDropdown
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    value={formData.supplier_id}
                    onChange={(val) => {
                      setFormData((f) => ({
                        ...f,
                        supplier_id: val,
                        items: f.items.map((it) => ({ ...it, product_id: '' })),
                      }));
                      fetchSupplierProducts(val);
                    }}
                    placeholder="선택"
                  />
                </label>
                <label className={styles.label}>
                  납품 요청일 <span className={styles.required}>*</span>
                  <input
                    type="date"
                    value={formData.request_date}
                    onChange={(e) => setFormData((f) => ({ ...f, request_date: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  납품 희망일 <span className={styles.required}>*</span>
                  <input
                    type="date"
                    value={formData.desired_date}
                    onChange={(e) => setFormData((f) => ({ ...f, desired_date: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                {renderItemsForm()}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={formSaving}>
                    {formSaving ? '수정 중...' : '수정'}
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>
                    취소
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DeliveryRequest;
