import React, { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useAuth } from '../../context/AuthContext';
import { useDaumPostcode } from '../../hooks/useDaumPostcode';
import ItemSelectPopup from '../../components/ItemSelectPopup';
import formatPhone, { formatPhoneInput, stripPhone } from '../../utils/formatPhone';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/delivery-suppliers';
const FINISHED_PRODUCT_API = '/api/delivery-finished-products';
const SEMI_PRODUCT_API = '/api/delivery-semi-products';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const PAGE_SIZES = [10, 15, 20, 50, 100];

function DeliverySupplier() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [semiProducts, setSemiProducts] = useState([]);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ name: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [finishedPopupOpen, setFinishedPopupOpen] = useState(false);
  const [semiPopupOpen, setSemiPopupOpen] = useState(false);

  const userName = user?.name || user?.loginId || '';
  const openDaumPostcode = useDaumPostcode();

  const LIST_FETCH_TIMEOUT_MS = 15000;

  const handleAddressSearch = useCallback(() => {
    openDaumPostcode((data) => {
      if (data.error) {
        setFormError(data.error);
        return;
      }
      setFormError('');
      setFormData((f) => ({
        ...f,
        postal_code: data.zonecode || '',
        address: data.address || '',
      }));
    });
  }, [openDaumPostcode]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), LIST_FETCH_TIMEOUT_MS);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search.name.trim()) q.set('name', search.name.trim());
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
  }, [page, limit, search.name]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const q = new URLSearchParams({ limit: '500' });
    fetch(`${FINISHED_PRODUCT_API}?${q}`)
      .then((r) => r.json())
      .then((d) => setFinishedProducts(d.list || []))
      .catch(() => setFinishedProducts([]));
    fetch(`${SEMI_PRODUCT_API}?${q}`)
      .then((r) => r.json())
      .then((d) => setSemiProducts(d.list || []))
      .catch(() => setSemiProducts([]));
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };
  const handleResetSearch = () => {
    setSearch({ name: '' });
    setPage(1);
  };

  const openAdd = () => {
    setFormMode('add');
    setFormData({
      name: '',
      address: '',
      postal_code: '',
      address_detail: '',
      contact: '',
      manager_name: '',
      manager_contact: '',
      manager_email: '',
      finished_product_ids: [],
      semi_product_ids: [],
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

  const openEdit = (row) => {
    setFormMode('edit');
    setFormData({
      id: row.id,
      name: row.name ?? '',
      address: row.address ?? '',
      postal_code: row.postal_code ?? '',
      address_detail: row.address_detail ?? '',
      contact: row.contact ?? '',
      manager_name: row.manager_name ?? '',
      manager_contact: row.manager_contact ?? '',
      manager_email: row.manager_email ?? '',
      finished_product_ids: row.finished_product_ids ?? [],
      semi_product_ids: row.semi_product_ids ?? [],
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    });
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

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName || String(userName).trim() === '') {
      setFormError('수정자는 필수입니다. 로그인 후 등록해 주세요.');
      return;
    }
    if (!formData.name?.trim()) {
      setFormError('납품처 이름은 필수입니다.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          address: formData.address?.trim() || null,
          postal_code: formData.postal_code?.trim() || null,
          address_detail: formData.address_detail?.trim() || null,
          contact: stripPhone(formData.contact),
          manager_name: formData.manager_name?.trim() || null,
          manager_contact: stripPhone(formData.manager_contact),
          manager_email: formData.manager_email?.trim() || null,
          finished_product_ids: Array.isArray(formData.finished_product_ids) ? formData.finished_product_ids : [],
          semi_product_ids: Array.isArray(formData.semi_product_ids) ? formData.semi_product_ids : [],
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

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      setFormError('납품처 이름은 필수입니다.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          address: formData.address?.trim() || null,
          postal_code: formData.postal_code?.trim() || null,
          address_detail: formData.address_detail?.trim() || null,
          contact: stripPhone(formData.contact),
          manager_name: formData.manager_name?.trim() || null,
          manager_contact: stripPhone(formData.manager_contact),
          manager_email: formData.manager_email?.trim() || null,
          finished_product_ids: Array.isArray(formData.finished_product_ids) ? formData.finished_product_ids : [],
          semi_product_ids: Array.isArray(formData.semi_product_ids) ? formData.semi_product_ids : [],
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

  const handleDelete = async (id, name) => {
    if (!window.confirm(`"${name}" 납품사를 삭제하시겠습니까?`)) return;
    setError('');
    try {
      const res = await fetch(`${API}/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '삭제에 실패했습니다.');
        return;
      }
      fetchList();
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleExcelDownload = async () => {
    const q = new URLSearchParams();
    if (search.name.trim()) q.set('name', search.name.trim());
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
      a.download = 'delivery_suppliers.csv';
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
  const formatQty = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? String(Math.round(Number(v))) : '-');

  const getSelectedProductLabel = (ids, products) => {
    if (!ids?.length) return '선택';
    const names = ids
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => `${p.name} (${p.code})`)
      .join(', ');
    return names || `${ids.length}개 선택됨`;
  };

  const renderProductPopup = (type) => {
    const isFinished = type === 'finished';
    const products = isFinished ? finishedProducts : semiProducts;
    const fieldKey = isFinished ? 'finished_product_ids' : 'semi_product_ids';
    const label = isFinished ? '납품 완제품' : '납품 반제품';
    const emptyText = isFinished ? '등록된 완제품이 없습니다.' : '등록된 반제품이 없습니다.';
    const popupOpen = isFinished ? finishedPopupOpen : semiPopupOpen;
    const setPopupOpen = isFinished ? setFinishedPopupOpen : setSemiPopupOpen;

    return (
      <>
        <label className={styles.label}>
          {label} <span className={styles.optional}>(선택)</span>
          <div>
            <button
              type="button"
              className={styles.input}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => setPopupOpen(true)}
              title={getSelectedProductLabel(formData[fieldKey] || [], products)}
            >
              {getSelectedProductLabel(formData[fieldKey] || [], products)}
            </button>
          </div>
        </label>
        <ItemSelectPopup
          open={popupOpen}
          onClose={() => setPopupOpen(false)}
          items={products}
          selectedIds={formData[fieldKey] || []}
          onConfirm={(ids) => setFormData((f) => ({ ...f, [fieldKey]: ids }))}
          title={`${label} 선택`}
          searchPlaceholder="이름 또는 코드로 검색"
          emptyText={emptyText}
          labelFn={(p) => `${p.name} (${p.code})`}
        />
      </>
    );
  };

  const getProductNames = (ids, products) => {
    if (!ids?.length) return '-';
    const names = ids
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => `${p.name} (${p.code})`)
      .join(', ');
    return names || '-';
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>납품사 정보</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          납품사 이름
          <input
            type="text"
            value={search.name}
            onChange={(e) => setSearch((s) => ({ ...s, name: e.target.value }))}
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
          <table className={styles.table}>
            <thead>
              <tr>
                <th>납품처 이름</th>
                {!isMobile && (
                  <>
                    <th>주소</th>
                    <th>담당자</th>
                  </>
                )}
                <th>담당자 연락처</th>
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={isMobile ? 3 : 5} className={styles.empty}>
                    조회된 납품사가 없습니다.
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
                        {renderCell(row.name)}
                      </button>
                    </td>
                    {!isMobile && (
                      <>
                        <td>{renderCell(row.address)}</td>
                        <td>{renderCell(row.manager_name)}</td>
                      </>
                    )}
                    <td>{formatPhone(row.manager_contact) || '-'}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.btnSmall}
                        onClick={() => loadDetailForEdit(row.id)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className={styles.btnSmallDanger}
                        onClick={() => handleDelete(row.id, row.name)}
                      >
                        삭제
                      </button>
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
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage(1)}
                disabled={page <= 1}
                aria-label="처음"
              >
                처음
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="이전"
              >
                이전
              </button>
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
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="다음"
              >
                다음
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                aria-label="마지막"
              >
                마지막
              </button>
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
            aria-labelledby="delivery-supplier-form-title"
          >
            <h2 id="delivery-supplier-form-title" className={styles.modalTitle}>
              {formMode === 'add' && '납품사 등록'}
              {formMode === 'view' && '납품사 보기'}
              {formMode === 'edit' && '납품사 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <p className={styles.optionalHint}>수정일자·수정자는 자동 기록됩니다.</p>
                <label className={styles.label}>
                  납품처 이름 <span className={styles.required}>(필수)</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  우편번호
                  <input
                    type="text"
                    value={formData.postal_code ?? ''}
                    readOnly
                    className={styles.input}
                    placeholder="주소 검색으로 자동 입력"
                  />
                </label>
                <label className={styles.label}>
                  주소 <span className={styles.optional}>(선택)</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      value={formData.address ?? ''}
                      readOnly
                      className={styles.input}
                      placeholder="주소 검색으로 자동 입력"
                      style={{ flex: 1 }}
                    />
                    <button type="button" className={styles.btnSecondary} onClick={handleAddressSearch}>
                      주소 검색
                    </button>
                  </div>
                </label>
                <label className={styles.label}>
                  상세 주소 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.address_detail ?? ''}
                    onChange={(e) => setFormData((f) => ({ ...f, address_detail: e.target.value }))}
                    className={styles.input}
                    placeholder="동, 호수 등"
                  />
                </label>
                <label className={styles.label}>
                  연락처 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formatPhoneInput(formData.contact)}
                    onChange={(e) => setFormData((f) => ({ ...f, contact: e.target.value.replace(/[^0-9]/g, '') }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  담당자 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.manager_name}
                    onChange={(e) => setFormData((f) => ({ ...f, manager_name: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  담당자 연락처 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formatPhoneInput(formData.manager_contact)}
                    onChange={(e) => setFormData((f) => ({ ...f, manager_contact: e.target.value.replace(/[^0-9]/g, '') }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  담당자 email <span className={styles.optional}>(선택)</span>
                  <input
                    type="email"
                    value={formData.manager_email}
                    onChange={(e) => setFormData((f) => ({ ...f, manager_email: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                {renderProductPopup('finished')}
                {renderProductPopup('semi')}
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

            {formMode === 'view' && (
              <div className={styles.viewForm}>
                <dl className={styles.dl}>
                  <dt>납품처 이름</dt>
                  <dd>{renderCell(formData.name)}</dd>
                  <dt>우편번호</dt>
                  <dd>{renderCell(formData.postal_code)}</dd>
                  <dt>주소</dt>
                  <dd>{renderCell(formData.address)}</dd>
                  <dt>상세 주소</dt>
                  <dd>{renderCell(formData.address_detail)}</dd>
                  <dt>연락처</dt>
                  <dd>{formatPhone(formData.contact) || '-'}</dd>
                  <dt>담당자</dt>
                  <dd>{renderCell(formData.manager_name)}</dd>
                  <dt>담당자 연락처</dt>
                  <dd>{formatPhone(formData.manager_contact) || '-'}</dd>
                  <dt>담당자 email</dt>
                  <dd>{renderCell(formData.manager_email)}</dd>
                  <dt>납품 완제품</dt>
                  <dd>{getProductNames(formData.finished_product_ids, finishedProducts)}</dd>
                  <dt>납품 반제품</dt>
                  <dd>{getProductNames(formData.semi_product_ids, semiProducts)}</dd>
                  <dt>수정일자</dt>
                  <dd>{formData.updated_at ? formatDate(formData.updated_at) : '-'}</dd>
                  <dt>수정자</dt>
                  <dd>{renderCell(formData.updated_by)}</dd>
                </dl>
                <div className={styles.formActions}>
                  <button type="button" className={styles.btnPrimary} onClick={() => openEdit(formData)}>
                    수정
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>
                    닫기
                  </button>
                </div>
              </div>
            )}

            {formMode === 'edit' && (
              <form onSubmit={handleSubmitEdit} className={styles.form}>
                <label className={styles.label}>
                  납품처 이름 <span className={styles.required}>*</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  우편번호
                  <input
                    type="text"
                    value={formData.postal_code ?? ''}
                    readOnly
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  주소
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      value={formData.address ?? ''}
                      onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                      className={styles.input}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className={styles.btnSecondary} onClick={handleAddressSearch}>
                      주소 검색
                    </button>
                  </div>
                </label>
                <label className={styles.label}>
                  상세 주소
                  <input
                    type="text"
                    value={formData.address_detail ?? ''}
                    onChange={(e) => setFormData((f) => ({ ...f, address_detail: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  연락처
                  <input
                    type="text"
                    value={formatPhoneInput(formData.contact)}
                    onChange={(e) => setFormData((f) => ({ ...f, contact: e.target.value.replace(/[^0-9]/g, '') }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  담당자
                  <input
                    type="text"
                    value={formData.manager_name}
                    onChange={(e) => setFormData((f) => ({ ...f, manager_name: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  담당자 연락처
                  <input
                    type="text"
                    value={formatPhoneInput(formData.manager_contact)}
                    onChange={(e) => setFormData((f) => ({ ...f, manager_contact: e.target.value.replace(/[^0-9]/g, '') }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  담당자 email
                  <input
                    type="email"
                    value={formData.manager_email ?? ''}
                    onChange={(e) => setFormData((f) => ({ ...f, manager_email: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                {renderProductPopup('finished')}
                {renderProductPopup('semi')}
                <div className={styles.viewForm}>
                  <dl className={styles.dl}>
                    <dt>수정일자</dt>
                    <dd>{formData.updated_at ? formatDate(formData.updated_at) : '-'}</dd>
                    <dt>수정자</dt>
                    <dd>{renderCell(formData.updated_by)}</dd>
                  </dl>
                </div>
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

export default DeliverySupplier;
