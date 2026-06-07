import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// ── Shared pill utilities ─────────────────────────────────────────────────────
export function pillKey(category) {
  const c = (category || 'other').toLowerCase().replace(/\s+/g, '');
  const map = {
    food: 'food', groceries: 'groceries', transport: 'transport',
    shopping: 'shopping', subscriptions: 'subscriptions', bills: 'bills',
    health: 'health', travel: 'travel', entertainment: 'entertainment',
    income: 'income', zelle: 'zelle',
    creditcardpayment: 'bills', savings: 'bills', checking: 'bills',
    investment: 'investment', houserent: 'bills', rent: 'bills',
  };
  return map[c] || 'other';
}

export function pillStyle(category) {
  const k = pillKey(category);
  return {
    backgroundColor: `var(--pill-${k}-bg)`,
    color: `var(--pill-${k}-text)`,
    borderColor: `var(--pill-${k}-border)`,
  };
}

// ── Category icon SVGs ────────────────────────────────────────────────────────
export function CategoryIcon({ category, className = 'w-3.5 h-3.5' }) {
  const c = (category || 'other').toLowerCase();
  const props = { className, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

  switch (c) {
    case 'food':
    case 'groceries':
      return <svg {...props}><path d="M10 14l1 2m3-2l-1 2M4 10h16l-1.5 9a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 10zm2 0L12 3l6 7"/></svg>;
    case 'transport':
      return <svg {...props}><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9"/></svg>;
    case 'shopping':
      return <svg {...props}><path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0"/><path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592-5.592a2.41 2.41 0 0 0 0-3.408l-7.71-7.71A2 2 0 0 0 11.172 3H6a3 3 0 0 0-3 3z"/></svg>;
    case 'subscriptions':
      return <svg {...props}><path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>;
    case 'bills':
      return <svg {...props}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="9" y1="9" x2="10" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>;
    case 'health':
      return <svg {...props}><path d="M19.5 12.572l-7.5 7.428l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572"/></svg>;
    case 'travel':
      return <svg {...props}><path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7H9l2-7H7l-2 2H2l2-4l-2-4h3l2 2h4L9 3h3l4 7z"/></svg>;
    case 'entertainment':
      return <svg {...props}><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8m-4-3v3"/></svg>;
    case 'income':
      return <svg {...props}><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M2 9h2m16 0h2M2 15h2m16 0h2"/></svg>;
    case 'zelle':
      return <svg {...props}><path d="M10 14L21 3m0 0l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3"/></svg>;
    case 'investment':
      return <svg {...props}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
    case 'savings':
      return <svg {...props}><path d="M19 9c0-3.87-3.13-7-7-7S5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17h8v-2.26C17.81 13.47 19 11.38 19 9z"/><path d="M9 17h6v2H9z"/><circle cx="15" cy="8.5" r=".75" fill="currentColor" stroke="none"/><path d="M19 9h2.5"/></svg>;
    case 'checking':
      return <svg {...props}><path d="M2 20h20M4 20V10M8 20V10M12 20V10M16 20V10M20 20V10M2 7l10-5 10 5"/></svg>;
    case 'house rent':
    case 'rent':
      return <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="9"/><circle cx="8" cy="12" r="0.75" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="0.75" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="0.75" fill="currentColor" stroke="none"/></svg>;
  }
}

// ── CategoryListPopover ───────────────────────────────────────────────────────
// Portal-rendered floating list. Matches the CategoryWheel's visual language
// but as a vertical list instead of a radial wheel.
//
// Props:
//   options     [{ value, label }]
//   value       currently selected value
//   onChange    (value) => void
//   onClose     () => void
//   anchor      DOMRect from getBoundingClientRect()
//   withIcons   show CategoryIcon per item (default false)
//   clearLabel  label for an optional "All" item at the top (e.g. "All categories")
//   clearValue  value for the "All" item (default "")

export function CategoryListPopover({
  options,
  value,
  onChange,
  onClose,
  anchor,
  withIcons = false,
  clearLabel = null,
  clearValue = '',
}) {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef(null);

  const PANEL_W = 220;
  const ITEM_H = 36;
  const PADDING = 6;
  const GAP = 5;

  // Position: default below, flip above if not enough room
  const itemCount = options.length + (clearLabel ? 1 : 0);
  const estH = Math.min(itemCount * ITEM_H + PADDING * 2, 340);
  const spaceBelow = window.innerHeight - anchor.bottom - GAP;
  const flipUp = spaceBelow < estH && anchor.top > estH;

  let left = anchor.left;
  let top = flipUp ? anchor.top - GAP - estH : anchor.bottom + GAP;
  if (left + PANEL_W > window.innerWidth - 8) left = window.innerWidth - PANEL_W - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  // Fade in after one frame
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  // Close on outside click, Escape, or scroll of any container OTHER than the panel itself
  useEffect(() => {
    function handleDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    function handleScroll(e) {
      // Ignore scrolls that originate inside the popover panel
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const regularItems = [
    ...(clearLabel != null ? [{ value: clearValue, label: clearLabel, isAll: true }] : []),
    ...options.filter((o) => o.value !== '__new__').map((o) => ({ ...o, isAll: false })),
  ];
  const hasNewItem = options.some((o) => o.value === '__new__');

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left,
        top,
        width: PANEL_W,
        maxHeight: 340,
        overflowY: 'auto',
        zIndex: 9999,
        background: 'var(--color-surface-primary)',
        border: '1px solid var(--color-border-row)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        padding: `${PADDING}px`,
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateY(0) scale(1)'
          : `translateY(${flipUp ? '5px' : '-5px'}) scale(0.96)`,
        transformOrigin: flipUp ? 'bottom left' : 'top left',
        transition: 'opacity 150ms ease, transform 150ms cubic-bezier(0.2, 1.5, 0.4, 1)',
      }}
    >
      {regularItems.map((item, i) => {
        const isCurrent = item.value === value || (item.isAll && !value && value !== undefined);
        const ps = withIcons && !item.isAll ? pillStyle(item.label) : null;
        const delay = `${Math.min(i * 20, 160)}ms`;

        return (
          <CategoryListItem
            key={item.isAll ? '__all__' : item.value}
            item={item}
            isCurrent={isCurrent}
            ps={ps}
            withIcons={withIcons}
            delay={delay}
            visible={visible}
            onClick={() => { onChange(item.value); onClose(); }}
          />
        );
      })}

      {/* "+ New category" footer item */}
      {hasNewItem && (
        <>
          <div style={{ height: 1, background: 'var(--color-border-row)', margin: '4px 6px' }} />
          <NewCategoryItem
            visible={visible}
            delay={`${Math.min(regularItems.length * 20, 160)}ms`}
            onClick={() => { onChange('__new__'); onClose(); }}
          />
        </>
      )}
    </div>,
    document.body,
  );
}

// Separate component so hover state doesn't re-render siblings
function CategoryListItem({ item, isCurrent, ps, withIcons, delay, visible, onClick }) {
  const [hovered, setHovered] = useState(false);

  const bg = isCurrent && ps
    ? ps.backgroundColor
    : (isCurrent || hovered)
      ? 'var(--color-surface-hover)'
      : 'transparent';

  const textColor = (isCurrent || hovered) && ps ? ps.color : 'var(--color-text-primary)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        gap: 9,
        padding: '6px 8px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        background: bg,
        color: textColor,
        opacity: visible ? 1 : 0,
        transition: `background 120ms ease, color 120ms ease, opacity 140ms ease ${delay}`,
      }}
    >
      {/* Icon bubble */}
      {withIcons && (
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'box-shadow 120ms ease',
            boxShadow: (isCurrent || hovered) && ps
              ? `0 0 0 2px ${ps.borderColor}`
              : 'none',
            ...(item.isAll
              ? {
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border-row)',
                  color: 'var(--color-text-tertiary)',
                }
              : {
                  background: ps.backgroundColor,
                  border: `1px solid ${ps.borderColor}`,
                  color: ps.color,
                }),
          }}
        >
          {item.isAll ? (
            <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          ) : (
            <CategoryIcon category={item.label} className="w-3.5 h-3.5" />
          )}
        </span>
      )}

      {/* Label */}
      <span
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: isCurrent ? 600 : 400,
          lineHeight: '18px',
          color: item.isAll && !isCurrent ? 'var(--color-text-secondary)' : undefined,
        }}
      >
        {item.label}
      </span>

      {/* Check */}
      {isCurrent && (
        <svg
          style={{ width: 13, height: 13, flexShrink: 0, opacity: 0.65 }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// "+ New category" item rendered at the bottom with a distinct style
function NewCategoryItem({ visible, delay, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        gap: 9,
        padding: '6px 8px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        background: hovered ? 'rgba(99,102,241,0.08)' : 'transparent',
        color: hovered ? '#818cf8' : 'var(--color-text-tertiary)',
        opacity: visible ? 1 : 0,
        fontSize: 12,
        fontWeight: 500,
        transition: `background 120ms ease, color 120ms ease, opacity 140ms ease ${delay}`,
      }}
    >
      <span style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hovered ? 'rgba(99,102,241,0.12)' : 'var(--color-surface-hover)',
        border: `1px dashed ${hovered ? '#818cf8' : 'var(--color-border-row)'}`,
        color: hovered ? '#818cf8' : 'var(--color-text-tertiary)',
        transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
      }}>
        <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </span>
      + New category…
    </button>
  );
}

// ── FilterDropdown ────────────────────────────────────────────────────────────
// Styled trigger button that opens a CategoryListPopover.
// Used to replace native <select> elements in filter toolbars.
//
// Props:
//   options      [{ value, label }]
//   value        currently selected value
//   onChange     (value) => void
//   placeholder  text shown when value matches clearValue (e.g. "All categories")
//   clearValue   the "no filter" value (default "")
//   withIcons    show category icons in the popover (default false)

export function FilterDropdown({
  options,
  value,
  onChange,
  placeholder,
  clearValue = '',
  withIcons = false,
}) {
  const [open, setOpen] = useState(false);
  const [minWidth, setMinWidth] = useState(undefined);
  const btnRef = useRef(null);

  // Lock the button's width on first render (placeholder state) to prevent CLS
  // when the label changes to a shorter selected value.
  useLayoutEffect(() => {
    if (btnRef.current && minWidth === undefined) {
      setMinWidth(btnRef.current.offsetWidth);
    }
  });

  const selected = options.find((o) => o.value === value);
  const isFiltered = value !== clearValue;
  const ps = withIcons && isFiltered && selected ? pillStyle(selected.label) : null;
  const displayLabel = isFiltered ? (selected?.label ?? value) : placeholder;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-2.5 pr-2 py-1.5 text-sm focus:outline-none transition-colors cursor-pointer whitespace-nowrap"
        style={{
          minWidth,
          color: 'var(--color-text-secondary)',
          // Override with pill colors when a category is actively selected
          ...(ps ? {
            backgroundColor: ps.backgroundColor,
            borderColor: ps.borderColor,
            color: ps.color,
          } : {}),
          // Non-icon active state (bank filter): just bold the text
          ...(!ps && isFiltered ? { color: 'var(--color-text-primary)', fontWeight: 500 } : {}),
        }}
      >
        {/* Category icon bubble — same as in the list item */}
        {ps && (
          <span style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: ps.backgroundColor,
            border: `1px solid ${ps.borderColor}`,
            color: ps.color,
          }}>
            <CategoryIcon category={selected.label} className="w-3 h-3" />
          </span>
        )}

        <span style={{ flex: 1, fontWeight: isFiltered ? 500 : 400 }}>{displayLabel}</span>

        <svg
          style={{
            width: 11, height: 11, flexShrink: 0, opacity: 0.5,
            transition: 'transform 150ms ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && btnRef.current && (
        <CategoryListPopover
          options={options}
          value={value}
          onChange={(v) => { onChange(v); setOpen(false); }}
          onClose={() => setOpen(false)}
          anchor={btnRef.current.getBoundingClientRect()}
          withIcons={withIcons}
          clearLabel={placeholder}
          clearValue={clearValue}
        />
      )}
    </div>
  );
}
