import React, { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useAuth } from '../../context/AuthContext';
import SelectDropdown from '../../components/SelectDropdown';
import { parseApiJsonBody } from '../../lib/parseApiJsonBody';
import { formatFinishedProductDeleteBlockerLine } from '../../lib/formatFinishedProductDeleteBlockers';
import styles from '../material/MaterialInfo.module.css';
import dtStyles from './DeliveryTable.module.css';

const API = '/api/delivery-finished-products';
const VEHICLE_API = '/api/delivery-vehicles';
const AFFILIATE_API = '/api/delivery-affiliates';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const PAGE_SIZES = [10, 15, 20, 50, 100];
const WIDE_SEARCH_SELECT_WRAPPER_STYLE = {
  width: '360px',
};

function DeliveryFinishedProduct() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteBlockers, setDeleteBlockers] = useState([]);
  const [search, setSearch] = useState({ vehicleCode: '', partCode: '', colorCode: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [carMakers, setCarMakers] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [vehicleCodes, setVehicleCodes] = useState([]);
  const [partCodes, setPartCodes] = useState([]);
  const [colorCodes, setColorCodes] = useState([]);

  const userName = user?.name || user?.loginId || '';

  const LIST_FETCH_TIMEOUT_MS = 15000;

  /* ig-config-manager 코드 목록 로드 */
  useEffect(() => {
    fetch(`${AFFILIATE_API}?limit=500`)
      .then((r) => r.json())
      .then((d) => setAffiliates(d.list || []))
      .catch(() => setAffiliates([]));
    fetch(VEHICLE_API)
      .then((r) => r.json())
      .then((d) => setCarMakers(d.list || []))
      .catch(() => setCarMakers([]));
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
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    setDeleteBlockers([]);
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
      const res = await fetch(`${API}?${q}`, { signal: ac.signal });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteBlockers([]);
        setError(data.error || '목록 조회에 실패했습니다.');
        return;
      }
      setList(data.list || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setDeleteBlockers([]);
        setError('응답이 지연되고 있습니다. 백엔드 서버(포트 3000)와 DB가 실행 중인지 확인해 주세요.');
      } else {
        setDeleteBlockers([]);
        setError('목록 조회 중 오류가 발생했습니다. (백엔드·DB 연결 확인)');
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, search.vehicleCode, search.partCode, search.colorCode]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };
  const handleResetSearch = () => {
    setSearch({ vehicleCode: '', partCode: '', colorCode: '' });
    setPage(1);
  };

  const openAdd = () => {
    setFormMode('add');
    setFormData({
      code: '',
      affiliate_id: '',
      car_company: '',
      vehicle_code: '',
      vehicle_name: '',
      part_code: '',
      part_name: '',
      color_code: '',
      color_name: '',
      thickness: '',
      width: '',
      two_width: '',
      length: '',
      ratio: '',
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
      affiliate_id: row.affiliate_id ?? '',
      affiliate_name: row.affiliate_name ?? '',
      car_company: row.car_company ?? '',
      vehicle_code: row.vehicle_code ?? '',
      vehicle_name: row.vehicle_name ?? '',
      part_code: row.part_code ?? '',
      part_name: row.part_name ?? '',
      color_code: row.color_code ?? '',
      color_name: row.color_name ?? '',
      thickness: row.thickness ?? '',
      width: row.width ?? '',
      two_width: row.two_width ?? '',
      length: row.length ?? '',
      ratio: row.ratio ?? '',
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
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code?.trim() || null,
          affiliate_id: formData.affiliate_id !== '' ? Number(formData.affiliate_id) : null,
          car_company: formData.car_company?.trim() || null,
          vehicle_code: formData.vehicle_code?.trim() || null,
          vehicle_name: formData.vehicle_name?.trim() || null,
          part_code: formData.part_code?.trim() || null,
          part_name: formData.part_name?.trim() || null,
          color_code: formData.color_code?.trim() || null,
          color_name: formData.color_name?.trim() || null,
          thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
          width: formData.width !== '' ? Number(formData.width) : null,
          two_width: formData.two_width !== '' ? Number(formData.two_width) : null,
          length: formData.length !== '' ? Number(formData.length) : null,
          ratio: formData.ratio !== '' ? Number(formData.ratio) : null,
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
          affiliate_id: formData.affiliate_id !== '' ? Number(formData.affiliate_id) : null,
          car_company: formData.car_company?.trim() || null,
          vehicle_code: formData.vehicle_code?.trim() || null,
          vehicle_name: formData.vehicle_name?.trim() || null,
          part_code: formData.part_code?.trim() || null,
          part_name: formData.part_name?.trim() || null,
          color_code: formData.color_code?.trim() || null,
          color_name: formData.color_name?.trim() || null,
          thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
          width: formData.width !== '' ? Number(formData.width) : null,
          two_width: formData.two_width !== '' ? Number(formData.two_width) : null,
          length: formData.length !== '' ? Number(formData.length) : null,
          ratio: formData.ratio !== '' ? Number(formData.ratio) : null,
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
    if (!window.confirm(`"${name}" 완제품을 삭제하시겠습니까?`)) return;
    setError('');
    setDeleteBlockers([]);
    try {
      const res = await fetch(`${API}/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      const data = parseApiJsonBody(await res.text(), res.status);
      if (!res.ok) {
        setDeleteBlockers(Array.isArray(data.blockers) ? data.blockers : []);
        setError(data.error || '삭제에 실패했습니다.');
        return;
      }
      setDeleteBlockers([]);
      fetchList();
    } catch {
      setDeleteBlockers([]);
      setError('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleExcelDownload = async () => {
    const q = new URLSearchParams();
    if (search.vehicleCode.trim()) q.set('vehicleCode', search.vehicleCode.trim());
    if (search.partCode.trim()) q.set('partCode', search.partCode.trim());
    if (search.colorCode.trim()) q.set('colorCode', search.colorCode.trim());
    setError('');
    setDeleteBlockers([]);
    try {
      const res = await fetch(`${API}/export-excel?${q}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteBlockers([]);
        setError(data.error || '엑셀 다운로드에 실패했습니다.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'delivery_finished_products.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 200);
    } catch (err) {
      setDeleteBlockers([]);
      setError('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  const renderCell = (v) => (v != null && v !== '' ? String(v) : '-');
  const formatQty = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? String(Math.round(Number(v))) : '-');
  const formatThickness = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v).toFixed(1) : '-');
  const formatInt = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? String(Math.round(Number(v))) : '-');
  const formatDims = (row) => {
    const parts = [
      formatThickness(row?.thickness),
      formatInt(row?.width),
      formatInt(row?.two_width),
      formatInt(row?.length),
      formatInt(row?.ratio),
    ];
    return parts.join(' / ');
  };
  const formatCodeTriple = (row) => {
    const toText = (v) => (v != null && v !== '' ? String(v) : '-');
    return `${toText(row?.vehicle_code)}/${toText(row?.part_code)}/${toText(row?.color_code)}`;
  };
  const getCarMakerLabel = (val) => {
    if (!val) return '-';
    const found = carMakers.find((c) => c.value === val);
    return found ? `${found.name} (${found.value})` : val;
  };
  const getCodeLabel = (codes, val) => {
    if (!val) return '-';
    const found = codes.find((c) => c.value === val);
    return found ? `${found.name} (${found.value})` : val;
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>완제품 정보</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          차량 코드
          <SelectDropdown
            options={vehicleCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
            value={search.vehicleCode}
            onChange={(val) => setSearch((s) => ({ ...s, vehicleCode: val }))}
            placeholder="선택"
            style={WIDE_SEARCH_SELECT_WRAPPER_STYLE}
          />
        </label>
        <label className={styles.searchLabel}>
          부위 코드
          <SelectDropdown
            options={partCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
            value={search.partCode}
            onChange={(val) => setSearch((s) => ({ ...s, partCode: val }))}
            placeholder="선택"
            style={WIDE_SEARCH_SELECT_WRAPPER_STYLE}
          />
        </label>
        <label className={styles.searchLabel}>
          색상
          <SelectDropdown
            options={colorCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
            value={search.colorCode}
            onChange={(val) => setSearch((s) => ({ ...s, colorCode: val }))}
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

      {error && (
        <div className={styles.error}>
          <div>{error}</div>
          {deleteBlockers.length > 0 && (
            <ul className={styles.errorBlockerList}>
              {deleteBlockers.map((b) => (
                <li key={`${b.request_id}-${b.request_item_id}`} className={styles.errorBlockerItem}>
                  {formatFinishedProductDeleteBlockerLine(b)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                <th style={{ width: isMobile ? '35%' : '18%' }}>납품사 연계 업체</th>
                {!isMobile && <th style={{ width: '22%' }}>두께/폭/두폭/길이/배율</th>}
                {!isMobile && (
                  <>
                    <th style={{ width: '24%' }}>차량코드/부위코드/색상</th>
                  </>
                )}
                <th style={{ width: isMobile ? '30%' : '10%' }}>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={isMobile ? 2 : 7} className={styles.empty}>
                    조회된 완제품이 없습니다.
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
                        {renderCell(row.affiliate_name)}
                      </button>
                    </td>
                    {!isMobile && <td>{formatDims(row)}</td>}
                    {!isMobile && (
                      <>
                        <td>{formatCodeTriple(row)}</td>
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
            aria-labelledby="finished-product-form-title"
          >
            <h2 id="finished-product-form-title" className={styles.modalTitle}>
              {formMode === 'add' && '완제품 등록'}
              {formMode === 'view' && '완제품 보기'}
              {formMode === 'edit' && '완제품 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <p className={styles.optionalHint}>수정일자·수정자는 자동 기록됩니다.</p>
                <label className={styles.label}>
                  완제품 코드 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                    className={styles.input}
                    placeholder="미입력 가능"
                  />
                </label>
                <label className={styles.label}>
                  납품사 연계 업체 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={affiliates.map((a) => ({ value: a.id, label: a.name }))}
                    value={formData.affiliate_id}
                    onChange={(val) => {
                      const found = affiliates.find((a) => String(a.id) === String(val));
                      setFormData((f) => ({ ...f, affiliate_id: val, affiliate_name: found?.name || '' }));
                    }}
                    placeholder="연계 업체 선택"
                  />
                </label>
                <label className={styles.label}>
                  완성차 회사 코드 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={carMakers.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.car_company}
                    onChange={(val) => setFormData((f) => ({ ...f, car_company: val }))}
                    placeholder="완성차 회사 선택"
                  />
                </label>
                <label className={styles.label}>
                  차량 코드 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={vehicleCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.vehicle_code}
                    onChange={(val) => {
                      const found = vehicleCodes.find((c) => c.value === val);
                      setFormData((f) => ({ ...f, vehicle_code: val, vehicle_name: found?.name || '' }));
                    }}
                    placeholder="차량 선택"
                  />
                </label>
                <label className={styles.label}>
                  차량 부위 <span className={styles.optional}>(선택)</span>
                  <SelectDropdown
                    options={partCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.part_code}
                    onChange={(val) => {
                      const found = partCodes.find((c) => c.value === val);
                      setFormData((f) => ({ ...f, part_code: val, part_name: found?.name || '' }));
                    }}
                    placeholder="부위 선택"
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
                  두폭 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="any"
                    value={formData.two_width}
                    onChange={(e) => setFormData((f) => ({ ...f, two_width: e.target.value }))}
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
                <label className={styles.label}>
                  배율 <span className={styles.optional}>(선택)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.ratio}
                    onChange={(e) => setFormData((f) => ({ ...f, ratio: e.target.value }))}
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
                  <dt>완제품 코드</dt>
                  <dd>{renderCell(formData.code)}</dd>
                  <dt>납품사 연계 업체</dt>
                  <dd>{renderCell(formData.affiliate_name)}</dd>
                  <dt>완성차 회사 코드</dt>
                  <dd>{getCarMakerLabel(formData.car_company)}</dd>
                  <dt>차량 코드</dt>
                  <dd>{getCodeLabel(vehicleCodes, formData.vehicle_code)}</dd>
                  <dt>차량 부위</dt>
                  <dd>{getCodeLabel(partCodes, formData.part_code)}</dd>
                  <dt>색상</dt>
                  <dd>{getCodeLabel(colorCodes, formData.color_code)}</dd>
                  <dt>두께</dt>
                  <dd>{formatThickness(formData.thickness)}</dd>
                  <dt>폭</dt>
                  <dd>{formatInt(formData.width)}</dd>
                  <dt>두폭</dt>
                  <dd>{formatInt(formData.two_width)}</dd>
                  <dt>길이</dt>
                  <dd>{formatInt(formData.length)}</dd>
                  <dt>배율</dt>
                  <dd>{formatInt(formData.ratio)}</dd>
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
                  완제품 코드 <span className={styles.optional}>(선택)</span>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                    className={styles.input}
                    placeholder="미입력 가능"
                  />
                </label>
                <label className={styles.label}>
                  납품사 연계 업체
                  <SelectDropdown
                    options={affiliates.map((a) => ({ value: a.id, label: a.name }))}
                    value={formData.affiliate_id}
                    onChange={(val) => {
                      const found = affiliates.find((a) => String(a.id) === String(val));
                      setFormData((f) => ({ ...f, affiliate_id: val, affiliate_name: found?.name || '' }));
                    }}
                    placeholder="연계 업체 선택"
                  />
                </label>
                <label className={styles.label}>
                  완성차 회사 코드
                  <SelectDropdown
                    options={carMakers.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.car_company}
                    onChange={(val) => setFormData((f) => ({ ...f, car_company: val }))}
                    placeholder="완성차 회사 선택"
                  />
                </label>
                <label className={styles.label}>
                  차량 코드
                  <SelectDropdown
                    options={vehicleCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.vehicle_code}
                    onChange={(val) => {
                      const found = vehicleCodes.find((c) => c.value === val);
                      setFormData((f) => ({ ...f, vehicle_code: val, vehicle_name: found?.name || '' }));
                    }}
                    placeholder="차량 선택"
                  />
                </label>
                <label className={styles.label}>
                  차량 부위
                  <SelectDropdown
                    options={partCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
                    value={formData.part_code}
                    onChange={(val) => {
                      const found = partCodes.find((c) => c.value === val);
                      setFormData((f) => ({ ...f, part_code: val, part_name: found?.name || '' }));
                    }}
                    placeholder="부위 선택"
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
                  두폭
                  <input
                    type="number"
                    step="any"
                    value={formData.two_width}
                    onChange={(e) => setFormData((f) => ({ ...f, two_width: e.target.value }))}
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
                <label className={styles.label}>
                  배율
                  <input
                    type="number"
                    step="0.1"
                    value={formData.ratio}
                    onChange={(e) => setFormData((f) => ({ ...f, ratio: e.target.value }))}
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

export default DeliveryFinishedProduct;
