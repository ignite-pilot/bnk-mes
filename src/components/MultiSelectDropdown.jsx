import React, { useState, useRef, useEffect } from 'react';

const dropdownStyles = {
  wrapper: { position: 'relative', width: '100%', marginTop: '0.25rem' },
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
  arrow: { fontSize: '0.625rem', color: '#64748b', marginLeft: '0.5rem', flexShrink: 0 },
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
    maxHeight: '200px',
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.35rem 0.6rem',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    borderBottom: '1px solid #f1f5f9',
  },
  itemHover: { background: '#f8fafc' },
  empty: { padding: '0.5rem 0.6rem', fontSize: '0.8125rem', color: '#64748b' },
  label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};

function MultiSelectDropdown({ items, selectedIds, onChange, placeholder = '선택', emptyText = '항목이 없습니다.', labelFn }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = selectedIds || [];
  const selectedNames = selected
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => (labelFn ? labelFn(item) : item.name))
    .join(', ');

  const displayText = selected.length > 0
    ? `${selectedNames || selected.length + '개 선택됨'}`
    : placeholder;

  const handleToggle = (id) => {
    const newIds = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    onChange(newIds);
  };

  return (
    <div ref={ref} style={dropdownStyles.wrapper}>
      <button
        type="button"
        style={{ ...dropdownStyles.trigger, ...(open ? dropdownStyles.triggerOpen : {}) }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayText}
        </span>
        <span style={dropdownStyles.arrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={dropdownStyles.panel}>
          {items.length === 0 ? (
            <div style={dropdownStyles.empty}>{emptyText}</div>
          ) : (
            items.map((item) => (
              <label
                key={item.id}
                style={dropdownStyles.item}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => handleToggle(item.id)}
                />
                <span style={dropdownStyles.label}>{labelFn ? labelFn(item) : item.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default MultiSelectDropdown;
