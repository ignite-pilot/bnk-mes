/**
 * 원자재 재고 관리 (원자재.md, 기본규칙.md)
 * - 검색: 업체 종류, 원자재 업체, 창고 이름, 원자재(복수), 재고 기준일(기본 1주)
 * - 목록: flatten 라인, 위험도, 페이지네이션
 * - 등록: 원자재 업체 재고 / 비엔케이 재고, 보기/수정/삭제
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RawMaterialSelectPopup from '../../components/RawMaterialSelectPopup';
import styles from './MaterialInfo.module.css';

const API = '/api/material-stock';
const WAREHOUSE_API = '/api/material-warehouses';
const MATERIAL_API = '/api/material';

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { startDate: formatDate(start), endDate: formatDate(end) };
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
    warehouseName: '',
    rawMaterialIds: [],
    ...defaultDateRange(),
  });
  const [supplierWarehouses, setSupplierWarehouses] = useState([]);
  const [bnkWarehouses, setBnkWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formVariant, setFormVariant] = useState(null); // 'add-supplier' | 'add-bnk' | 'view' | 'edit'
  const [formData, setFormData] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { snapshotId, lineCount }
  const [rawMaterialPopupOpen, setRawMaterialPopupOpen] = useState(false);
  /** 창고별 보관 원자재 ID 목록 (원자재 업체 창고 선택 시에만 사용, null이면 전체) */
  const [warehouseMaterialIds, setWarehouseMaterialIds] = useState(null);

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
      if (search.warehouseName.trim()) q.set('warehouseName', search.warehouseName.trim());
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
  }, [page, limit, search.startDate, search.endDate, search.type, search.supplierId, search.warehouseName, search.rawMaterialIds]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '500' });
    fetch(`${WAREHOUSE_API}?${params}`)
      .then((r) => r.json())
      .then((d) => setSupplierWarehouses(d.list || []))
      .catch(() => setSupplierWarehouses([]));
  }, []);

  useEffect(() => {
    fetch(`${API}/bnk-warehouses`)
      .then((r) => r.json())
      .then((d) => setBnkWarehouses(d.list || []))
      .catch(() => setBnkWarehouses([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '500' });
    fetch(`${MATERIAL_API}?${params}`)
      .then((r) => r.json())
      .then((d) => setMaterials(d.list || []))
      .catch(() => setMaterials([]));
  }, []);

  /** 원자재 업체 창고 선택 시 해당 창고 보관 원자재 목록 로드 */
  useEffect(() => {
    if (!formOpen || formVariant !== 'add-supplier' || !formData?.supplierWarehouseId) {
      setWarehouseMaterialIds(null);
      return;
    }
    const wid = formData.supplierWarehouseId;
    fetch(`${WAREHOUSE_API}/${wid}`)
      .then((r) => r.json())
      .then((d) => setWarehouseMaterialIds(Array.isArray(d.raw_material_ids) ? d.raw_material_ids : []))
      .catch(() => setWarehouseMaterialIds([]));
  }, [formOpen, formVariant, formData?.supplierWarehouseId]);

  /** 등록 폼에서 노출할 원자재 목록: 업체 창고 선택 시 해당 창고 보관 원자재만, 비엔케이/미선택 시 전체 */
  const materialsForStock =
    formVariant === 'add-supplier' && formData?.supplierWarehouseId
      ? Array.isArray(warehouseMaterialIds)
        ? materials.filter((m) => warehouseMaterialIds.includes(m.id))
        : [] /* 로딩 중에는 빈 목록 */
      : materials;

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchList();
  };
  const initialSearch = { type: '', supplierId: '', warehouseName: '', rawMaterialIds: [], ...defaultDateRange() };
  const handleResetSearch = () => {
    setSearch(initialSearch);
    setPage(1);
  };

  const openAddSupplier = () => {
    setFormVariant('add-supplier');
    setWarehouseMaterialIds(null);
    setFormData({
      snapshotType: 'supplier',
      supplierWarehouseId: supplierWarehouses.length ? String(supplierWarehouses[0].id) : '',
      stockDate: formatDate(new Date()),
      lines: [{ raw_material_id: '', quantity: '' }],
    });
    setFormError('');
    setFormOpen(true);
  };

  const openAddBnk = () => {
    setFormVariant('add-bnk');
    setWarehouseMaterialIds(null);
    setFormData({
      snapshotType: 'bnk',
      bnkWarehouseId: bnkWarehouses.length ? String(bnkWarehouses[0].id) : '',
      stockDate: formatDate(new Date()),
      lines: [{ raw_material_id: materials.length ? materials[0].id : '', quantity: '' }],
    });
    setFormError('');
    setFormOpen(true);
  };

  const handleSupplierWarehouseChange = (newId) => {
    setFormData((f) => ({
      ...f,
      supplierWarehouseId: newId,
      lines: [{ raw_material_id: '', quantity: '' }],
    }));
  };

  const openView = async (snapshotId) => {
    setFormError('');
    try {
      const res = await fetch(`${API}/${snapshotId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '조회에 실패했습니다.');
        return;
      }
      setFormVariant('view');
      setFormData(data);
      setFormOpen(true);
    } catch {
      setFormError('조회 중 오류가 발생했습니다.');
    }
  };

  const openEdit = async (snapshotId) => {
    setFormError('');
    try {
      const res = await fetch(`${API}/${snapshotId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || '조회에 실패했습니다.');
        return;
      }
      setFormVariant('edit');
      setFormData({
        ...data,
        lines: (data.lines || []).map((l) => ({ raw_material_id: l.raw_material_id, quantity: l.quantity })),
      });
      setFormOpen(true);
    } catch {
      setFormError('조회 중 오류가 발생했습니다.');
    }
  };
  const switchToEdit = () => {
    if (formData?.id) openEdit(formData.id);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormVariant(null);
    setFormData(null);
    setFormError('');
    setDeleteConfirm(null);
    setWarehouseMaterialIds(null);
    fetchList();
  };

  const addLine = () => {
    const firstId = materialsForStock.length ? materialsForStock[0].id : '';
    setFormData((f) => ({
      ...f,
      lines: [...(f.lines || []), { raw_material_id: firstId, quantity: '' }],
    }));
  };

  const removeLine = (idx) => {
    setFormData((f) => {
      const lines = [...(f.lines || [])];
      lines.splice(idx, 1);
      return { ...f, lines: lines.length ? lines : [{ raw_material_id: '', quantity: '' }] };
    });
  };

  const updateLine = (idx, field, value) => {
    setFormData((f) => {
      const lines = [...(f.lines || [])];
      lines[idx] = { ...lines[idx], [field]: value };
      return { ...f, lines };
    });
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setFormError('수정자(등록자)는 필수입니다. 로그인 후 이용해 주세요.');
      return;
    }
    const isSupplier = formData.snapshotType === 'supplier';
    if (isSupplier && !formData.supplierWarehouseId) {
      setFormError('원자재 업체 창고를 선택해 주세요.');
      return;
    }
    if (!isSupplier && !formData.bnkWarehouseId) {
      setFormError('비엔케이 창고를 선택해 주세요.');
      return;
    }
    if (!formData.stockDate?.trim()) {
      setFormError('재고 기준일을 입력해 주세요.');
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
        snapshotType: formData.snapshotType,
        stockDate: formData.stockDate.trim(),
        lines: lineList.map((l) => ({ raw_material_id: Number(l.raw_material_id), quantity: Number(l.quantity) || 0 })),
        updatedBy: userName.trim(),
      };
      if (formData.snapshotType === 'supplier') body.supplierWarehouseId = Number(formData.supplierWarehouseId);
      else body.bnkWarehouseId = Number(formData.bnkWarehouseId);
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

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setFormError('수정자는 필수입니다.');
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
      const res = await fetch(`${API}/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockDate: formData.stock_date || formData.stockDate,
          supplierWarehouseId: formData.supplier_warehouse_id,
          bnkWarehouseId: formData.bnk_warehouse_id,
          lines: lineList.map((l) => ({ raw_material_id: Number(l.raw_material_id), quantity: Number(l.quantity) || 0 })),
          updatedBy: userName.trim(),
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

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (!window.confirm(`이 재고 스냅샷(총 ${deleteConfirm.lineCount}건 라인)을 삭제하면 복구할 수 없습니다. 삭제하시겠습니까?`)) {
      setDeleteConfirm(null);
      return;
    }
    setError('');
    try {
      const res = await fetch(`${API}/${deleteConfirm.snapshotId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '삭제에 실패했습니다.');
        setDeleteConfirm(null);
        return;
      }
      setDeleteConfirm(null);
      closeForm();
      fetchList();
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
      setDeleteConfirm(null);
    }
  };

  const handleExcelDownload = async () => {
    const q = new URLSearchParams({
      startDate: search.startDate,
      endDate: search.endDate,
    });
    if (search.type) q.set('type', search.type);
    if (search.supplierId) q.set('supplierId', search.supplierId);
    if (search.warehouseName.trim()) q.set('warehouseName', search.warehouseName.trim());
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
          <select
            value={search.type}
            onChange={(e) => setSearch((s) => ({ ...s, type: e.target.value }))}
            className={styles.input}
          >
            <option value="">전체</option>
            <option value="supplier">원자재</option>
            <option value="bnk">비엔케이</option>
          </select>
        </label>
        <label className={styles.searchLabel}>
          원자재 업체
          <select
            value={search.supplierId}
            onChange={(e) => setSearch((s) => ({ ...s, supplierId: e.target.value }))}
            className={styles.input}
          >
            <option value="">전체</option>
            {[...new Map(supplierWarehouses.map((w) => [w.supplier_id, w])).entries()].map(([sid, w]) => (
              <option key={sid} value={String(sid)}>
                {w.supplier_name || `업체 ${sid}`}
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
        <button type="button" className={styles.btnPrimary} onClick={openAddSupplier}>
          원자재 업체 재고 현황 추가
        </button>
        <button type="button" className={styles.btnPrimary} onClick={openAddBnk}>
          비엔케이 재고 현황 추가
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
          <table className={styles.table}>
            <thead>
              <tr>
                <th>재고 기준일</th>
                <th>원자재</th>
                <th>업체 종류</th>
                <th>재고 수량</th>
                <th>안전재고</th>
                <th>위험도</th>
                <th>기능</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    조회된 재고가 없습니다.
                  </td>
                </tr>
              ) : (
                list.map((row, idx) => (
                  <tr key={`${row.snapshot_id}-${row.raw_material_id}-${idx}`}>
                    <td>{formatDate(row.stock_date)}</td>
                    <td>
                      <Link to="/material/info" className={styles.linkBtn} style={{ textDecoration: 'underline' }}>
                        {rawMaterialDisplay(row)}
                      </Link>
                    </td>
                    <td>{row.snapshot_type === 'bnk' ? '비엔케이' : '원자재'}</td>
                    <td>{formatQty(row.quantity)}</td>
                    <td>{formatQty(safeStock(row))}</td>
                    <td>
                      <span style={riskStyle(row.risk_color)}>{row.risk_label || '-'}</span>
                    </td>
                    <td>
                      <button type="button" className={styles.btnSmall} onClick={() => openView(row.snapshot_id)}>
                        상세
                      </button>
                      <button type="button" className={styles.btnSmall} onClick={() => openEdit(row.snapshot_id)}>
                        수정
                      </button>
                      <button
                        type="button"
                        className={styles.btnSmallDanger}
                        onClick={() =>
                          setDeleteConfirm({
                            snapshotId: row.snapshot_id,
                            lineCount: list.filter((r) => r.snapshot_id === row.snapshot_id).length,
                          })
                        }
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
        <div className={styles.modalOverlay} onClick={closeForm} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="stock-form-title" style={{ maxWidth: 560 }}>
            <h2 id="stock-form-title" className={styles.modalTitle}>
              {formVariant === 'add-supplier' && '원자재 업체 재고 현황 추가'}
              {formVariant === 'add-bnk' && '비엔케이 재고 현황 추가'}
              {formVariant === 'view' && '재고 상세'}
              {formVariant === 'edit' && '원천 데이터 수정'}
            </h2>
            {formError && <div className={styles.error}>{formError}</div>}

            {(formVariant === 'add-supplier' || formVariant === 'add-bnk') && (
              <form onSubmit={handleSubmitAdd} className={styles.form}>
                {formVariant === 'add-supplier' && (
                  <label className={styles.label}>
                    원자재 업체 창고 <span className={styles.required}>(필수)</span>
                    <select
                      value={String(formData.supplierWarehouseId ?? '')}
                      onChange={(e) => handleSupplierWarehouseChange(e.target.value)}
                      className={styles.input}
                      required
                    >
                      {supplierWarehouses.map((w) => (
                        <option key={w.id} value={String(w.id)}>
                          {w.supplier_name || ''} / {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {formVariant === 'add-bnk' && (
                  <label className={styles.label}>
                    비엔케이 창고 <span className={styles.required}>(필수)</span>
                    <select
                      value={String(formData.bnkWarehouseId ?? '')}
                      onChange={(e) => setFormData((f) => ({ ...f, bnkWarehouseId: e.target.value }))}
                      className={styles.input}
                      required
                    >
                      {bnkWarehouses.map((w) => (
                        <option key={w.id} value={String(w.id)}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={styles.label}>
                  재고 기준일 <span className={styles.required}>(필수)</span>
                  <input
                    type="date"
                    value={formData.stockDate || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, stockDate: e.target.value }))}
                    className={styles.input}
                    required
                  />
                </label>
                <div className={styles.label}>
                  원자재별 재고 수량
                  {formVariant === 'add-supplier' && formData?.supplierWarehouseId && !Array.isArray(warehouseMaterialIds) && (
                    <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                      보관 원자재 목록을 불러오는 중...
                    </p>
                  )}
                  {formVariant === 'add-supplier' && Array.isArray(warehouseMaterialIds) && warehouseMaterialIds.length === 0 && (
                    <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                      이 창고에 보관 원자재가 등록되어 있지 않습니다. 창고 정보에서 보관 원자재를 먼저 설정해 주세요.
                    </p>
                  )}
                  {(formData.lines || []).map((line, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                      <select
                        value={String(line.raw_material_id ?? '')}
                        onChange={(e) => updateLine(idx, 'raw_material_id', e.target.value)}
                        className={styles.input}
                        style={{ flex: 1 }}
                      >
                        {materialsForStock.map((m) => (
                          <option key={m.id} value={String(m.id)}>
                            {m.kind ? `${m.kind} / ${m.name}` : m.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.quantity ?? ''}
                        onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        className={styles.input}
                        placeholder="수량"
                        style={{ width: 100 }}
                      />
                      <button type="button" className={styles.btnSmall} onClick={() => removeLine(idx)}>
                        삭제
                      </button>
                    </div>
                  ))}
                  <button type="button" className={styles.btnSecondary} style={{ marginTop: '0.5rem' }} onClick={addLine} disabled={formVariant === 'add-supplier' && Array.isArray(warehouseMaterialIds) && warehouseMaterialIds.length === 0}>
                    원자재 추가
                  </button>
                </div>
                <p className={styles.optionalHint}>수정일자·수정자는 자동 기록됩니다.</p>
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

            {formVariant === 'view' && (
              <>
                <dl className={styles.dl}>
                  <dt>재고 기준일</dt>
                  <dd>{formatDate(formData.stock_date)}</dd>
                  <dt>업체 종류</dt>
                  <dd>{formData.snapshot_type === 'bnk' ? '비엔케이' : '원자재'}</dd>
                  <dt>창고</dt>
                  <dd>{formData.snapshot_type === 'bnk' ? formData.bnk_warehouse_name : (formData.supplier_name && formData.supplier_warehouse_name ? `${formData.supplier_name} / ${formData.supplier_warehouse_name}` : formData.supplier_warehouse_name || formData.bnk_warehouse_name)}</dd>
                  <dt>수정일자</dt>
                  <dd>{formData.updated_at ? formatDate(formData.updated_at) : '-'}</dd>
                  <dt>수정자</dt>
                  <dd>{renderCell(formData.updated_by)}</dd>
                </dl>
                <div className={styles.label}>원자재별 재고</div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>원자재</th>
                        <th>수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(formData.lines || []).map((l, i) => (
                        <tr key={i}>
                          <td>{l.raw_material_kind ? `${l.raw_material_kind} / ${l.raw_material_name}` : l.raw_material_name}</td>
                          <td>{formatQty(l.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.formActions}>
                  <button type="button" className={styles.btnSecondary} onClick={closeForm}>
                    닫기
                  </button>
                  <button type="button" className={styles.btnPrimary} onClick={switchToEdit}>
                    수정
                  </button>
                </div>
              </>
            )}

            {formVariant === 'edit' && (
              <form onSubmit={handleSubmitEdit} className={styles.form}>
                <p className={styles.editHint}>업체 종류는 변경할 수 없습니다. 창고를 변경하면 기존 원자재 재고 정보가 삭제됩니다.</p>
                <dl className={styles.dl}>
                  <dt>업체 종류</dt>
                  <dd>{formData.snapshot_type === 'bnk' ? '비엔케이' : '원자재'}</dd>
                </dl>
                <label className={styles.label}>
                  창고
                  {formData.snapshot_type === 'bnk' ? (
                    <select
                      value={String(formData.bnk_warehouse_id ?? formData.bnkWarehouseId ?? '')}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        if ((formData.lines || []).length > 0 && !window.confirm('창고를 변경하면 기존에 입력된 원자재 재고 정보가 모두 삭제됩니다. 계속하시겠습니까?')) return;
                        setFormData((f) => ({
                          ...f,
                          bnk_warehouse_id: newVal ? Number(newVal) : null,
                          bnkWarehouseId: newVal,
                          lines: (f.lines || []).length > 0 ? [{ raw_material_id: '', quantity: '' }] : (f.lines || []),
                        }));
                      }}
                      className={styles.input}
                    >
                      <option value="">선택</option>
                      {bnkWarehouses.map((w) => (
                        <option key={w.id} value={String(w.id)}>{w.name}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={String(formData.supplier_warehouse_id ?? formData.supplierWarehouseId ?? '')}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        if ((formData.lines || []).length > 0 && !window.confirm('창고를 변경하면 기존에 입력된 원자재 재고 정보가 모두 삭제됩니다. 계속하시겠습니까?')) return;
                        setFormData((f) => ({
                          ...f,
                          supplier_warehouse_id: newVal ? Number(newVal) : null,
                          supplierWarehouseId: newVal,
                          lines: (f.lines || []).length > 0 ? [{ raw_material_id: '', quantity: '' }] : (f.lines || []),
                        }));
                      }}
                      className={styles.input}
                    >
                      <option value="">선택</option>
                      {supplierWarehouses.map((w) => (
                        <option key={w.id} value={String(w.id)}>{w.supplier_name || ''} / {w.name}</option>
                      ))}
                    </select>
                  )}
                </label>
                <label className={styles.label}>
                  재고 기준일
                  <input
                    type="date"
                    value={formatDate(formData.stock_date || formData.stockDate) || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, stock_date: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <div className={styles.label}>
                  원자재별 재고 수량
                  {(formData.lines || []).map((line, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                      <select
                        value={String(line.raw_material_id ?? '')}
                        onChange={(e) => updateLine(idx, 'raw_material_id', e.target.value)}
                        className={styles.input}
                        style={{ flex: 1 }}
                      >
                        {materials.map((m) => (
                          <option key={m.id} value={String(m.id)}>
                            {m.kind ? `${m.kind} / ${m.name}` : m.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.quantity ?? ''}
                        onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        className={styles.input}
                        style={{ width: 100 }}
                      />
                      <button type="button" className={styles.btnSmall} onClick={() => removeLine(idx)}>
                        삭제
                      </button>
                    </div>
                  ))}
                  <button type="button" className={styles.btnSecondary} style={{ marginTop: '0.5rem' }} onClick={addLine}>
                    원자재 추가
                  </button>
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={formSaving}>
                    {formSaving ? '수정 중...' : '저장'}
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
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 400 }}>
            <h2 className={styles.modalTitle}>재고 삭제</h2>
            <p>이 재고 스냅샷(총 {deleteConfirm.lineCount}건 라인)을 삭제하시겠습니까? 삭제 시 복구할 수 없습니다.</p>
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSmallDanger} onClick={handleDelete}>
                삭제
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setDeleteConfirm(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MaterialStock;
