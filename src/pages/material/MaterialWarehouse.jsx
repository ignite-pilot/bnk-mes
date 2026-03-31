import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useDaumPostcode } from '../../hooks/useDaumPostcode';
import RawMaterialSelectPopup from '../../components/RawMaterialSelectPopup';
import styles from './MaterialInfo.module.css';

const API = '/api/material-warehouses';
const SUPPLIER_API = '/api/material-suppliers';
const MATERIAL_API = '/api/material';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const PAGE_SIZES = [10, 15, 20, 50, 100];

/** 선택된 원자재 ID 배열과 전체 원자재 목록으로 표시 문자열 반환 */
function getSelectedMaterialLabel(ids, materials) {
  if (!ids?.length) return '원자재 선택';
  const names = ids
    .map((id) => materials.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => (m.kind ? `${m.kind} / ${m.name}` : m.name || '').trim())
    .join(', ');
  return names || `${ids.length}개 선택됨`;
}

function MaterialWarehouse() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({
    supplierId: '',
    warehouseName: '',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [rawMaterialPopupOpen, setRawMaterialPopupOpen] = useState(false);
  /** 선택한 업체의 제공 원자재 ID 목록 (업체 선택 시 로드, null이면 미로드) */
  const [supplierMaterialIds, setSupplierMaterialIds] = useState(null);

  const userName = user?.name || user?.loginId || '';
  const openDaumPostcode = useDaumPostcode();

  /** 업체 선택 시 해당 업체의 제공 원자재 목록 로드 */
  useEffect(() => {
    if (!formOpen || !formData?.supplier_id) {
      setSupplierMaterialIds(null);
      return;
    }
    const sid = formData.supplier_id;
    fetch(`${SUPPLIER_API}/${sid}`)
      .then((r) => r.json())
      .then((d) => setSupplierMaterialIds(Array.isArray(d.raw_material_ids) ? d.raw_material_ids : []))
      .catch(() => setSupplierMaterialIds([]));
  }, [formOpen, formData?.supplier_id]);

  /** 보관 원자재 선택 시 노출할 원자재: 선택한 업체에서 제공하는 원자재만 (업체 미선택 시 빈 목록) */
  const materialsForWarehouse =
    formData?.supplier_id && Array.isArray(supplierMaterialIds)
      ? materials.filter((m) => supplierMaterialIds.includes(m.id))
      : formData?.supplier_id
        ? [] /* 로딩 중 */
        : [];

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
      if (search.supplierId) q.set('supplierId', search.supplierId);
      if (search.warehouseName.trim()) q.set('warehouseName', search.warehouseName.trim());
      const res = await fetch(`${API}?${q}`, { signal: ac.signal });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || '목록 조회에 실패했습니다.';
        setError(data.detail ? `${msg} (${data.detail})` : msg);
        return;
      }
      setList(data.list || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setError('응답이 지연되고 있습니다. 백엔드 서버와 DB를 확인해 주세요.');
      } else {
        setError('목록 조회 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, search.supplierId, search.warehouseName]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /** 드롭다운용 공급 업체 목록: 기간 조건 없이 전체 조회 */
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
  const initialSearch = { supplierId: '', warehouseName: '' };
  const handleResetSearch = () => {
    setSearch(initialSearch);
    setPage(1);
  };

  const openAdd = () => {
    setFormMode('add');
    setFormData({
      supplier_id: '',
      name: '',
      address: '',
      postal_code: '',
      address_detail: '',
      raw_material_ids: [],
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
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      name: row.name,
      address: row.address ?? '',
      postal_code: row.postal_code ?? '',
      address_detail: row.address_detail ?? '',
      raw_material_ids: row.raw_material_ids ?? [],
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
    setSupplierMaterialIds(null);
    fetchList();
  };

  const handleSupplierChangeAdd = (newId) => {
    setFormData((f) => ({ ...f, supplier_id: newId, raw_material_ids: [] }));
  };

  const handleSupplierChangeEdit = (newId) => {
    if ((formData.raw_material_ids || []).length > 0 && !window.confirm('업체를 변경하면 기존에 선택된 원자재 정보가 초기화됩니다. 계속하시겠습니까?')) return;
    setFormData((f) => ({ ...f, supplier_id: newId, raw_material_ids: [] }));
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName || String(userName).trim() === '') {
      setFormError('수정자는 필수입니다. 로그인 후 등록해 주세요.');
      return;
    }
    const sid = formData.supplier_id != null ? parseInt(formData.supplier_id, 10) : NaN;
    if (Number.isNaN(sid) || sid < 1) {
      setFormError('원자재 공급 업체를 선택해 주세요.');
      return;
    }
    if (!formData.name?.trim()) {
      setFormError('창고 이름은 필수입니다.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: sid,
          name: formData.name.trim(),
          address: formData.address.trim(),
          postal_code: formData.postal_code?.trim() || null,
          address_detail: formData.address_detail?.trim() || null,
          raw_material_ids: Array.isArray(formData.raw_material_ids) ? formData.raw_material_ids : [],
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
    const sid = formData.supplier_id != null ? parseInt(formData.supplier_id, 10) : NaN;
    if (Number.isNaN(sid) || sid < 1) {
      setFormError('원자재 공급 업체를 선택해 주세요.');
      return;
    }
    if (!formData.name?.trim()) {
      setFormError('창고 이름은 필수입니다.');
      return;
    }
    if (!formData.address?.trim()) {
      setFormError('주소는 필수입니다.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: sid,
          name: formData.name.trim(),
          address: formData.address.trim(),
          postal_code: formData.postal_code?.trim() || null,
          address_detail: formData.address_detail?.trim() || null,
          raw_material_ids: Array.isArray(formData.raw_material_ids) ? formData.raw_material_ids : [],
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
    if (!window.confirm(`"${name}" 창고를 삭제하시겠습니까?`)) return;
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
    if (search.supplierId) q.set('supplierId', search.supplierId);
    if (search.warehouseName.trim()) q.set('warehouseName', search.warehouseName.trim());
    setError('');
    try {
      const res = await fetch(`${API}/export-excel?${q}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || '엑셀 다운로드에 실패했습니다.';
        setError(data.detail ? `${msg} (${data.detail})` : msg);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'supplier_warehouses.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 200);
    } catch {
      setError('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  const renderCell = (v) => (v != null && v !== '' ? String(v) : '-');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>원자재 업체 창고 정보</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          원자재 공급 업체
          <select
            value={search.supplierId}
            onChange={(e) => setSearch((s) => ({ ...s, supplierId: e.target.value }))}
            className={styles.input}
          >
            <option value="">전체</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {renderCell(s.name)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.searchLabel}>
          창고 이름
          <input
            type="text"
            value={search.warehouseName}
            onChange={(e) => setSearch((s) => ({ ...s, warehouseName: e.target.value }))}
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
                <th>원자재 공급 업체</th>
                <th>창고 이름</th>
                {!isMobile && (
                  <>
                    <th>주소</th>
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
                  <td colSpan={isMobile ? 3 : 6} className={styles.empty}>
                    조회된 창고가 없습니다.
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id}>
                    <td>{renderCell(row.supplier_name)}</td>
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
                        <td>{row.updated_at ? formatDate(row.updated_at) : '-'}</td>
                        <td>{renderCell(row.updated_by)}</td>
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
            aria-labelledby="warehouse-form-title"
          >
            <h2 id="warehouse-form-title" className={styles.modalTitle}>
              {formMode === 'add' && '창고 등록'}
              {formMode === 'view' && '창고 보기'}
              {formMode === 'edit' && '원자재 창고 정보 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <label className={styles.label}>
                  원자재 공급 업체 <span className={styles.required}>*</span>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => handleSupplierChangeAdd(e.target.value)}
                    className={styles.input}
                    required
                  >
                    <option value="">선택</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {renderCell(s.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.label}>
                  창고 이름 <span className={styles.required}>*</span>
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
                      onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                      className={styles.input}
                      placeholder="Daum 주소 검색으로 입력"
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
                  />
                </label>
                <label className={styles.label}>
                  보관 원자재 <span className={styles.optional}>(선택)</span>
                  {formData.supplier_id && !Array.isArray(supplierMaterialIds) && (
                    <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                      업체별 제공 원자재 목록을 불러오는 중...
                    </p>
                  )}
                  {formData.supplier_id && Array.isArray(supplierMaterialIds) && supplierMaterialIds.length === 0 && (
                    <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                      이 업체에 등록된 제공 원자재가 없습니다. 업체 정보에서 제공 원자재를 먼저 설정해 주세요.
                    </p>
                  )}
                  <div>
                    <button
                      type="button"
                      className={styles.input}
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => setRawMaterialPopupOpen(true)}
                      disabled={!formData.supplier_id || (formData.supplier_id && (!Array.isArray(supplierMaterialIds) || supplierMaterialIds.length === 0))}
                      title={getSelectedMaterialLabel(formData.raw_material_ids || [], materials)}
                    >
                      {getSelectedMaterialLabel(formData.raw_material_ids || [], materials)}
                    </button>
                  </div>
                </label>
                <RawMaterialSelectPopup
                  open={rawMaterialPopupOpen}
                  onClose={() => setRawMaterialPopupOpen(false)}
                  materials={materialsForWarehouse}
                  selectedIds={formData.raw_material_ids || []}
                  onConfirm={(ids) => setFormData((f) => ({ ...f, raw_material_ids: ids }))}
                  title="보관 원자재 선택"
                />
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
                  <dt>원자재 공급 업체</dt>
                  <dd>{renderCell(formData.supplier_name)}</dd>
                  <dt>창고 이름</dt>
                  <dd>{renderCell(formData.name)}</dd>
                  <dt>우편번호</dt>
                  <dd>{renderCell(formData.postal_code)}</dd>
                  <dt>주소</dt>
                  <dd>{renderCell(formData.address)}</dd>
                  <dt>상세 주소</dt>
                  <dd>{renderCell(formData.address_detail)}</dd>
                  <dt>보관 원자재</dt>
                  <dd>
                    {formData.raw_material_ids?.length
                      ? formData.raw_material_ids
                          .map((mid) => materials.find((m) => m.id === mid))
                          .filter(Boolean)
                          .map((m) => `${m.kind || ''} / ${m.name || ''}`)
                          .join(', ') || '-'
                      : '-'}
                  </dd>
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
                <p className={styles.editHint}>업체를 변경하면 기존에 선택된 원자재 정보가 초기화됩니다.</p>
                <label className={styles.label}>
                  원자재 공급 업체 <span className={styles.required}>*</span>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => handleSupplierChangeEdit(e.target.value)}
                    className={styles.input}
                    required
                  >
                    <option value="">선택</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {renderCell(s.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.label}>
                  창고 이름 <span className={styles.required}>*</span>
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
                  주소 <span className={styles.required}>*</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      value={formData.address ?? ''}
                      onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                      className={styles.input}
                      required
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
                  보관 원자재
                  {formData.supplier_id && !Array.isArray(supplierMaterialIds) && (
                    <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                      업체별 제공 원자재 목록을 불러오는 중...
                    </p>
                  )}
                  {formData.supplier_id && Array.isArray(supplierMaterialIds) && supplierMaterialIds.length === 0 && (
                    <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                      이 업체에 등록된 제공 원자재가 없습니다.
                    </p>
                  )}
                  <div>
                    <button
                      type="button"
                      className={styles.input}
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => setRawMaterialPopupOpen(true)}
                      disabled={formData.supplier_id && (!Array.isArray(supplierMaterialIds) || supplierMaterialIds.length === 0)}
                      title={getSelectedMaterialLabel(formData.raw_material_ids || [], materials)}
                    >
                      {getSelectedMaterialLabel(formData.raw_material_ids || [], materials)}
                    </button>
                  </div>
                </label>
                <RawMaterialSelectPopup
                  open={rawMaterialPopupOpen}
                  onClose={() => setRawMaterialPopupOpen(false)}
                  materials={materialsForWarehouse}
                  selectedIds={formData.raw_material_ids || []}
                  onConfirm={(ids) => setFormData((f) => ({ ...f, raw_material_ids: ids }))}
                  title="보관 원자재 선택"
                />
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

export default MaterialWarehouse;
