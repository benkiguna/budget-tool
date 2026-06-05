import { useState, useRef } from 'react';
import { getCategories } from '../lib/categorizer.js';
import { pillStyle, CategoryIcon, CategoryListPopover } from './CategoryListPopover.jsx';

export default function CategorySelect({
  merchantRaw,
  value,
  onChange,
  onIdentify,
  geminiModel,
  customCategories = [],
  // selectClassName kept for API compat but no longer used
}) {
  const allCategories = getCategories(customCategories);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const btnRef = useRef(null);

  async function handleAsk() {
    setAi({ loading: true, result: null });
    const result = await onIdentify(merchantRaw);
    setAi({ loading: false, result });
    if (result.ok && result.suggestedCategory) {
      onChange(result.suggestedCategory);
    }
  }

  function handleConfirmNew() {
    const name = newCatInput.trim();
    if (!name) return;
    onChange(name, true);
    setAddingNew(false);
    setNewCatInput('');
  }

  function handleSelect(val) {
    if (val === '__new__') {
      setAddingNew(true);
    } else {
      onChange(val);
    }
    setOpen(false);
  }

  if (addingNew) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          className="bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded px-2 py-0.5 text-xs w-28 focus:outline-none"
          style={{ color: 'var(--color-text-primary)' }}
          placeholder="Category name…"
          value={newCatInput}
          onChange={(e) => setNewCatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirmNew();
            if (e.key === 'Escape') { setAddingNew(false); setNewCatInput(''); }
          }}
          onBlur={() => { setAddingNew(false); setNewCatInput(''); }}
        />
      </div>
    );
  }

  const ps = value ? pillStyle(value) : null;
  const options = [
    ...allCategories.map((c) => ({ value: c, label: c })),
    { value: '__new__', label: '+ New category…', isSpecial: true },
  ];

  return (
    <div>
      <div className="flex items-center gap-1">
        {/* Pill trigger button */}
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 cursor-pointer transition-all hover:opacity-80"
          style={ps ? {
            backgroundColor: ps.backgroundColor,
            color: ps.color,
            border: `1px solid ${ps.borderColor}`,
            fontSize: 12,
            fontWeight: 500,
            lineHeight: '16px',
          } : {
            backgroundColor: 'var(--color-surface-hover)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-row)',
            fontSize: 12,
            fontWeight: 500,
            lineHeight: '16px',
          }}
        >
          {ps && <CategoryIcon category={value} className="w-3.5 h-3.5 shrink-0" />}
          <span>{value || 'Pick category…'}</span>
          <svg
            style={{
              width: 10,
              height: 10,
              transition: 'transform 140ms ease',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              opacity: 0.6,
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Gemini AI button */}
        {geminiModel && onIdentify && (
          <button
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 dark:text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-30 shrink-0"
            onClick={handleAsk}
            disabled={ai?.loading}
            title="Ask AI to identify this merchant"
          >
            {ai?.loading
              ? <span className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin block" />
              : <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
            }
          </button>
        )}

        {/* Popover */}
        {open && btnRef.current && (
          <CategoryListPopover
            options={options}
            value={value}
            onChange={handleSelect}
            onClose={() => setOpen(false)}
            anchor={btnRef.current.getBoundingClientRect()}
            withIcons={true}
          />
        )}
      </div>

      {ai?.result && (
        <p className={`text-xs mt-0.5 leading-tight ${ai.result.ok ? 'text-zinc-500' : 'text-red-400'}`}>
          {ai.result.ok
            ? <>{ai.result.description}{ai.result.suggestedCategory && <span className="text-indigo-400"> → {ai.result.suggestedCategory}</span>}</>
            : ai.result.message}
        </p>
      )}
    </div>
  );
}
