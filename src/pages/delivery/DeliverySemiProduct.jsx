import React, { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useAuth } from '../../context/AuthContext';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/delivery-semi-products';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const PAGE_SIZES = [10, 15, 20, 50, 100];

function DeliverySemiProduct() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ name: '', code: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const userName = user?.name || user?.loginId || '';

  const LIST_FETCH_TIMEOUT_MS = 15000;

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
      if (search.code.trim()) q.set('code', search.code.trim());
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
  }, [page, limit, search.name, search.code]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };
  const handleResetSearch = () => {
    setSearch({ name: '', code: '' });
    setPage(1);
  };

  const openAdd = () => {
    setFormMode('add');
    setFormData({
      name: '',
      code: '',
      color_code: '',
      color_name: '',
      thickness: '',
      width: '',
      length: '',
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
      code: row.code ?? '',
      color_code: row.color_code ?? '',
      color_name: row.color_name ?? '',
      thickness: row.thickness ?? '',
      width: row.width ?? '',
      length: row.length ?? '',
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
      setFormError('반제품 이름은 필수입니다.');
      return;
    }
    if (!formData.code?.trim()) {
      setFormError('반제품 코드는 필수입니다.');
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
          code: formData.code.trim(),
          color_code: formData.color_code?.trim() || null,
          color_name: formData.color_name?.trim() || null,
          thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
          width: formData.width !== '' ? Number(formData.width) : null,
          length: formData.length !== '' ? Number(formData.length) : null,
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
      setFormError('반제품 이름은 필수입니다.');
      return;
    }
    if (!formData.code?.trim()) {
      setFormError('반제품 코드는 필수입니다.');
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
          code: formData.code.trim(),
          color_code: formData.color_code?.trim() || null,
          color_name: formData.color_name?.trim() || null,
          thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
          width: formData.width !== '' ? Number(formData.width) : null,
          length: formData.length !== '' ? Number(formData.length) : null,
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
    if (!window.confirm(`"${name}" 반제품을 삭제하시겠습니까?`)) return;
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
    if (search.code.trim()) q.set('code', search.code.trim());
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
      a.download = 'delivery_semi_products.csv';
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

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>반제품 정보</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          반제품 이름
          <input
            type="text"
            value={search.name}
            onChange={(e) => setSearch((s) => ({ ...s, name: e.target.value }))}
            className={styles.input}
            placeholder="검색"
          />
        </label>
        <label className={styles.searchLabel}>
          반제품 코드
          <input
            type="text"
            value={search.code}
            onChange={(e) => setSearch((s) => ({ ...s, code: e.target.value }))}
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
                <th>반제품 이름</th>
                <th>반제품 코드</th>
                {!isMobile && (
                  <>
                    <th>색상 이름</th>
                    <th>두께</th>
                    <th>폭</th>
                    <th>길이</th>
                  </>
                )}
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={isMobile ? 3 : 7} className={styles.empty}>
                    조회된 반제품이 없습니다.
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
                    <td>{renderCell(row.code)}</td>
                    {!isMobile && (
                      <>
                        <td>{renderCell(row.color_name)}</td>
                        <td>{renderCell(row.thickness)}</td>
                        <td>{renderCell(row.width)}</td>
                        <td>{renderCell(row.length)}</td>
                      </>
                    )}
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
            aria-labelledby="semi-product-form-title"
          >
            <h2 id="semi-product-form-title" className={styles.modalTitle}>
              {formMode === 'add' && '반제품 등록'}
              {formMode === 'view' && '반제품 보기'}
              {formMode === 'edit' && '반제품 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <p className={styles.optionalHint}>수정일자·수정자는 자동 기록됩니다.</p>
                <label className={styles.label}>
                  반제품 이름 <span className={styles.required}>(필수)</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  반제품 코드 <span className={styles.required}>(필수)</span>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  색상 코드 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.color_code}
                    onChange={(e) => setFormData((f) => ({ ...f, color_code: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  색상 이름 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.color_name}
                    onChange={(e) => setFormData((f) => ({ ...f, color_name: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  두께 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="any"
                    value={formData.thickness}
                    onChange={(e) => setFormData((f) => ({ ...f, thickness: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  폭 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="any"
                    value={formData.width}
                    onChange={(e) => setFormData((f) => ({ ...f, width: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  길이 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="any"
                    value={formData.length}
                    onChange={(e) => setFormData((f) => ({ ...f, length: e.target.value }))}
                    className={styles.input}
                  />
                </label>
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
                  <dt>반제품 이름</dt>
                  <dd>{renderCell(formData.name)}</dd>
                  <dt>반제품 코드</dt>
                  <dd>{renderCell(formData.code)}</dd>
                  <dt>색상 코드</dt>
                  <dd>{renderCell(formData.color_code)}</dd>
                  <dt>색상 이름</dt>
                  <dd>{renderCell(formData.color_name)}</dd>
                  <dt>두께</dt>
                  <dd>{renderCell(formData.thickness)}</dd>
                  <dt>폭</dt>
                  <dd>{renderCell(formData.width)}</dd>
                  <dt>길이</dt>
                  <dd>{renderCell(formData.length)}</dd>
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
                  반제품 이름 <span className={styles.required}>*</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  반제품 코드 <span className={styles.required}>*</span>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  색상 코드
                  <input
                    type="text"
                    value={formData.color_code}
                    onChange={(e) => setFormData((f) => ({ ...f, color_code: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  색상 이름
                  <input
                    type="text"
                    value={formData.color_name}
                    onChange={(e) => setFormData((f) => ({ ...f, color_name: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  두께
                  <input
                    type="number"
                    step="any"
                    value={formData.thickness}
                    onChange={(e) => setFormData((f) => ({ ...f, thickness: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  폭
                  <input
                    type="number"
                    step="any"
                    value={formData.width}
                    onChange={(e) => setFormData((f) => ({ ...f, width: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  길이
                  <input
                    type="number"
                    step="any"
                    value={formData.length}
                    onChange={(e) => setFormData((f) => ({ ...f, length: e.target.value }))}
                    className={styles.input}
                  />
                </label>
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

export default DeliverySemiProduct;
