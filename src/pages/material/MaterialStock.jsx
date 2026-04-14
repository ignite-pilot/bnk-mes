/**
 * 원자재 재고 관리 (원자재.md, 기본규칙.md)
 * - 검색: 업체 종류, 원자재 업체, 창고 이름, 원자재(복수), 재고 기준일(선택 시에만 필터)
 * - 목록: flatten 라인, 위험도, 페이지네이션
 * - 등록: 원자재 업체 재고 / 비엔케이 재고, 보기/수정/삭제
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SelectDropdown from '../../components/SelectDropdown';
import RawMaterialSelectPopup from '../../components/RawMaterialSelectPopup';
import styles from './MaterialInfo.module.css';
import { fmtSpec } from '../inventory/formatSpec';

const API = '/api/material-stock';
const SUPPLIER_API = '/api/material-suppliers';
const MATERIAL_API = '/api/material';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const PAGE_SIZES = [10, 15, 20, 50, 100];

const RISK_COLORS = {
  red: '#dc2626',
  orange: '#ea580c',
  green: '#16a34a',
  lightbrown: '#b45309',
  darkbrown: '#78350f',
};

function MaterialStock() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({
    type: '',
    supplierId: '',
    rawMaterialIds: [],
    startDate: '',
    endDate: '',
  });
  const [materials, setMaterials] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { lineId }
  const [rawMaterialPopupOpen, setRawMaterialPopupOpen] = useState(false);
  // 인라인 수량 편집
  const [editingLineId, setEditingLineId] = useState(null);
  const [editingQty, setEditingQty] = useState('');

  // 엑셀 업로드 모달
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSupplierId, setUploadSupplierId] = useState('');
  const [uploadStockDate, setUploadStockDate] = useState(new Date().toISOString().slice(0, 10));
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  const userName = user?.name || user?.loginId || '';
  const LIST_FETCH_TIMEOUT_MS = 15000;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), LIST_FETCH_TIMEOUT_MS);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        startDate: search.startDate,
        endDate: search.endDate,
      });
      if (search.type) q.set('type', search.type);
      if (search.supplierId) q.set('supplierId', search.supplierId);
      if (search.rawMaterialIds.length) q.set('rawMaterialIds', search.rawMaterialIds.join(','));
      const res = await fetch(`${API}?${q}`, { signal: ac.signal });
      clearTimeout(t);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || '목록 조회에 실패했습니다.';
        setError(data.detail ? `${msg} (${data.detail})` : msg);
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
  }, [page, limit, search.startDate, search.endDate, search.type, search.supplierId, search.rawMaterialIds]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetch(`${SUPPLIER_API}?limit=100`)
      .then((r) => r.json())
      .then((d) => setSuppliers(d.list || []))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    fetch(`${MATERIAL_API}?limit=2000`)
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
    type: '',
    supplierId: '',
    rawMaterialIds: [],
    startDate: '',
    endDate: '',
  };
  const handleResetSearch = () => {
    setSearch(initialSearch);
    setPage(1);
  };

  const openAdd = () => {
    setFormData({
      supplierId: suppliers.length ? String(suppliers[0].id) : '',
      stockDate: formatDate(new Date()),
      lines: [{ raw_material_id: '', quantity: '' }],
    });
    setFormError('');
    setFormOpen(true);
  };

  const startEditLine = (lineId, currentQty) => {
    setEditingLineId(lineId);
    setEditingQty(currentQty != null ? String(Math.round(Number(currentQty))) : '');
  };

  const cancelEditLine = () => {
    setEditingLineId(null);
    setEditingQty('');
  };

  const saveEditLine = async (lineId) => {
    setError('');
    try {
      const res = await fetch(`${API}/lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: Number(editingQty) || 0, updatedBy: userName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '수정에 실패했습니다.');
        return;
      }
      cancelEditLine();
      fetchList();
    } catch {
      setError('수정 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteLine = async () => {
    if (!deleteConfirm) return;
    setError('');
    try {
      const res = await fetch(`${API}/lines/${deleteConfirm.lineId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '삭제에 실패했습니다.');
        setDeleteConfirm(null);
        return;
      }
      setDeleteConfirm(null);
      fetchList();
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
      setDeleteConfirm(null);
    }
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormData(null);
    setFormError('');
    fetchList();
  };

  // 원자재 선택용 유니크 옵션 목록
  const kindOptions = [...new Set(materials.map((m) => m.kind).filter(Boolean))].map((k) => ({ value: k, label: k }));

  const getFilteredOptions = (line) => {
    let filtered = materials;
    if (line.kind) filtered = filtered.filter((m) => m.kind === line.kind);
    if (line.vehicle_code) filtered = filtered.filter((m) => m.vehicle_code === line.vehicle_code);
    if (line.part_code) filtered = filtered.filter((m) => m.part_code === line.part_code);
    if (line.color_code) filtered = filtered.filter((m) => m.color_code === line.color_code);
    return filtered;
  };

  const getVehicleOptions = (line) => {
    let filtered = materials;
    if (line.kind) filtered = filtered.filter((m) => m.kind === line.kind);
    return [...new Set(filtered.map((m) => m.vehicle_code).filter(Boolean))].sort().map((v) => ({ value: v, label: v }));
  };

  const getPartOptions = (line) => {
    let filtered = materials;
    if (line.kind) filtered = filtered.filter((m) => m.kind === line.kind);
    if (line.vehicle_code) filtered = filtered.filter((m) => m.vehicle_code === line.vehicle_code);
    return [...new Set(filtered.map((m) => m.part_code).filter(Boolean))].sort().map((p) => ({ value: p, label: p }));
  };

  const getColorOptions = (line) => {
    let filtered = materials;
    if (line.kind) filtered = filtered.filter((m) => m.kind === line.kind);
    if (line.vehicle_code) filtered = filtered.filter((m) => m.vehicle_code === line.vehicle_code);
    if (line.part_code) filtered = filtered.filter((m) => m.part_code === line.part_code);
    return [...new Set(filtered.map((m) => m.color_code).filter(Boolean))].sort().map((c) => ({ value: c, label: c }));
  };

  /** 선택된 종류+차종+적용부+색상으로 원자재 ID를 자동 매칭 */
  const resolveRawMaterialId = (line) => {
    const matched = getFilteredOptions(line);
    return matched.length === 1 ? matched[0].id : null;
  };

  const addLine = () => {
    setFormData((f) => ({
      ...f,
      lines: [...(f.lines || []), { kind: '', vehicle_code: '', part_code: '', color_code: '', raw_material_id: '', quantity: '' }],
    }));
  };

  const removeLine = (idx) => {
    setFormData((f) => {
      const lines = [...(f.lines || [])];
      lines.splice(idx, 1);
      return { ...f, lines: lines.length ? lines : [{ kind: '', vehicle_code: '', part_code: '', color_code: '', raw_material_id: '', quantity: '' }] };
    });
  };

  const updateLine = (idx, field, value) => {
    setFormData((f) => {
      const lines = [...(f.lines || [])];
      const updated = { ...lines[idx], [field]: value };
      // 상위 필터 변경 시 하위 값 초기화
      if (field === 'kind') { updated.vehicle_code = ''; updated.part_code = ''; updated.color_code = ''; updated.raw_material_id = ''; }
      if (field === 'vehicle_code') { updated.part_code = ''; updated.color_code = ''; updated.raw_material_id = ''; }
      if (field === 'part_code') { updated.color_code = ''; updated.raw_material_id = ''; }
      if (field === 'color_code') { updated.raw_material_id = ''; }
      // 자동 매칭
      const matched = getFilteredOptions(updated);
      if (matched.length === 1) updated.raw_material_id = matched[0].id;
      lines[idx] = updated;
      return { ...f, lines };
    });
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setFormError('수정자(등록자)는 필수입니다. 로그인 후 이용해 주세요.');
      return;
    }
    if (!formData.supplierId) {
      setFormError('업체를 선택해 주세요.');
      return;
    }
    if (!formData.stockDate?.trim()) {
      setFormError('재고 기준일을 입력해 주세요.');
      return;
    }
    const unresolvedLines = (formData.lines || []).filter((l) => l.kind && l.vehicle_code && l.part_code && l.color_code && !l.raw_material_id);
    if (unresolvedLines.length > 0) {
      setFormError('원자재가 매칭되지 않은 항목이 있습니다. 마스터에 등록된 원자재인지 확인해 주세요.');
      return;
    }
    const lineList = (formData.lines || []).filter((l) => l.raw_material_id && (l.quantity !== '' && l.quantity != null));
    if (lineList.length === 0) {
      setFormError('원자재 재고 정보를 1건 이상 입력해 주세요.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const body = {
        snapshotType: 'supplier',
        supplierId: Number(formData.supplierId),
        stockDate: formData.stockDate.trim(),
        lines: lineList.map((l) => ({ raw_material_id: Number(l.raw_material_id), quantity: Number(l.quantity) || 0 })),
        updatedBy: userName.trim(),
      };
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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



  const handleExcelDownload = async () => {
    const q = new URLSearchParams({
      startDate: search.startDate,
      endDate: search.endDate,
    });
    if (search.type) q.set('type', search.type);
    if (search.supplierId) q.set('supplierId', search.supplierId);
    if (search.rawMaterialIds.length) q.set('rawMaterialIds', search.rawMaterialIds.join(','));
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
      a.download = 'material_stock.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 200);
    } catch {
      setError('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  const openUploadModal = () => {
    setUploadSupplierId('');
    setUploadStockDate(new Date().toISOString().slice(0, 10));
    setUploadResult(null);
    setUploadOpen(true);
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!uploadSupplierId) { setError('업체를 선택해 주세요.'); return; }
    if (!uploadStockDate) { setError('재고 기준일을 입력해 주세요.'); return; }
    setUploading(true);
    setUploadResult(null);
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const q = new URLSearchParams({
        supplierId: uploadSupplierId,
        stockDate: uploadStockDate,
        updatedBy: userName,
      });
      const res = await fetch(`${API}/upload-excel?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || '업로드에 실패했습니다.'); return; }
      setUploadResult(data);
      if (data.inserted > 0) fetchList();
    } catch { setError('업로드 중 오류가 발생했습니다.'); } finally { setUploading(false); }
  };

  const renderCell = (v) => (v != null && v !== '' ? String(v) : '-');
  /** 원자재 수량·안전재고 등 숫자: 정수만 표시 */
  const formatQty = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? String(Math.round(Number(v))) : '-');

  const rawMaterialDisplay = (row) => {
    const parts = [row.raw_material_kind, row.raw_material_name].filter(Boolean);
    return parts.length ? parts.join(' / ') : renderCell(row.raw_material_name);
  };

  const safeStock = (row) =>
    row.snapshot_type === 'bnk' ? row.bnk_warehouse_safety_stock : row.supplier_safety_stock;

  const riskStyle = (colorKey) => {
    const hex = RISK_COLORS[colorKey] || '#64748b';
    return { backgroundColor: hex, color: '#fff', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.75rem' };
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  const pages = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);
  if (startPage > 1) pages.unshift(1);
  if (endPage < totalPages) pages.push(totalPages);
  const uniqPages = [...new Set(pages)].sort((a, b) => a - b);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>원자재 재고 관리</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <label className={styles.searchLabel}>
          업체 종류
          <SelectDropdown
            options={[{ value: '', label: '전체' }, { value: 'supplier', label: '원자재' }, { value: 'bnk', label: '비엔케이' }]}
            value={search.type}
            onChange={(val) => setSearch((s) => ({ ...s, type: val }))}
            placeholder="전체"
            style={{ minWidth: 120 }}
          />
        </label>
        <label className={styles.searchLabel}>
          업체
          <SelectDropdown
            options={[{ value: '', label: '전체' }, ...suppliers.map((s) => ({ value: String(s.id), label: s.name }))]}
            value={search.supplierId}
            onChange={(val) => setSearch((s) => ({ ...s, supplierId: val }))}
            placeholder="전체"
            style={{ minWidth: 120 }}
          />
        </label>
        <label className={styles.searchLabel}>
          원자재 (복수 선택)
          <div>
            <button
              type="button"
              className={styles.input}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => setRawMaterialPopupOpen(true)}
            >
              {search.rawMaterialIds.length === 0
                ? '원자재 선택'
                : `${search.rawMaterialIds.length}개 선택됨`}
            </button>
          </div>
        </label>
        <RawMaterialSelectPopup
          open={rawMaterialPopupOpen}
          onClose={() => setRawMaterialPopupOpen(false)}
          materials={materials}
          selectedIds={search.rawMaterialIds.map(Number).filter((n) => !Number.isNaN(n))}
          onConfirm={(ids) => setSearch((s) => ({ ...s, rawMaterialIds: ids.map(String) }))}
          title="원자재 선택 (검색 조건)"
        />
        <label className={styles.searchLabel}>
          재고 기준일(시작)
          <input
            type="date"
            value={search.startDate}
            onChange={(e) => setSearch((s) => ({ ...s, startDate: e.target.value }))}
            className={styles.input}
          />
        </label>
        <label className={styles.searchLabel}>
          재고 기준일(종료)
          <input
            type="date"
            value={search.endDate}
            onChange={(e) => setSearch((s) => ({ ...s, endDate: e.target.value }))}
            className={styles.input}
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
          재고 등록
        </button>
        <button type="button" className={styles.btnSecondary} onClick={openUploadModal}>
          엑셀 업로드
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
              setLimit(Number(e.target.value));
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
          <table className={styles.table} style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '90px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '50px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '50px' }} />
              <col style={{ width: '55px' }} />
              <col style={{ width: '55px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>재고 기준일</th>
                <th>업체</th>
                <th>종류</th>
                <th>차종</th>
                <th>적용부</th>
                <th>색상</th>
                <th>두께</th>
                <th>폭</th>
                <th>재고 수량</th>
                <th>안전재고</th>
                <th>위험도</th>
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={12} className={styles.empty}>
                    조회된 재고가 없습니다.
                  </td>
                </tr>
              ) : (
                list.map((row, idx) => (
                  <tr key={`${row.line_id}-${idx}`}>
                    <td>{formatDate(row.stock_date)}</td>
                    <td>{row.supplier_name || '-'}</td>
                    <td>{row.raw_material_kind || '-'}</td>
                    <td>{row.vehicle_code || '-'}</td>
                    <td>{row.part_code || '-'}</td>
                    <td>{row.color_code || '-'}</td>
                    <td>{fmtSpec(row.thickness) || '-'}</td>
                    <td>{fmtSpec(row.width) || '-'}</td>
                    <td>
                      {editingLineId === row.line_id ? (
                        <input
                          type="number"
                          min={0}
                          value={editingQty}
                          onChange={(e) => setEditingQty(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditLine(row.line_id); if (e.key === 'Escape') cancelEditLine(); }}
                          className={styles.input}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '0.2rem 0.4rem', fontSize: '0.8125rem', margin: 0 }}
                          autoFocus
                        />
                      ) : (
                        formatQty(row.quantity)
                      )}
                    </td>
                    <td>{formatQty(safeStock(row))}</td>
                    <td>
                      <span style={riskStyle(row.risk_color)}>{row.risk_label || '-'}</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editingLineId === row.line_id ? (
                        <>
                          <button type="button" className={styles.btnSmall} style={{ background: '#dcfce7', borderColor: '#86efac', color: '#166534' }} onClick={() => saveEditLine(row.line_id)}>
                            저장
                          </button>
                          <button type="button" className={styles.btnSmall} onClick={cancelEditLine}>
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className={styles.btnSmall} onClick={() => startEditLine(row.line_id, row.quantity)}>
                            수정
                          </button>
                          <button type="button" className={styles.btnSmallDanger} onClick={() => setDeleteConfirm({ lineId: row.line_id })}>
                            삭제
                          </button>
                        </>
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
            <button type="button" className={styles.pageBtn} onClick={() => setPage(1)} disabled={page <= 1} aria-label="처음">
              처음
            </button>
            <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="이전">
              이전
            </button>
            {uniqPages.map((p, i) => (
              <span key={p}>
                {i > 0 && uniqPages[i - 1] !== p - 1 && <span style={{ padding: '0 0.25rem' }}>…</span>}
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
            <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="다음">
              다음
            </button>
            <button type="button" className={styles.pageBtn} onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="마지막">
              마지막
            </button>
          </nav>
        </div>
      )}

      {formOpen && formData && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }} role="presentation">
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="stock-form-title" style={{ maxWidth: 960 }}>
            <h2 id="stock-form-title" className={styles.modalTitle}>
              재고 등록
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {(
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ width: 160 }}>
                    <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>업체 <span className={styles.required}>*</span></div>
                    <SelectDropdown
                      options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
                      value={String(formData.supplierId ?? '')}
                      onChange={(val) => setFormData((f) => ({ ...f, supplierId: val }))}
                      placeholder="업체 선택"
                      style={{ minWidth: 0 }}
                    />
                  </div>
                  <div style={{ width: 160 }}>
                    <div style={{ fontSize: '0.8125rem', color: '#334155', marginBottom: '0.25rem' }}>재고 기준일 <span className={styles.required}>*</span></div>
                    <input
                      type="date"
                      value={formData.stockDate || ''}
                      onChange={(e) => setFormData((f) => ({ ...f, stockDate: e.target.value }))}
                      className={styles.input}
                      style={{ width: '100%', boxSizing: 'border-box', height: '2rem' }}
                      required
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>원자재별 재고 수량</span>
                    <button type="button" className={styles.btnSecondary} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={addLine}>
                      + 원자재 추가
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '24px 0.8fr 1fr 1.2fr 0.8fr 100px 28px', gap: '0 0.4rem', alignItems: 'center', marginBottom: '0.25rem', padding: '0 0.4rem' }}>
                    <div />
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>종류</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>차종</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>적용부</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>색상</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>수량</div>
                    <div />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {(formData.lines || []).map((line, idx) => {
                      const matched = getFilteredOptions(line);
                      const isMatched = line.raw_material_id && matched.length === 1;
                      return (
                        <div key={idx}>
                          <div style={{ display: 'grid', gridTemplateColumns: '24px 0.8fr 1fr 1.2fr 0.8fr 100px 28px', gap: '0 0.4rem', alignItems: 'center', padding: '0.3rem 0.4rem', background: isMatched ? '#f0fdf4' : '#fff', border: `1px solid ${isMatched ? '#86efac' : '#e2e8f0'}`, borderRadius: 6, overflow: 'hidden' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center' }}>{idx + 1}</span>
                            <div style={{ minWidth: 0 }}>
                              <SelectDropdown options={kindOptions} value={line.kind || ''} onChange={(val) => updateLine(idx, 'kind', val)} placeholder="선택" style={{ minWidth: 0 }} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <SelectDropdown options={getVehicleOptions(line)} value={line.vehicle_code || ''} onChange={(val) => updateLine(idx, 'vehicle_code', val)} placeholder="선택" disabled={!line.kind} style={{ minWidth: 0 }} dropdownMinWidth={140} searchable />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <SelectDropdown options={getPartOptions(line)} value={line.part_code || ''} onChange={(val) => updateLine(idx, 'part_code', val)} placeholder="선택" disabled={!line.vehicle_code} style={{ minWidth: 0 }} dropdownMinWidth={180} searchable />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <SelectDropdown options={getColorOptions(line)} value={line.color_code || ''} onChange={(val) => updateLine(idx, 'color_code', val)} placeholder="선택" disabled={!line.part_code} style={{ minWidth: 0 }} dropdownMinWidth={140} searchable />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <input type="number" min={0} step={1} value={line.quantity ?? ''} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className={styles.input} placeholder="수량" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
                            </div>
                            <button type="button" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem', padding: 0, lineHeight: 1, textAlign: 'center' }} onClick={() => removeLine(idx)} title="삭제">×</button>
                          </div>
                          {line.kind && line.vehicle_code && line.part_code && line.color_code && !isMatched && (
                            <div style={{ fontSize: '0.7rem', color: '#ea580c', marginTop: '0.15rem', paddingLeft: '28px' }}>
                              {matched.length === 0 ? '해당 조합의 원자재가 마스터에 없습니다.' : `${matched.length}건 매칭 — 두께/폭이 다른 원자재가 여러 개 있습니다.`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.25rem' }}>수정일자·수정자는 자동 기록됩니다.</p>
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

          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className={styles.modalOverlay} onClick={() => setDeleteConfirm(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 420 }}>
            <h2 className={styles.modalTitle} style={{ color: '#dc2626' }}>재고 삭제</h2>
            <div style={{ padding: '1rem', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', marginBottom: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#991b1b' }}>
                이 재고 항목을 삭제하시겠습니까?
              </p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#b91c1c' }}>삭제 시 복구할 수 없습니다.</p>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.btnPrimary} style={{ background: '#dc2626' }} onClick={handleDeleteLine}>
                삭제
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setDeleteConfirm(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) { setUploadOpen(false); setUploadResult(null); setError(''); } }} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 500 }}>
            <h2 className={styles.modalTitle}>원자재 재고 엑셀 업로드</h2>
            {error && <div className={styles.error}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <label className={styles.label} style={{ marginBottom: '0.75rem' }}>
                  업체 <span className={styles.required}>*</span>
                  <SelectDropdown
                    options={suppliers.map(s => ({ value: String(s.id), label: s.name }))}
                    value={uploadSupplierId}
                    onChange={(val) => setUploadSupplierId(val)}
                    placeholder="업체 선택"
                  />
                </label>
                <label className={styles.label}>
                  재고 기준일 <span className={styles.required}>*</span>
                  <input type="date" value={uploadStockDate} onChange={(e) => setUploadStockDate(e.target.value)} className={styles.input} />
                </label>
              </div>

              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>엑셀 파일 업로드</div>
                <label className={styles.btnPrimary} style={{ cursor: uploading || !uploadSupplierId || !uploadStockDate ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: uploading || !uploadSupplierId || !uploadStockDate ? 0.6 : 1 }}>
                  {uploading ? '업로드 중...' : '파일 선택 및 업로드'}
                  <input type="file" accept=".xlsx,.xls" onChange={handleUploadFile} style={{ display: 'none' }} disabled={uploading || !uploadSupplierId || !uploadStockDate} />
                </label>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem', marginBottom: 0 }}>
                  업체별 엑셀 파일(.xlsx)을 업로드하면 자동으로 파싱됩니다.<br />
                  현재 지원: 현진, 협성
                </p>
              </div>

              {uploadResult && (
                <div style={{ padding: '0.75rem 1rem', background: uploadResult.errors.length > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${uploadResult.errors.length > 0 ? '#fcd34d' : '#86efac'}`, borderRadius: 8, fontSize: '0.875rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: uploadResult.errors.length > 0 ? '0.5rem' : 0, color: uploadResult.errors.length > 0 ? '#92400e' : '#166534' }}>
                    전체 {uploadResult.totalRows}건 중 {uploadResult.inserted}건 등록 완료{uploadResult.errors.length > 0 && `, ${uploadResult.errors.length}건 오류`}
                  </div>
                  {uploadResult.errors.length > 0 && (
                    <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8125rem', maxHeight: '200px', overflow: 'auto', color: '#92400e' }}>
                      {uploadResult.errors.map((e, i) => (
                        <li key={i}>{e.row}행 [{e.name}]: {Array.isArray(e.errors) ? e.errors.join(', ') : e.error}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className={styles.formActions} style={{ marginTop: '1rem' }}>
              <button type="button" className={styles.btnSecondary} onClick={() => { setUploadOpen(false); setUploadResult(null); setError(''); }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MaterialStock;
