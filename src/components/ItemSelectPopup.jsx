/**
 * 범용 복수 선택 레이어 팝업 (검색/필터 가능, 확인 시 선택 반영)
 * - items: { id, ... }[] (항목 목록)
 * - selectedIds: number[] (선택된 id 목록)
 * - onConfirm: (ids: number[]) => void
 * - labelFn: (item) => string (항목 표시 텍스트)
 * - searchFn: (item, query) => boolean (검색 필터, 기본: labelFn 기반)
 */
import React, { useState, useEffect, useMemo } from 'react';
import styles from '../pages/material/MaterialInfo.module.css';

const popupStyle = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: 16,
  },
  box: {
    background: '#fff',
    borderRadius: 8,
    padding: '1.25rem',
    maxWidth: 420,
    width: '100%',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
  },
  title: {
    margin: '0 0 0.75rem',
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#1e293b',
  },
  search: {
    width: '100%',
    padding: '0.5rem 0.6rem',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: '0.875rem',
    marginBottom: '0.75rem',
  },
  listWrap: {
    flex: 1,
    minHeight: 200,
    maxHeight: 360,
    overflowY: 'auto',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    padding: '0.5rem',
    marginBottom: '1rem',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.35rem 0',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  summary: {
    fontSize: '0.8125rem',
    color: '#64748b',
    marginBottom: '0.5rem',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end',
  },
};

function ItemSelectPopup({
  open,
  onClose,
  items = [],
  selectedIds = [],
  onConfirm,
  title = '항목 선택',
  searchPlaceholder = '이름으로 검색',
  emptyText = '항목이 없습니다.',
  labelFn = (item) => item.name || `#${item.id}`,
  searchFn,
}) {
  const ids = Array.isArray(selectedIds) ? selectedIds.map((x) => Number(x)).filter((x) => !Number.isNaN(x)) : [];
  const [tempSelected, setTempSelected] = useState(ids);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (open) {
      setTempSelected(ids);
      setSearchText('');
    }
  }, [open, ids.join(',')]);

  const defaultSearchFn = (item, q) => labelFn(item).toLowerCase().includes(q);

  const filtered = useMemo(() => {
    if (!searchText.trim()) return items;
    const q = searchText.trim().toLowerCase();
    const fn = searchFn || defaultSearchFn;
    return items.filter((item) => fn(item, q));
  }, [items, searchText]);

  const toggle = (id) => {
    setTempSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setTempSelected(items.map((m) => m.id));
  };

  const clearAll = () => {
    setTempSelected([]);
  };

  const handleConfirm = () => {
    onConfirm(tempSelected);
    onClose();
  };

  if (!open) return null;

  return (
    <div style={popupStyle.overlay} onClick={onClose} role="presentation">
      <div style={popupStyle.box} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="item-select-popup-title">
        <h2 id="item-select-popup-title" style={popupStyle.title}>
          {title}
        </h2>
        <input
          type="text"
          style={popupStyle.search}
          placeholder={searchPlaceholder}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          aria-label="검색"
        />
        <div style={{ ...popupStyle.summary, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span>선택됨: {tempSelected.length}개</span>
          <span style={{ display: 'flex', gap: '0.35rem' }}>
            <button type="button" className={styles.btnSecondary} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }} onClick={selectAll}>
              전체 선택
            </button>
            <button type="button" className={styles.btnSecondary} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }} onClick={clearAll}>
              전체 해제
            </button>
          </span>
        </div>
        <div style={popupStyle.listWrap}>
          {filtered.length === 0 ? (
            <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
              {items.length === 0 ? emptyText : '검색 결과가 없습니다.'}
            </div>
          ) : (
            filtered.map((item) => (
              <label key={item.id} style={popupStyle.item}>
                <input
                  type="checkbox"
                  checked={tempSelected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span>{labelFn(item)}</span>
              </label>
            ))
          )}
        </div>
        <div style={popupStyle.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            취소
          </button>
          <button type="button" className={styles.btnPrimary} onClick={handleConfirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

export default ItemSelectPopup;
