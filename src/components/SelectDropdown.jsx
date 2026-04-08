/**
 * 커스텀 셀렉트 드롭다운 (기본 select 대체)
 * - options: { value, label }[]
 * - value: 단일 선택 시 string, 다중 선택 시 string[]
 * - onChange: 단일 선택 시 (value) => void, 다중 선택 시 (values[]) => void
 * - placeholder: 미선택 시 표시 텍스트
 * - searchable: 검색 가능 여부 (기본 false, 옵션 6개 이상이면 자동 true)
 * - maxSelect: 최대 선택 개수 (기본 1 = 단일 선택, 2 이상 = 체크박스 다중 선택)
 * - style: 외부 wrapper 스타일
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

const ddStyles = {
  wrapper: {
    position: 'relative',
    width: '100%',
  },
  trigger: {
    width: '100%',
    padding: '0.4rem 0.6rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#cbd5e1',
    borderRadius: '4px',
    fontSize: '0.875rem',
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    color: '#334155',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: '2rem',
    boxSizing: 'border-box',
  },
  triggerOpen: {
    borderColor: '#3b82f6',
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)',
  },
  triggerPlaceholder: {
    color: '#94a3b8',
  },
  arrow: {
    fontSize: '0.625rem',
    color: '#64748b',
    marginLeft: '0.5rem',
    flexShrink: 0,
  },
  panel: {
    position: 'fixed',
    zIndex: 10050,
    boxSizing: 'border-box',
    background: '#fff',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    marginTop: '2px',
    maxHeight: '220px',
    display: 'flex',
    flexDirection: 'column',
  },
  search: {
    width: '100%',
    padding: '0.4rem 0.6rem',
    border: 'none',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '0.8125rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
  },
  item: {
    padding: '0.4rem 0.6rem',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    whiteSpace: 'nowrap',
  },
  itemSelected: {
    background: '#eff6ff',
    fontWeight: 500,
    color: '#2563eb',
  },
  itemHover: {
    background: '#f8fafc',
  },
  itemDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  empty: {
    padding: '0.5rem 0.6rem',
    fontSize: '0.8125rem',
    color: '#94a3b8',
  },
  checkbox: {
    width: '14px',
    height: '14px',
    accentColor: '#3b82f6',
    cursor: 'pointer',
    flexShrink: 0,
  },
  multiInfo: {
    padding: '0.3rem 0.6rem',
    fontSize: '0.75rem',
    color: '#64748b',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
};

function SelectDropdown({
  options = [],
  value,
  onChange,
  placeholder = '선택',
  searchable,
  disabled = false,
  maxSelect = 1,
  style,
  triggerStyle,
  dropdownMinWidth,
}) {
  const isMulti = maxSelect > 1;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hoverIdx, setHoverIdx] = useState(-1);
  const ref = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const [panelBox, setPanelBox] = useState(null);

  const showSearch = searchable !== undefined ? searchable : options.length >= 6;

  const updatePanelPosition = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const minW = dropdownMinWidth ? Math.max(r.width, dropdownMinWidth) : r.width;
    setPanelBox({ top: r.bottom + 2, left: r.left, minWidth: minW });
  }, []);

  // 다중 선택 시 value를 배열로 정규화
  const selectedValues = useMemo(() => {
    if (!isMulti) return [];
    if (Array.isArray(value)) return value;
    if (value != null && value !== '') return [value];
    return [];
  }, [isMulti, value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) {
      setPanelBox(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('resize', updatePanelPosition);
    return () => {
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (open && panelBox && showSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, panelBox, showSearch]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, search]);

  // 단일 선택용 라벨
  const selectedLabel = useMemo(() => {
    if (isMulti) {
      if (selectedValues.length === 0) return null;
      const labels = selectedValues.map((v) => {
        const found = options.find((o) => String(o.value) === String(v));
        return found ? found.label : v;
      });
      return labels.length <= 2 ? labels.join(', ') : `${labels[0]} 외 ${labels.length - 1}건`;
    }
    const found = options.find((o) => String(o.value) === String(value));
    return found ? found.label : null;
  }, [isMulti, options, value, selectedValues]);

  // 단일 선택
  const handleSelect = (val, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  // 다중 선택 토글
  const handleToggle = (val) => {
    const isChecked = selectedValues.includes(val);
    if (isChecked) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      if (selectedValues.length >= maxSelect) return;
      onChange([...selectedValues, val]);
    }
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHoverIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHoverIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && hoverIdx >= 0 && hoverIdx < filtered.length) {
      e.preventDefault();
      if (isMulti) {
        handleToggle(filtered[hoverIdx].value);
      } else {
        handleSelect(filtered[hoverIdx].value);
      }
    }
  };

  return (
    <div ref={ref} style={{ ...ddStyles.wrapper, ...style }} onKeyDown={handleKeyDown}>
      <button
        type="button"
        style={{
          ...ddStyles.trigger,
          ...(open ? ddStyles.triggerOpen : {}),
          ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
          ...(!selectedLabel ? ddStyles.triggerPlaceholder : {}),
          ...(triggerStyle || {}),
        }}
        onClick={() => {
          if (!disabled) {
            setOpen((o) => !o);
            setHoverIdx(-1);
          }
        }}
        disabled={disabled}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selectedLabel || placeholder}
        </span>
        <span style={ddStyles.arrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open &&
        panelBox &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              ...ddStyles.panel,
              top: panelBox.top,
              left: panelBox.left,
              minWidth: panelBox.minWidth,
              width: 'auto',
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            {isMulti && (
              <div style={ddStyles.multiInfo}>
                {selectedValues.length}/{maxSelect}개 선택
              </div>
            )}
            {showSearch && (
              <input
                ref={searchRef}
                type="text"
                style={ddStyles.search}
                placeholder="검색..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHoverIdx(-1);
                }}
              />
            )}
            <div style={ddStyles.list}>
              {filtered.length === 0 ? (
                <div style={ddStyles.empty}>
                  {options.length === 0 ? '항목이 없습니다.' : '검색 결과가 없습니다.'}
                </div>
              ) : isMulti ? (
                filtered.map((opt, i) => {
                  const isChecked = selectedValues.includes(opt.value);
                  const isMaxed = !isChecked && selectedValues.length >= maxSelect;
                  return (
                    <div
                      key={`${opt.value}-${i}`}
                      style={{
                        ...ddStyles.item,
                        ...(isChecked ? ddStyles.itemSelected : {}),
                        ...(i === hoverIdx && !isMaxed ? ddStyles.itemHover : {}),
                        ...(isMaxed ? ddStyles.itemDisabled : {}),
                      }}
                      onClick={() => {
                        if (!isMaxed || isChecked) handleToggle(opt.value);
                      }}
                      onMouseEnter={() => setHoverIdx(i)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isMaxed && !isChecked}
                        readOnly
                        style={ddStyles.checkbox}
                      />
                      {opt.label}
                    </div>
                  );
                })
              ) : (
                filtered.map((opt, i) => (
                  <div
                    key={`${opt.value}-${i}`}
                    style={{
                      ...ddStyles.item,
                      ...(String(opt.value) === String(value) ? ddStyles.itemSelected : {}),
                      ...(i === hoverIdx ? ddStyles.itemHover : {}),
                    }}
                    onClick={(e) => handleSelect(opt.value, e)}
                    onMouseEnter={() => setHoverIdx(i)}
                  >
                    {opt.label}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default SelectDropdown;
