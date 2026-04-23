import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/material';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

function formatMm(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return '-';
  return `${Math.round(n)}mm`;
}

function formatQty(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return '-';
  return String(Math.round(n));
}

const fetchCode = (code) =>
  fetch(`/api/delivery-vehicles/codes/${code}`)
    .then((r) => r.json())
    .then((d) =>
      (d.items || d.list || []).map((c) => ({
        value: c.codeValue || c.value || c.code,
        label: c.label || c.codeName || c.name || c.codeValue,
        name: c.name || c.codeName || c.label || '',
      }))
    )
    .catch(() => []);

const PAGE_SIZES = [10, 15, 20, 50, 100];

function MasterMaterialInfo() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [types, setTypes] = useState([]);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTabId, setActiveTabId] = useState('');
  const [search, setSearch] = useState({ name: '', vehicleCode: '' });
  const [appliedSearch, setAppliedSearch] = useState({ name: '', vehicleCode: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // config-manager code options
  const [vehicleCodes, setVehicleCodes] = useState([]);
  const [partCodes, setPartCodes] = useState([]);
  const [colorCodes, setColorCodes] = useState([]);

  const userName = user?.name || user?.loginId || '';
  const LIST_FETCH_TIMEOUT_MS = 15000;

  useEffect(() => {
    fetchCode('VEHICLE_CODE').then(setVehicleCodes);
    fetchCode('PART_CODE').then(setPartCodes);
    fetchCode('COLOR_CODE').then(setColorCodes);
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), LIST_FETCH_TIMEOUT_MS);
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (activeTabId) q.set('kindId', String(activeTabId));
      if (appliedSearch.name.trim()) q.set('name', appliedSearch.name.trim());
      if (appliedSearch.vehicleCode) q.set('vehicleCode', appliedSearch.vehicleCode);
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
        setError('응답이 지연되고 있습니다. 백엔드 서버와 DB가 실행 중인지 확인해 주세요.');
      } else {
        setError('목록 조회 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedSearch, activeTabId]);

  useEffect(() => {
    fetch(`${API}/types`)
      .then((r) => r.json())
      .then((d) => {
        // '하지'/'접착제' 등은 원자재가 아니므로 제외 (하지 → 반제품)
        const filtered = (d.list || []).filter((t) => !['하지', '접착제', '표지'].includes(t.name));
        setTypes(filtered);
        if (filtered.length > 0) setActiveTabId(filtered[0].id);
      })
      .catch(() => setTypes([]));
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (formOpen && formMode === 'add' && types.length > 0) {
      setFormData((f) => (f && !f.kind_id ? { ...f, kind_id: types[0].id } : f));
    }
  }, [formOpen, formMode, types]);

  const handleSearch = (e) => { e.preventDefault(); setAppliedSearch({ ...search }); setPage(1); };
  const handleResetSearch = () => { const empty = { name: '', vehicleCode: '' }; setSearch(empty); setAppliedSearch(empty); setPage(1); };
  const handleChangeTab = (id) => { setActiveTabId(id); setPage(1); };

  const emptyForm = () => ({
    kind_id: activeTabId || (types.length ? types[0].id : ''),
    code: '',
    name: '',
    color: '',
    color_code: '',
    vehicle_code: '',
    vehicle_name: '',
    part_code: '',
    part_name: '',
    thickness: '',
    width: '',
    length: '',
    supplier_safety_stock: 0,
    bnk_warehouse_safety_stock: 0,
  });

  const openAdd = () => {
    setFormMode('add');
    setFormData(emptyForm());
    setFormError('');
    setFormOpen(true);
  };

  const openView = async (id) => {
    setFormError('');
    try {
      const res = await fetch(`${API}/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data.error || '조회에 실패했습니다.'); return; }
      setFormMode('view');
      setFormData({
        ...data,
        thickness: data.thickness != null ? data.thickness : '',
        width: data.width != null ? data.width : '',
        length: data.length != null ? data.length : '',
      });
      setFormOpen(true);
    } catch { setFormError('조회 중 오류가 발생했습니다.'); }
  };

  const openEdit = (row) => {
    setFormMode('edit');
    setFormData({
      id: row.id,
      kind_id: row.kind_id,
      kind: row.kind,
      code: row.code || '',
      name: row.name,
      color: row.color || '',
      color_code: row.color_code || '',
      vehicle_code: row.vehicle_code || '',
      vehicle_name: row.vehicle_name || '',
      part_code: row.part_code || '',
      part_name: row.part_name || '',
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

  const closeForm = () => { setFormOpen(false); setFormData(null); setFormError(''); fetchList(); };

  const buildBody = () => ({
    kind_id: formData.kind_id ? Number(formData.kind_id) : null,
    code: formData.code?.trim() || null,
    name: formData.name.trim(),
    color: formData.color?.trim() || null,
    color_code: formData.color_code?.trim() || null,
    vehicle_code: formData.vehicle_code?.trim() || null,
    vehicle_name: formData.vehicle_name?.trim() || null,
    part_code: formData.part_code?.trim() || null,
    part_name: formData.part_name?.trim() || null,
    thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
    width: formData.width !== '' ? Number(formData.width) : null,
    length: formData.length !== '' ? Number(formData.length) : null,
    supplier_safety_stock: Number(formData.supplier_safety_stock) || 0,
    bnk_warehouse_safety_stock: Number(formData.bnk_warehouse_safety_stock) || 0,
  });

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName) { setFormError('로그인 후 등록해 주세요.'); return; }
    if (!formData.kind_id || !formData.name?.trim()) { setFormError('원자재 종류와 이름은 필수입니다.'); return; }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildBody(), createdBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data.error || '등록에 실패했습니다.'); return; }
      closeForm();
    } catch { setFormError('등록 중 오류가 발생했습니다.'); } finally { setFormSaving(false); }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) { setFormError('원자재 이름은 필수입니다.'); return; }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildBody(), updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data.error || '수정에 실패했습니다.'); return; }
      closeForm();
    } catch { setFormError('수정 중 오류가 발생했습니다.'); } finally { setFormSaving(false); }
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
      if (!res.ok) { setError(data.error || '삭제에 실패했습니다.'); return; }
      fetchList();
    } catch { setError('삭제 중 오류가 발생했습니다.'); }
  };

  const handleExcelDownload = async () => {
    const q = new URLSearchParams();
    if (activeTabId) q.set('kindId', String(activeTabId));
    if (appliedSearch.name.trim()) q.set('name', appliedSearch.name.trim());
    if (appliedSearch.vehicleCode) q.set('vehicleCode', appliedSearch.vehicleCode);
    setError('');
    try {
      const res = await fetch(`${API}/export-excel?${q}`);
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || '엑셀 다운로드에 실패했습니다.'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'raw_materials.csv'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 200);
    } catch { setError('엑셀 다운로드 중 오류가 발생했습니다.'); }
  };

  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setError('');
    try {
      const text = await file.text();
      const res = await fetch(`${API}/upload?createdBy=${encodeURIComponent(userName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || '업로드에 실패했습니다.'); return; }
      setUploadResult(data);
      if (data.inserted > 0) fetchList();
    } catch { setError('업로드 중 오류가 발생했습니다.'); } finally { setUploading(false); }
  };

  const renderCell = (v) => (v != null && v !== '' ? String(v) : '-');

  const EllipsisCell = ({ children }) => (
    <td className={styles.ellipsisCell}>{children}</td>
  );

  const renderFormFields = (mode) => {
    const isView = mode === 'view';
    const isAdd = mode === 'add';

    return (
      <>
        {/* 원자재 종류 */}
        <label className={styles.label}>
          원자재 종류 {!isView && <span className={styles.required}>(필수)</span>}
          {isView ? (
            <div className={styles.viewValue}>{renderCell(formData.kind ?? types.find((t) => t.id === formData.kind_id)?.name)}</div>
          ) : (
            <SelectDropdown
              options={types.map((t) => ({ value: String(t.id), label: t.name }))}
              value={String(formData.kind_id ?? '')}
              onChange={(val) => setFormData((f) => ({ ...f, kind_id: val ? Number(val) : '' }))}
              placeholder="선택"
            />
          )}
        </label>

        {/* 자재코드 */}
        <label className={styles.label}>
          자재코드 {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{renderCell(formData.code)}</div>
          ) : (
            <input type="text" value={formData.code} onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))} className={styles.input} />
          )}
        </label>

        {/* 원자재 이름 */}
        <label className={styles.label}>
          원자재 이름 {!isView && <span className={styles.required}>(필수)</span>}
          {isView ? (
            <div className={styles.viewValue}>{renderCell(formData.name)}</div>
          ) : (
            <input type="text" value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} className={styles.input} required />
          )}
        </label>

        {/* 차종 */}
        <label className={styles.label}>
          차종 {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formData.vehicle_name ? `${formData.vehicle_name} (${formData.vehicle_code})` : renderCell(formData.vehicle_code)}</div>
          ) : (
            <SelectDropdown
              options={vehicleCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
              value={formData.vehicle_code}
              onChange={(val) => {
                const found = vehicleCodes.find((c) => c.value === val);
                setFormData((f) => ({ ...f, vehicle_code: val || '', vehicle_name: found?.name || '' }));
              }}
              placeholder="선택"
              style={{ minWidth: 100 }}
              dropdownMinWidth={180}
            />
          )}
        </label>

        {/* 적용부 */}
        <label className={styles.label}>
          적용부 {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formData.part_name ? `${formData.part_name} (${formData.part_code})` : renderCell(formData.part_code)}</div>
          ) : (
            <SelectDropdown
              options={partCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
              value={formData.part_code}
              onChange={(val) => {
                const found = partCodes.find((c) => c.value === val);
                setFormData((f) => ({ ...f, part_code: val || '', part_name: found?.name || '' }));
              }}
              placeholder="선택"
              style={{ minWidth: 100 }}
              dropdownMinWidth={210}
            />
          )}
        </label>

        {/* 색상 */}
        <label className={styles.label}>
          색상 {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formData.color ? `${formData.color} (${formData.color_code || '-'})` : renderCell(formData.color_code)}</div>
          ) : (
            <SelectDropdown
              options={colorCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
              value={formData.color_code}
              onChange={(val) => {
                const found = colorCodes.find((c) => c.value === val);
                setFormData((f) => ({ ...f, color_code: val || '', color: found?.name || '' }));
              }}
              placeholder="선택"
              style={{ minWidth: 100 }}
              dropdownMinWidth={180}
            />
          )}
        </label>

        {/* 두께 */}
        <label className={styles.label}>
          두께 (mm) {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formatMm(formData.thickness)}</div>
          ) : (
            <input type="number" step="any" min="0" value={formData.thickness} onChange={(e) => setFormData((f) => ({ ...f, thickness: e.target.value }))} className={styles.input} />
          )}
        </label>

        {/* 폭 */}
        <label className={styles.label}>
          폭 (mm) {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formatMm(formData.width)}</div>
          ) : (
            <input type="number" step="any" min="0" value={formData.width} onChange={(e) => setFormData((f) => ({ ...f, width: e.target.value }))} className={styles.input} />
          )}
        </label>

        {/* 길이 */}
        <label className={styles.label}>
          길이 (mm) {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formatMm(formData.length)}</div>
          ) : (
            <input type="number" step="any" min="0" value={formData.length} onChange={(e) => setFormData((f) => ({ ...f, length: e.target.value }))} className={styles.input} />
          )}
        </label>

        {/* 안전재고 */}
        <label className={styles.label}>
          원자재 업체 안전재고 수량 {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formatQty(formData.supplier_safety_stock)}</div>
          ) : (
            <input type="number" min="0" value={formData.supplier_safety_stock} onChange={(e) => setFormData((f) => ({ ...f, supplier_safety_stock: e.target.value }))} className={styles.input} />
          )}
        </label>
        <label className={styles.label}>
          비엔케이 창고 안전재고 수량 {!isView && <span className={styles.optional}>(선택)</span>}
          {isView ? (
            <div className={styles.viewValue}>{formatQty(formData.bnk_warehouse_safety_stock)}</div>
          ) : (
            <input type="number" min="0" value={formData.bnk_warehouse_safety_stock} onChange={(e) => setFormData((f) => ({ ...f, bnk_warehouse_safety_stock: e.target.value }))} className={styles.input} />
          )}
        </label>

        {!isAdd && (
          <>
            <label className={styles.label}>수정일자<div className={styles.viewValue}>{formData.updated_at ? formatDate(formData.updated_at) : '-'}</div></label>
            <label className={styles.label}>수정자<div className={styles.viewValue}>{renderCell(formData.updated_by)}</div></label>
          </>
        )}
        {isAdd && <p className={styles.optionalHint}>등록일자·등록자·수정일자·수정자는 자동 기록됩니다.</p>}
      </>
    );
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>원자재 정보</h1>

      {/* 원자재 종류 탭 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', marginBottom: '1rem' }}>
        {types.map((t) => {
          const isActive = activeTabId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleChangeTab(t.id)}
              style={{
                padding: '0.6rem 1.5rem',
                border: 'none',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: isActive ? '#2563eb' : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          원자재 이름
          <input type="text" value={search.name} onChange={(e) => setSearch((s) => ({ ...s, name: e.target.value }))} className={styles.input} placeholder="검색" />
        </label>
        <label className={styles.searchLabel}>
          차종
          <SelectDropdown
            options={vehicleCodes.map((c) => ({ value: c.value, label: `${c.name} (${c.value})` }))}
            value={search.vehicleCode}
            onChange={(val) => setSearch((s) => ({ ...s, vehicleCode: val }))}
            placeholder="전체"
            style={{ minWidth: 120 }}
            dropdownMinWidth={180}
          />
        </label>
        <button type="submit" className={styles.btnPrimary}>검색</button>
        <button type="button" className={styles.btnSecondary} onClick={handleResetSearch}>초기화</button>
      </form>

      <div className={styles.toolbar}>
        <button type="button" className={styles.btnPrimary} onClick={openAdd}>등록</button>
        <label className={styles.btnSecondary} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          {uploading ? '업로드 중...' : '엑셀 업로드'}
          <input type="file" accept=".csv" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
        </label>
        <button type="button" className={styles.btnSecondary} onClick={handleExcelDownload}>엑셀 다운로드</button>
        <button type="button" className={styles.btnSecondary} onClick={() => { window.location.href = `${API}/template`; }}>업로드 템플릿</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {uploadResult && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: uploadResult.errors.length > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${uploadResult.errors.length > 0 ? '#fcd34d' : '#86efac'}`, borderRadius: 6, fontSize: '0.875rem' }}>
          <div style={{ fontWeight: 600, marginBottom: uploadResult.errors.length > 0 ? '0.5rem' : 0 }}>
            전체 {uploadResult.totalRows}건 중 {uploadResult.inserted}건 등록 완료{uploadResult.errors.length > 0 && `, ${uploadResult.errors.length}건 오류`}
          </div>
          {uploadResult.errors.length > 0 && (
            <ul className={styles.errorBlockerList}>
              {uploadResult.errors.map((e, i) => (
                <li key={i} className={styles.errorBlockerItem}>{e.row}행 [{e.name || e.code || e.semiType}]: {e.errors.join(', ')}</li>
              ))}
            </ul>
          )}
          <button type="button" className={styles.btnSmall} style={{ marginTop: '0.5rem' }} onClick={() => setUploadResult(null)}>닫기</button>
        </div>
      )}

      <div className={styles.listOptions}>
        <label>
          한번에 보기
          <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} aria-label="페이지당 건수">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}개</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p className={styles.loading}>조회 중...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.masterTable}>
            <colgroup>
              <col style={{ width: '10%' }} />  {/* 자재코드 */}
              <col style={{ width: '20%' }} />  {/* 원자재 이름 */}
              {!isMobile && (
                <>
                  <col style={{ width: '7%' }} />   {/* 차종 */}
                  <col style={{ width: '11%' }} />  {/* 적용부 */}
                  <col style={{ width: '9%' }} />   {/* 색상 */}
                  <col style={{ width: '5%' }} />   {/* 두께 */}
                  <col style={{ width: '5%' }} />   {/* 폭 */}
                  <col style={{ width: '5%' }} />   {/* 길이 */}
                  <col style={{ width: '6%' }} />   {/* 업체안전재고 */}
                  <col style={{ width: '6%' }} />   {/* BNK안전재고 */}
                </>
              )}
              <col style={{ width: '10%' }} />  {/* 기능 */}
            </colgroup>
            <thead>
              <tr>
                <th>자재코드</th>
                <th>원자재 이름</th>
                {!isMobile && (
                  <>
                    <th>차종</th>
                    <th>적용부</th>
                    <th>색상</th>
                    <th>두께</th>
                    <th>폭</th>
                    <th>길이</th>
                    <th>업체안전재고</th>
                    <th>BNK안전재고</th>
                  </>
                )}
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={isMobile ? 3 : 12} className={styles.empty}>조회된 원자재가 없습니다.</td></tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id} onClick={() => openView(row.id)} style={{ cursor: 'pointer' }}>
                    <EllipsisCell>{renderCell(row.code)}</EllipsisCell>
                    <EllipsisCell>{renderCell(row.name)}</EllipsisCell>
                    {!isMobile && (
                      <>
                        <EllipsisCell>{renderCell(row.vehicle_name || row.vehicle_code)}</EllipsisCell>
                        <EllipsisCell>{renderCell(row.part_name || row.part_code)}</EllipsisCell>
                        <EllipsisCell>{row.color ? (row.color_code && row.color_code !== row.color ? `${row.color} (${row.color_code})` : row.color) : renderCell(row.color_code)}</EllipsisCell>
                        <EllipsisCell>{formatMm(row.thickness)}</EllipsisCell>
                        <EllipsisCell>{formatMm(row.width)}</EllipsisCell>
                        <EllipsisCell>{formatMm(row.length)}</EllipsisCell>
                        <EllipsisCell>{formatQty(row.supplier_safety_stock)}</EllipsisCell>
                        <EllipsisCell>{formatQty(row.bnk_warehouse_safety_stock)}</EllipsisCell>
                      </>
                    )}
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={styles.btnSmall} onClick={() => openEdit(row)}>수정</button>
                      <button type="button" className={styles.btnSmallDanger} onClick={() => handleDelete(row.id, row.name)}>삭제</button>
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
        const maxVisible = 5;
        let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
        let endPage = startPage + maxVisible - 1;
        if (endPage > totalPages) { endPage = totalPages; startPage = Math.max(1, endPage - maxVisible + 1); }
        const pages = [];
        for (let i = startPage; i <= endPage; i++) pages.push(i);
        return (
          <div className={styles.pagination}>
            <span className={styles.paginationTotal}>총 {total}건</span>
            <nav className={styles.pageNav} aria-label="페이지 네비게이션">
              <button type="button" className={styles.pageBtn} onClick={() => setPage(1)} disabled={page <= 1}>처음</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>이전</button>
              {startPage > 1 && <span className={styles.pageEllipsis}>…</span>}
              {pages.map((p) => (
                <button key={p} type="button" className={p === page ? `${styles.pageBtn} ${styles.pageBtnCurrent}` : styles.pageBtn} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ))}
              {endPage < totalPages && <span className={styles.pageEllipsis}>…</span>}
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage(totalPages)} disabled={page >= totalPages}>마지막</button>
            </nav>
          </div>
        );
      })()}

      {formOpen && formData && (
        <div className={styles.modalOverlay} onClick={closeForm} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="form-title">
            <h2 id="form-title" className={styles.modalTitle}>
              {formMode === 'add' && '원자재 등록'}
              {formMode === 'view' && '원자재 보기'}
              {formMode === 'edit' && '원자재 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'add' && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                {renderFormFields('add')}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={formSaving}>{formSaving ? '등록 중...' : '등록'}</button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>취소</button>
                </div>
              </form>
            )}

            {formMode === 'view' && (
              <div className={styles.viewForm}>
                <div className={styles.dl} style={{ gridTemplateColumns: '120px 1fr', margin: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <dt>원자재 종류</dt>
                  <dd><span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, fontSize: '0.8125rem', fontWeight: 600 }}>{renderCell(formData.kind ?? types.find((t) => t.id === formData.kind_id)?.name)}</span></dd>
                  <dt>자재코드</dt>
                  <dd style={{ fontFamily: 'monospace', letterSpacing: '0.03em' }}>{renderCell(formData.code)}</dd>
                  <dt>원자재 이름</dt>
                  <dd style={{ fontWeight: 600, color: '#0f172a' }}>{renderCell(formData.name)}</dd>
                </div>

                <h3 style={{ fontSize: '0.8125rem', color: '#64748b', margin: '1rem 0 0.5rem', fontWeight: 600 }}>차종 / 적용부 / 색상</h3>
                <div className={styles.dl} style={{ gridTemplateColumns: '120px 1fr', margin: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <dt>차종</dt>
                  <dd>{formData.vehicle_name ? `${formData.vehicle_name} (${formData.vehicle_code})` : renderCell(formData.vehicle_code)}</dd>
                  <dt>적용부</dt>
                  <dd>{formData.part_name ? `${formData.part_name} (${formData.part_code})` : renderCell(formData.part_code)}</dd>
                  <dt>색상</dt>
                  <dd>{formData.color ? `${formData.color}` : '-'}{formData.color_code ? <span style={{ marginLeft: 6, padding: '0.1rem 0.4rem', background: '#f1f5f9', borderRadius: 3, fontSize: '0.75rem', color: '#475569' }}>{formData.color_code}</span> : ''}</dd>
                </div>

                <h3 style={{ fontSize: '0.8125rem', color: '#64748b', margin: '1rem 0 0.5rem', fontWeight: 600 }}>규격</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                  {[
                    { label: '두께', value: formatMm(formData.thickness) },
                    { label: '폭', value: formatMm(formData.width) },
                    { label: '길이', value: formatMm(formData.length) },
                  ].map((item) => (
                    <div key={item.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                  <span>수정일자: {formData.updated_at ? formatDate(formData.updated_at) : '-'}</span>
                  <span>|</span>
                  <span>수정자: {renderCell(formData.updated_by)}</span>
                </div>

                <div className={styles.formActions}>
                  <button type="button" className={styles.btnPrimary} onClick={() => openEdit(formData)}>수정</button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>닫기</button>
                </div>
              </div>
            )}

            {formMode === 'edit' && (
              <form onSubmit={handleSubmitEdit} className={styles.form}>
                {renderFormFields('edit')}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={formSaving}>{formSaving ? '수정 중...' : '수정'}</button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>취소</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MasterMaterialInfo;
