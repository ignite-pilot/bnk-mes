import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import SelectDropdown from '../../components/SelectDropdown';
import styles from '../material/MaterialInfo.module.css';

const API = '/api/master-semi-products';

function formatDate(d) { if (!d) return ''; return new Date(d).toISOString().slice(0, 10); }
function formatNum(v) { if (v == null || v === '') return '-'; const n = Number(v); return Number.isNaN(n) ? '-' : String(n % 1 === 0 ? n : n.toFixed(2)); }

const fetchCode = (code) =>
  fetch(`/api/delivery-vehicles/codes/${code}`)
    .then((r) => r.json())
    .then((d) => (d.items || d.list || []).map((c) => ({ value: c.codeValue || c.value || c.code, label: c.label || c.codeName || c.name || c.codeValue, name: c.name || c.codeName || c.label || '' })))
    .catch(() => []);

const SEMI_TYPES = ['상지', '표지', '하지', '폼', '프라이머'];
const PAGE_SIZES = [10, 15, 20, 50, 100];

function MasterSemiProduct() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ semiType: '', vehicleCode: '', partCode: '', colorCode: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [vehicleCodes, setVehicleCodes] = useState([]);
  const [partCodes, setPartCodes] = useState([]);
  const [colorCodes, setColorCodes] = useState([]);

  const userName = user?.name || user?.loginId || '';

  useEffect(() => {
    fetchCode('VEHICLE_CODE').then(setVehicleCodes);
    fetchCode('PART_CODE').then(setPartCodes);
    fetchCode('COLOR_CODE').then(setColorCodes);
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.semiType) q.set('semiType', search.semiType);
      if (search.vehicleCode) q.set('vehicleCode', search.vehicleCode);
      if (search.partCode) q.set('partCode', search.partCode);
      if (search.colorCode) q.set('colorCode', search.colorCode);
      const res = await fetch(`${API}?${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || '조회 실패'); return; }
      setList(data.list || []); setTotal(data.total ?? 0);
    } catch { setError('조회 중 오류'); } finally { setLoading(false); }
  }, [page, limit, search]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchList(); };
  const handleResetSearch = () => { setSearch({ semiType: '', vehicleCode: '', partCode: '', colorCode: '' }); setPage(1); };

  const emptyForm = () => ({ semi_type: '', vehicle_code: '', vehicle_name: '', part_code: '', part_name: '', color_code: '', color_name: '', supplier: '', thickness: '', width: '', ratio: '', safety_stock: '' });

  const openAdd = () => { setFormMode('add'); setFormData(emptyForm()); setFormError(''); setFormOpen(true); };
  const openView = async (id) => {
    try {
      const res = await fetch(`${API}/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data.error || '조회 실패'); return; }
      setFormMode('view'); setFormData(data); setFormOpen(true);
    } catch { setFormError('조회 오류'); }
  };
  const openEdit = (row) => { setFormMode('edit'); setFormData({ ...row, thickness: row.thickness ?? '', width: row.width ?? '', ratio: row.ratio ?? '', safety_stock: row.safety_stock ?? '' }); setFormError(''); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setFormData(null); setFormError(''); fetchList(); };

  const buildBody = () => ({
    semi_type: formData.semi_type || null,
    vehicle_code: formData.vehicle_code || null, vehicle_name: formData.vehicle_name || null,
    part_code: formData.part_code || null, part_name: formData.part_name || null,
    color_code: formData.color_code || null, color_name: formData.color_name || null,
    supplier: formData.supplier?.trim() || null,
    thickness: formData.thickness !== '' ? Number(formData.thickness) : null,
    width: formData.width !== '' ? Number(formData.width) : null,
    ratio: formData.ratio !== '' ? Number(formData.ratio) : null,
    safety_stock: formData.safety_stock !== '' ? Number(formData.safety_stock) : null,
  });

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName) { setFormError('로그인 필요'); return; }
    if (!formData.semi_type) { setFormError('반제품 종류는 필수입니다.'); return; }
    setFormSaving(true); setFormError('');
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...buildBody(), createdBy: userName }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data.error || '등록 실패'); return; }
      closeForm();
    } catch { setFormError('등록 오류'); } finally { setFormSaving(false); }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    setFormSaving(true); setFormError('');
    try {
      const res = await fetch(`${API}/${formData.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...buildBody(), updatedBy: userName }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data.error || '수정 실패'); return; }
      closeForm();
    } catch { setFormError('수정 오류'); } finally { setFormSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedBy: userName }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || '삭제 실패'); return; }
      fetchList();
    } catch { setError('삭제 오류'); }
  };

  const handleExcelDownload = async () => {
    const q = new URLSearchParams();
    if (search.semiType) q.set('semiType', search.semiType);
    if (search.vehicleCode) q.set('vehicleCode', search.vehicleCode);
    if (search.partCode) q.set('partCode', search.partCode);
    if (search.colorCode) q.set('colorCode', search.colorCode);
    setError('');
    try {
      const res = await fetch(`${API}/export-excel?${q}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || '엑셀 다운로드 실패'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'master_semi_products.csv'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 200);
    } catch { setError('엑셀 다운로드 오류'); }
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
  const EllipsisCell = ({ children }) => <td className={styles.ellipsisCell}>{children}</td>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>반제품 정보</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          종류
          <SelectDropdown options={SEMI_TYPES.map(t => ({ value: t, label: t }))} value={search.semiType} onChange={(v) => setSearch(s => ({ ...s, semiType: v }))} placeholder="전체" style={{ minWidth: 100 }} />
        </label>
        <label className={styles.searchLabel}>
          차종
          <SelectDropdown options={vehicleCodes.map(c => ({ value: c.value, label: c.value }))} value={search.vehicleCode} onChange={(v) => setSearch(s => ({ ...s, vehicleCode: v }))} placeholder="전체" style={{ minWidth: 100 }} />
        </label>
        <label className={styles.searchLabel}>
          적용부
          <SelectDropdown options={partCodes.map(c => ({ value: c.value, label: c.value }))} value={search.partCode} onChange={(v) => setSearch(s => ({ ...s, partCode: v }))} placeholder="전체" style={{ minWidth: 100 }} />
        </label>
        <label className={styles.searchLabel}>
          색상
          <SelectDropdown options={colorCodes.map(c => ({ value: c.value, label: c.value }))} value={search.colorCode} onChange={(v) => setSearch(s => ({ ...s, colorCode: v }))} placeholder="전체" style={{ minWidth: 100 }} />
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
                <li key={i} className={styles.errorBlockerItem}>{e.row}행 [{e.semiType || e.code || e.name}]: {e.errors.join(', ')}</li>
              ))}
            </ul>
          )}
          <button type="button" className={styles.btnSmall} style={{ marginTop: '0.5rem' }} onClick={() => setUploadResult(null)}>닫기</button>
        </div>
      )}

      <div className={styles.listOptions}>
        <label>한번에 보기 <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>{PAGE_SIZES.map(n => <option key={n} value={n}>{n}개</option>)}</select></label>
      </div>

      {loading ? <p className={styles.loading}>조회 중...</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.masterTable}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              {!isMobile && <>
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
              </>}
              <col style={{ width: '9%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>반제품 종류</th>
                <th>차종</th>
                {!isMobile && <>
                  <th>적용부</th>
                  <th>색상</th>
                  <th>업체</th>
                  <th>두께</th>
                  <th>배율</th>
                  <th>폭</th>
                  <th>안전재고</th>
                </>}
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={isMobile ? 3 : 11} className={styles.empty}>조회된 반제품이 없습니다.</td></tr>
              ) : list.map(row => (
                <tr key={row.id} onClick={() => openView(row.id)} style={{ cursor: 'pointer' }}>
                  <EllipsisCell>{renderCell(row.semi_type)}</EllipsisCell>
                  <EllipsisCell>{renderCell(row.vehicle_code)}</EllipsisCell>
                  {!isMobile && <>
                    <EllipsisCell>{renderCell(row.part_code)}</EllipsisCell>
                    <EllipsisCell>{row.color_name ? `${row.color_name} (${row.color_code})` : renderCell(row.color_code)}</EllipsisCell>
                    <EllipsisCell>{renderCell(row.supplier)}</EllipsisCell>
                    <EllipsisCell>{formatNum(row.thickness)}</EllipsisCell>
                    <EllipsisCell>{formatNum(row.ratio)}</EllipsisCell>
                    <EllipsisCell>{formatNum(row.width)}</EllipsisCell>
                    <EllipsisCell>{row.safety_stock != null ? String(row.safety_stock) : '-'}</EllipsisCell>
                  </>}
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className={styles.btnSmall} onClick={() => openEdit(row)}>수정</button>
                    <button type="button" className={styles.btnSmallDanger} onClick={() => handleDelete(row.id)}>삭제</button>
                  </td>
                </tr>
              ))}
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
            <nav className={styles.pageNav}>
              <button type="button" className={styles.pageBtn} onClick={() => setPage(1)} disabled={page <= 1}>처음</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>이전</button>
              {startPage > 1 && <span className={styles.pageEllipsis}>…</span>}
              {pages.map((p) => (
                <button key={p} type="button" className={p === page ? `${styles.pageBtn} ${styles.pageBtnCurrent}` : styles.pageBtn} onClick={() => setPage(p)}>{p}</button>
              ))}
              {endPage < totalPages && <span className={styles.pageEllipsis}>…</span>}
              <button type="button" className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage(totalPages)} disabled={page >= totalPages}>마지막</button>
            </nav>
          </div>
        );
      })()}

      {formOpen && formData && (
        <div className={styles.modalOverlay} onClick={closeForm} role="presentation">
          <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className={styles.modalTitle}>
              {formMode === 'add' && '반제품 등록'}{formMode === 'view' && '반제품 보기'}{formMode === 'edit' && '반제품 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {formMode === 'view' ? (
              <div className={styles.viewForm}>
                <div className={styles.dl} style={{ gridTemplateColumns: '120px 1fr', margin: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <dt>반제품 종류</dt><dd>{renderCell(formData.semi_type)}</dd>
                  <dt>업체</dt><dd>{renderCell(formData.supplier)}</dd>
                  <dt>차종</dt><dd>{renderCell(formData.vehicle_code)}</dd>
                  <dt>적용부</dt><dd>{renderCell(formData.part_code)}</dd>
                  <dt>색상</dt><dd>{formData.color_code || '-'}{formData.color_name ? <span style={{ marginLeft: 6, padding: '0.1rem 0.4rem', background: '#f1f5f9', borderRadius: 3, fontSize: '0.75rem', color: '#475569' }}>{formData.color_name}</span> : ''}</dd>
                </div>
                <h3 style={{ fontSize: '0.8125rem', color: '#64748b', margin: '1rem 0 0.5rem', fontWeight: 600 }}>규격</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                  {[{ label: '두께', value: formatNum(formData.thickness) }, { label: '폭', value: formatNum(formData.width) }, { label: '배율', value: formatNum(formData.ratio) }, { label: '안전재고', value: formData.safety_stock != null ? String(formData.safety_stock) : '-' }].map(item => (
                    <div key={item.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                  <span>수정일자: {formData.updated_at ? formatDate(formData.updated_at) : '-'}</span><span>|</span><span>수정자: {renderCell(formData.updated_by)}</span>
                </div>
                <div className={styles.formActions}>
                  <button type="button" className={styles.btnPrimary} onClick={() => openEdit(formData)}>수정</button>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>닫기</button>
                </div>
              </div>
            ) : (
              <form onSubmit={formMode === 'add' ? handleSubmitAdd : handleSubmitEdit} className={styles.form}>
                <label className={styles.label}>반제품 종류
                  <SelectDropdown options={SEMI_TYPES.map(t => ({ value: t, label: t }))} value={formData.semi_type || ''} onChange={val => setFormData(f => ({ ...f, semi_type: val }))} placeholder="선택" style={{ minWidth: 100 }} />
                </label>
                <label className={styles.label}>업체<input type="text" value={formData.supplier || ''} onChange={e => setFormData(f => ({ ...f, supplier: e.target.value }))} className={styles.input} /></label>
                <label className={styles.label}>차종
                  <SelectDropdown options={vehicleCodes.map(c => ({ value: c.value, label: `${c.name} (${c.value})` }))} value={formData.vehicle_code || ''} onChange={val => { const found = vehicleCodes.find(c => c.value === val); setFormData(f => ({ ...f, vehicle_code: val || '', vehicle_name: found?.name || '' })); }} placeholder="선택" style={{ minWidth: 100 }} dropdownMinWidth={180} />
                </label>
                <label className={styles.label}>적용부
                  <SelectDropdown options={partCodes.map(c => ({ value: c.value, label: `${c.name} (${c.value})` }))} value={formData.part_code || ''} onChange={val => { const found = partCodes.find(c => c.value === val); setFormData(f => ({ ...f, part_code: val || '', part_name: found?.name || '' })); }} placeholder="선택" style={{ minWidth: 100 }} dropdownMinWidth={210} />
                </label>
                <label className={styles.label}>색상
                  <SelectDropdown options={colorCodes.map(c => ({ value: c.value, label: `${c.name} (${c.value})` }))} value={formData.color_code || ''} onChange={val => { const found = colorCodes.find(c => c.value === val); setFormData(f => ({ ...f, color_code: val || '', color_name: found?.name || '' })); }} placeholder="선택" style={{ minWidth: 100 }} dropdownMinWidth={180} />
                </label>
                <label className={styles.label}>두께<input type="number" step="any" min="0" value={formData.thickness} onChange={e => setFormData(f => ({ ...f, thickness: e.target.value }))} className={styles.input} /></label>
                <label className={styles.label}>폭<input type="number" step="any" min="0" value={formData.width} onChange={e => setFormData(f => ({ ...f, width: e.target.value }))} className={styles.input} /></label>
                <label className={styles.label}>배율<input type="number" step="any" min="0" value={formData.ratio} onChange={e => setFormData(f => ({ ...f, ratio: e.target.value }))} className={styles.input} /></label>
                <label className={styles.label}>안전재고<input type="number" min="0" value={formData.safety_stock} onChange={e => setFormData(f => ({ ...f, safety_stock: e.target.value }))} className={styles.input} /></label>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={formSaving}>{formSaving ? '저장 중...' : formMode === 'add' ? '등록' : '수정'}</button>
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

export default MasterSemiProduct;
