import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import styles from './MaterialInfo.module.css';

const API = '/api/material';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

/** 두께/폭/길이 등 mm 단위 숫자 표기: 정수만 (예: 20.0000 → "20mm") */
function formatMm(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return '-';
  return `${Math.round(n)}mm`;
}

/** 원자재 수량·안전재고 등 숫자 표기: 정수만 */
function formatQty(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return '-';
  return String(Math.round(n));
}

const PAGE_SIZES = [10, 15, 20, 50, 100];

function MaterialInfo() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [types, setTypes] = useState([]);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({
    kindId: '',
    name: '',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add'); // 'add' | 'view' | 'edit'
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
      if (search.kindId) q.set('kindId', String(search.kindId));
      if (search.name.trim()) q.set('name', search.name.trim());
      const res = await fetch(`${API}?${q}`, { signal: ac.signal });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || '목록 조회에 실패했습니다.';
        setError(res.status === 500 ? `${msg} (백엔드·DB 연결 확인)` : msg);
        return;
      }
      setList(data.list || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setError('응답이 지연되고 있습니다. 백엔드 서버(포트 3000)와 DB가 실행 중인지 확인해 주세요.');
      } else {
        setError('목록 조회 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, search.kindId, search.name]);

  useEffect(() => {
    fetch(`${API}/types`)
      .then((r) => r.json())
      .then((d) => setTypes(d.list || []))
      .catch(() => setTypes([]));
  }, []); // loadTypes not in deps to run only on mount

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 등록 모달이 열린 뒤 types가 로드되면 첫 번째 종류 선택
  useEffect(() => {
    if (formOpen && formMode === 'add' && types.length > 0) {
      setFormData((f) => (f && !f.kind_id ? { ...f, kind_id: types[0].id } : f));
    }
  }, [formOpen, formMode, types]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };
  const initialSearch = { kindId: '', name: '' };
  const handleResetSearch = () => {
    setSearch(initialSearch);
    setPage(1);
  };

  const loadTypes = useCallback(() => {
    fetch(`${API}/types`)
      .then((r) => r.json())
      .then((d) => setTypes(d.list || []))
      .catch(() => setTypes([]));
  }, []);

  const openAdd = () => {
    if (types.length === 0) loadTypes();
    setFormMode('add');
    const firstTypeId = types.length ? types[0].id : '';
    setFormData({
      kind_id: firstTypeId,
      name: '',
      color: '',
      thickness: '',
      width: '',
      length: '',
      supplier_safety_stock: 0,
      bnk_warehouse_safety_stock: 0,
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
      setFormData({
        ...data,
        thickness: data.thickness != null ? data.thickness : '',
        width: data.width != null ? data.width : '',
        length: data.length != null ? data.length : '',
      });
      setFormOpen(true);
    } catch {
      setFormError('조회 중 오류가 발생했습니다.');
    }
  };

  const openEdit = (row) => {
    setFormMode('edit');
    setFormData({
      id: row.id,
      kind_id: row.kind_id,
      kind: row.kind,
      name: row.name,
      color: row.color,
      thickness: row.thickness != null ? row.thickness : '',
      width: row.width != null ? row.width : '',
      length: row.length != null ? row.length : '',
      supplier_safety_stock: row.supplier_safety_stock,
      bnk_warehouse_safety_stock: row.bnk_warehouse_safety_stock,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    });
    setFormError('');
    setFormOpen(true);
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
      setFormError('등록자는 필수입니다. 로그인 후 등록해 주세요.');
      return;
    }
    const kindIdNum = formData.kind_id ? Number(formData.kind_id) : 0;
    if (!kindIdNum || !formData.name?.trim()) {
      setFormError('원자재 종류와 이름은 필수입니다.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind_id: kindIdNum,
          name: formData.name.trim(),
          color: formData.color?.trim() || null,
          thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
          width: formData.width !== '' ? Number(formData.width) : null,
          length: formData.length !== '' ? Number(formData.length) : null,
          supplier_safety_stock: Number(formData.supplier_safety_stock) || 0,
          bnk_warehouse_safety_stock: Number(formData.bnk_warehouse_safety_stock) || 0,
          createdBy: userName,
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
      setFormError('원자재 이름은 필수입니다.');
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
          supplier_safety_stock: Number(formData.supplier_safety_stock) || 0,
          bnk_warehouse_safety_stock: Number(formData.bnk_warehouse_safety_stock) || 0,
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
    if (!window.confirm(`"${name}" 원자재를 삭제하시겠습니까?`)) return;
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
    if (search.kindId) q.set('kindId', String(search.kindId));
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
      a.download = 'raw_materials.csv';
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

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>원자재 정보</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          원자재 종류
          <select
            value={String(search.kindId ?? '')}
            onChange={(e) => setSearch((s) => ({ ...s, kindId: e.target.value }))}
            className={styles.input}
          >
            <option value="">전체</option>
            {types.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.searchLabel}>
          원자재 이름
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
                <th>원자재 종류</th>
                <th>원자재 이름</th>
                {!isMobile && (
                  <>
                    <th>색상</th>
                    <th>두께 (mm)</th>
                    <th>폭 (mm)</th>
                    <th>길이 (mm)</th>
                    <th>원자재 업체 안전재고</th>
                    <th>비엔케이 창고 안전재고</th>
                    <th>수정일자</th>
                    <th>수정자</th>
                  </>
                )}
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={isMobile ? 3 : 11} className={styles.empty}>
                    조회된 원자재가 없습니다.
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id}>
                    <td>{renderCell(row.kind)}</td>
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
                        <td>{renderCell(row.color)}</td>
                        <td>{formatMm(row.thickness)}</td>
                        <td>{formatMm(row.width)}</td>
                        <td>{formatMm(row.length)}</td>
                        <td>{formatQty(row.supplier_safety_stock)}</td>
                        <td>{formatQty(row.bnk_warehouse_safety_stock)}</td>
                        <td>{row.updated_at ? formatDate(row.updated_at) : '-'}</td>
                        <td>{renderCell(row.updated_by)}</td>
                      </>
                    )}
                    <td>
                      <button
                        type="button"
                        className={styles.btnSmall}
                        onClick={() => openEdit(row)}
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
            aria-labelledby="form-title"
          >
            <h2 id="form-title" className={styles.modalTitle}>
              {formMode === 'add' && '원자재 등록'}
              {formMode === 'view' && '원자재 보기'}
              {formMode === 'edit' && '원자재 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <label className={styles.label}>
                  원자재 종류 <span className={styles.required}>(필수)</span>
                  <select
                    value={String(formData.kind_id ?? '')}
                    onChange={(e) => setFormData((f) => ({ ...f, kind_id: e.target.value ? Number(e.target.value) : '' }))}
                    className={styles.input}
                    required
                  >
                    {types.length === 0 ? (
                      <option value="" disabled>종류를 불러오는 중...</option>
                    ) : (
                      <>
                        <option value="">선택</option>
                        {types.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </label>
                <label className={styles.label}>
                  원자재 이름 <span className={styles.required}>(필수)</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <p className={styles.optionalHint}>등록일자·등록자·수정일자·수정자는 자동 기록됩니다.</p>
                <label className={styles.label}>
                  색상 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  두께 (mm) <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="any"
                    value={formData.thickness}
                    onChange={(e) => setFormData((f) => ({ ...f, thickness: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  폭 (mm) <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="any"
                    value={formData.width}
                    onChange={(e) => setFormData((f) => ({ ...f, width: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  길이 (mm) <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="any"
                    value={formData.length}
                    onChange={(e) => setFormData((f) => ({ ...f, length: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  원자재 업체 안전재고 수량 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    min="0"
                    value={formData.supplier_safety_stock}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, supplier_safety_stock: e.target.value }))
                    }
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  비엔케이 창고 안전재고 수량 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    min="0"
                    value={formData.bnk_warehouse_safety_stock}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, bnk_warehouse_safety_stock: e.target.value }))
                    }
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
                  <dt>원자재 종류</dt>
                  <dd>{renderCell(formData.kind ?? (types.find((t) => t.id === formData.kind_id)?.name))}</dd>
                  <dt>원자재 이름</dt>
                  <dd>{renderCell(formData.name)}</dd>
                  <dt>색상</dt>
                  <dd>{renderCell(formData.color)}</dd>
                  <dt>두께 (mm)</dt>
                  <dd>{formatMm(formData.thickness)}</dd>
                  <dt>폭 (mm)</dt>
                  <dd>{formatMm(formData.width)}</dd>
                  <dt>길이 (mm)</dt>
                  <dd>{formatMm(formData.length)}</dd>
                  <dt>원자재 업체 안전재고 수량</dt>
                  <dd>{formatQty(formData.supplier_safety_stock)}</dd>
                  <dt>비엔케이 창고 안전재고 수량</dt>
                  <dd>{formatQty(formData.bnk_warehouse_safety_stock)}</dd>
                  <dt>수정일자</dt>
                  <dd>{formData.updated_at ? formatDate(formData.updated_at) : '-'}</dd>
                  <dt>수정자</dt>
                  <dd>{renderCell(formData.updated_by)}</dd>
                </dl>
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => openEdit(formData)}
                  >
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
                <p className={styles.editHint}>원자재 이름, 안전재고 수량만 수정 가능합니다.</p>
                <div className={styles.viewForm}>
                  <dl className={styles.dl}>
                    <dt>원자재 종류</dt>
                    <dd>{renderCell(formData.kind ?? (types.find((t) => t.id === formData.kind_id)?.name))}</dd>
                    <dt>색상</dt>
                    <dd>{renderCell(formData.color)}</dd>
                    <dt>두께 (mm)</dt>
                    <dd>{formatMm(formData.thickness)}</dd>
                    <dt>폭 (mm)</dt>
                    <dd>{formatMm(formData.width)}</dd>
                    <dt>길이 (mm)</dt>
                    <dd>{formatMm(formData.length)}</dd>
                  </dl>
                </div>
                <label className={styles.label}>
                  원자재 이름 <span className={styles.required}>*</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <label className={styles.label}>
                  원자재 업체 안전재고 수량
                  <input
                    type="number"
                    min="0"
                    value={formData.supplier_safety_stock}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, supplier_safety_stock: e.target.value }))
                    }
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  비엔케이 창고 안전재고 수량
                  <input
                    type="number"
                    min="0"
                    value={formData.bnk_warehouse_safety_stock}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, bnk_warehouse_safety_stock: e.target.value }))
                    }
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

export default MaterialInfo;
