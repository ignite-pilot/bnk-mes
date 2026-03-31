import React, { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useAuth } from '../../context/AuthContext';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';
import dtStyles from './DeliveryTable.module.css';

const API = '/api/delivery-semi-products';
const VEHICLE_API = '/api/delivery-vehicles';
const SEMI_PRODUCT_TYPE_CODE = 'SEMI_PRODUCT';
const SUPPLIER_API = '/api/delivery-suppliers';
const WIDE_SEARCH_SELECT_WRAPPER_STYLE = {
  width: '360px',
};

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

function formatThickness(v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '-';
  return Number(v).toFixed(2);
}

function formatInt(v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '-';
  return String(Math.round(Number(v)));
}

function formatTWR(thickness, width, ratio) {
  return `${formatThickness(thickness)}/${formatInt(width)}/${formatInt(ratio)}`;
}

function formatCodeTriple(vehicleCode, partCode, colorCode) {
  const toText = (v) => (v != null && v !== '' ? String(v) : '-');
  return `${toText(vehicleCode)}/${toText(partCode)}/${toText(colorCode)}`;
}

function normalizeSemiTypeValue(value, semiTypes) {
  if (!value) return '';
  const raw = String(value);
  const byValue = semiTypes.find((t) => t.value === raw);
  if (byValue) return byValue.value;
  const byName = semiTypes.find((t) => t.name === raw);
  return byName ? byName.value : raw;
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
  const [search, setSearch] = useState({ vehicleCode: '', partCode: '', colorCode: '', supplierName: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [vehicleCodes, setVehicleCodes] = useState([]);
  const [partCodes, setPartCodes] = useState([]);
  const [colorCodes, setColorCodes] = useState([]);
  const [semiTypes, setSemiTypes] = useState([]);

  const userName = user?.name || user?.loginId || '';

  const LIST_FETCH_TIMEOUT_MS = 15000;

  /* ig-config-manager COLOR_CODE 로드 */
  useEffect(() => {
    fetch(`${SUPPLIER_API}?limit=500`)
      .then((r) => r.json())
      .then((d) => setSuppliers(d.list || []))
      .catch(() => setSuppliers([]));
    fetch(`${VEHICLE_API}/codes/VEHICLE_CODE`)
      .then((r) => r.json())
      .then((d) => setVehicleCodes(d.list || []))
      .catch(() => setVehicleCodes([]));
    fetch(`${VEHICLE_API}/codes/PART_CODE`)
      .then((r) => r.json())
      .then((d) => setPartCodes(d.list || []))
      .catch(() => setPartCodes([]));
    fetch(`${VEHICLE_API}/codes/COLOR_CODE`)
      .then((r) => r.json())
      .then((d) => setColorCodes(d.list || []))
      .catch(() => setColorCodes([]));
    fetch(`${VEHICLE_API}/codes/${SEMI_PRODUCT_TYPE_CODE}`)
      .then((r) => r.json())
      .then((d) => setSemiTypes(d.list || []))
      .catch(() => setSemiTypes([]));
  }, []);

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
      if (search.vehicleCode.trim()) q.set('vehicleCode', search.vehicleCode.trim());
      if (search.partCode.trim()) q.set('partCode', search.partCode.trim());
      if (search.colorCode.trim()) q.set('colorCode', search.colorCode.trim());
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
  }, [page, limit, search.vehicleCode, search.partCode, search.colorCode, search.supplierName]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };
  const handleResetSearch = () => {
    setSearch({ vehicleCode: '', partCode: '', colorCode: '', supplierName: '' });
    setPage(1);
  };

  const openAdd = () => {
    setFormMode('add');
    setFormData({
      code: '',
      semi_product_type: '',
      vehicle_code: '',
      part_code: '',
      ratio: '',
      color_code: '',
      color_name: '',
      thickness: '',
      width: '',
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
      code: row.code ?? '',
      semi_product_type: normalizeSemiTypeValue(row.semi_product_type, semiTypes),
      vehicle_code: row.vehicle_code ?? '',
      part_code: row.part_code ?? '',
      ratio: row.ratio ?? '',
      color_code: row.color_code ?? '',
      color_name: row.color_name ?? '',
      thickness: row.thickness ?? '',
      width: row.width ?? '',
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

  useEffect(() => {
    if (!formData || formMode !== 'edit' || semiTypes.length === 0) return;
    const normalized = normalizeSemiTypeValue(formData.semi_product_type, semiTypes);
    if (normalized !== formData.semi_product_type) {
      setFormData((prev) => ({ ...prev, semi_product_type: normalized }));
    }
  }, [formData, formMode, semiTypes]);

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
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code?.trim() || null,
          semi_product_type: formData.semi_product_type?.trim() || null,
          vehicle_code: formData.vehicle_code?.trim() || null,
          part_code: formData.part_code?.trim() || null,
          ratio: formData.ratio !== '' ? Number(formData.ratio) : null,
          color_code: formData.color_code?.trim() || null,
          color_name: formData.color_name?.trim() || null,
          thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
          width: formData.width !== '' ? Number(formData.width) : null,
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
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code?.trim() || null,
          semi_product_type: formData.semi_product_type?.trim() || null,
          vehicle_code: formData.vehicle_code?.trim() || null,
          part_code: formData.part_code?.trim() || null,
          ratio: formData.ratio !== '' ? Number(formData.ratio) : null,
          color_code: formData.color_code?.trim() || null,
          color_name: formData.color_name?.trim() || null,
          thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
          width: formData.width !== '' ? Number(formData.width) : null,
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
    if (search.vehicleCode.trim()) q.set('vehicleCode', search.vehicleCode.trim());
    if (search.partCode.trim()) q.set('partCode', search.partCode.trim());
    if (search.colorCode.trim()) q.set('colorCode', search.colorCode.trim());
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
  const getCodeLabel = (codes, val) => {
    if (!val) return '-';
    const found = codes.find((c) => c.value === val || c.name === val);
    return found ? `${found.name} (${found.value})` : val;
  };
  const getCodeNameOnly = (codes, val) => {
    if (!val) return '-';
    const found = codes.find((c) => c.value === val || c.name === val);
    return found ? found.name : val;
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>반제품 정보</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          차량코드
          <SelectDropdown
            options={vehicleCodes.map((t) => ({ value: t.value, label: `${t.name} (${t.value})` }))}
            value={search.vehicleCode}
            onChange={(val) => setSearch((s) => ({ ...s, vehicleCode: val }))}
            placeholder="선택"
            style={WIDE_SEARCH_SELECT_WRAPPER_STYLE}
          />
        </label>
        <label className={styles.searchLabel}>
          부위코드
          <SelectDropdown
            options={partCodes.map((t) => ({ value: t.value, label: `${t.name} (${t.value})` }))}
            value={search.partCode}
            onChange={(val) => setSearch((s) => ({ ...s, partCode: val }))}
            placeholder="선택"
            style={WIDE_SEARCH_SELECT_WRAPPER_STYLE}
          />
        </label>
        <label className={styles.searchLabel}>
          색상코드
          <SelectDropdown
            options={colorCodes.map((t) => ({ value: t.value, label: `${t.name} (${t.value})` }))}
            value={search.colorCode}
            onChange={(val) => setSearch((s) => ({ ...s, colorCode: val }))}
            placeholder="선택"
            style={WIDE_SEARCH_SELECT_WRAPPER_STYLE}
          />
        </label>
        <label className={styles.searchLabel}>
          납품 업체
          <SelectDropdown
            options={suppliers.map((s) => ({ value: s.name, label: s.name }))}
            value={search.supplierName}
            onChange={(val) => setSearch((s) => ({ ...s, supplierName: val }))}
            placeholder="선택"
            style={WIDE_SEARCH_SELECT_WRAPPER_STYLE}
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
            <thead>
              <tr>
                <th style={{ width: isMobile ? '30%' : '14%' }}>반제품 종류</th>
                <th style={{ width: isMobile ? '50%' : '28%' }}>차량코드/부위코드/색상</th>
                {!isMobile && (
                  <>
                    <th style={{ width: '18%' }}>두께/폭/배율</th>
                  </>
                )}
                <th style={{ width: isMobile ? '30%' : '12%' }}>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={isMobile ? 3 : 5} className={styles.empty}>
                    조회된 반제품이 없습니다.
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id}>
                    <td>{getCodeNameOnly(semiTypes, row.semi_product_type)}</td>
                    <td>{formatCodeTriple(row.vehicle_code, row.part_code, row.color_code)}</td>
                    {!isMobile && (
                      <>
                        <td>{formatTWR(row.thickness, row.width, row.ratio)}</td>
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
                        onClick={() => handleDelete(row.id, row.code || `ID:${row.id}`)}
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
                  반제품 코드 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                    className={styles.input}
                    placeholder="미입력 가능"
                  />
                </label>
                <label className={styles.label}>
                  반제품 종류 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={semiTypes.map((t) => ({ value: t.value, label: `${t.name} (${t.value})` }))}
                    value={formData.semi_product_type}
                    onChange={(val) => setFormData((f) => ({ ...f, semi_product_type: val }))}
                    placeholder="선택"
                  />
                </label>
                <label className={styles.label}>
                  차량 코드 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={vehicleCodes.map((v) => ({ value: v.value, label: `${v.name} (${v.value})` }))}
                    value={formData.vehicle_code}
                    onChange={(val) => setFormData((f) => ({ ...f, vehicle_code: val }))}
                    placeholder="차량 코드 선택"
                  />
                </label>
                <label className={styles.label}>
                  부위 코드 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={partCodes.map((p) => ({ value: p.value, label: `${p.name} (${p.value})` }))}
                    value={formData.part_code}
                    onChange={(val) => setFormData((f) => ({ ...f, part_code: val }))}
                    placeholder="부위 코드 선택"
                  />
                </label>
                <label className={styles.label}>
                  배율 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="1"
                    value={formData.ratio}
                    onChange={(e) => setFormData((f) => ({ ...f, ratio: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  색상 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={colorCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.color_code}
                    onChange={(val) => {
                      const found = colorCodes.find((c) => c.value === val);
                      setFormData((f) => ({ ...f, color_code: val, color_name: found?.name || '' }));
                    }}
                    placeholder="색상 선택"
                  />
                </label>
                <label className={styles.label}>
                  두께 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.thickness}
                    onChange={(e) => setFormData((f) => ({ ...f, thickness: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  폭 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="1"
                    value={formData.width}
                    onChange={(e) => setFormData((f) => ({ ...f, width: e.target.value }))}
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
                  <dt>반제품 코드</dt>
                  <dd>{renderCell(formData.code)}</dd>
                  <dt>반제품 종류</dt>
                  <dd>{renderCell(formData.semi_product_type)}</dd>
                  <dt>차량 코드</dt>
                  <dd>{renderCell(formData.vehicle_code)}</dd>
                  <dt>부위 코드</dt>
                  <dd>{renderCell(formData.part_code)}</dd>
                  <dt>색상 코드</dt>
                  <dd>{renderCell(formData.color_code)}</dd>
                  <dt>색상</dt>
                  <dd>{getCodeLabel(colorCodes, formData.color_code)}</dd>
                  <dt>배율</dt>
                  <dd>{formatInt(formData.ratio)}</dd>
                  <dt>두께</dt>
                  <dd>{formatThickness(formData.thickness)}</dd>
                  <dt>폭</dt>
                  <dd>{formatInt(formData.width)}</dd>
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
                  반제품 코드 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                    className={styles.input}
                    placeholder="미입력 가능"
                  />
                </label>
                <label className={styles.label}>
                  반제품 종류
                  <SelectDropdown
                    options={semiTypes.map((t) => ({ value: t.value, label: `${t.name} (${t.value})` }))}
                    value={formData.semi_product_type}
                    onChange={(val) => setFormData((f) => ({ ...f, semi_product_type: val }))}
                    placeholder="선택"
                  />
                </label>
                <label className={styles.label}>
                  차량 코드
                  <SelectDropdown
                    options={vehicleCodes.map((v) => ({ value: v.value, label: `${v.name} (${v.value})` }))}
                    value={formData.vehicle_code}
                    onChange={(val) => setFormData((f) => ({ ...f, vehicle_code: val }))}
                    placeholder="차량 코드 선택"
                  />
                </label>
                <label className={styles.label}>
                  부위 코드
                  <SelectDropdown
                    options={partCodes.map((p) => ({ value: p.value, label: `${p.name} (${p.value})` }))}
                    value={formData.part_code}
                    onChange={(val) => setFormData((f) => ({ ...f, part_code: val }))}
                    placeholder="부위 코드 선택"
                  />
                </label>
                <label className={styles.label}>
                  배율
                  <input
                    type="number"
                    step="1"
                    value={formData.ratio}
                    onChange={(e) => setFormData((f) => ({ ...f, ratio: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  색상
                  <SelectDropdown
                    options={colorCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.color_code}
                    onChange={(val) => {
                      const found = colorCodes.find((c) => c.value === val);
                      setFormData((f) => ({ ...f, color_code: val, color_name: found?.name || '' }));
                    }}
                    placeholder="색상 선택"
                  />
                </label>
                <label className={styles.label}>
                  두께
                  <input
                    type="number"
                    step="0.01"
                    value={formData.thickness}
                    onChange={(e) => setFormData((f) => ({ ...f, thickness: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label className={styles.label}>
                  폭
                  <input
                    type="number"
                    step="1"
                    value={formData.width}
                    onChange={(e) => setFormData((f) => ({ ...f, width: e.target.value }))}
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
