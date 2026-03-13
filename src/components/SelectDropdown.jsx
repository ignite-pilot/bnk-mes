/**
 * 커스텀 셀렉트 드롭다운 (기본 select 대체)
 * - options: { value, label }[]
 * - value: 선택된 값
 * - onChange: (value) => void
 * - placeholder: 미선택 시 표시 텍스트
 * - searchable: 검색 가능 여부 (기본 false, 옵션 6개 이상이면 자동 true)
 * - style: 외부 wrapper 스타일
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';

const ddStyles = {
  wrapper: {
    position: 'relative',
    width: '100%',
  },
  trigger: {
    width: '100%',
    padding: '0.4rem 0.6rem',
    border: '1px solid #cbd5e1',
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
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 50,
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
  },
  itemSelected: {
    background: '#eff6ff',
    fontWeight: 500,
    color: '#2563eb',
  },
  itemHover: {
    background: '#f8fafc',
  },
  empty: {
    padding: '0.5rem 0.6rem',
    fontSize: '0.8125rem',
    color: '#94a3b8',
  },
};

function SelectDropdown({
  options = [],
  value,
  onChange,
  placeholder = '선택',
  searchable,
  disabled = false,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hoverIdx, setHoverIdx] = useState(-1);
  const ref = useRef(null);
  const searchRef = useRef(null);

  const showSearch = searchable !== undefined ? searchable : options.length >= 6;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && showSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    const found = options.find((o) => String(o.value) === String(value));
    return found ? found.label : null;
  }, [options, value]);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setSearch('');
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
      handleSelect(filtered[hoverIdx].value);
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
      {open && (
        <div style={ddStyles.panel}>
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
            ) : (
              filtered.map((opt, i) => (
                <div
                  key={`${opt.value}-${i}`}
                  style={{
                    ...ddStyles.item,
                    ...(String(opt.value) === String(value) ? ddStyles.itemSelected : {}),
                    ...(i === hoverIdx ? ddStyles.itemHover : {}),
                  }}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHoverIdx(i)}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectDropdown;
