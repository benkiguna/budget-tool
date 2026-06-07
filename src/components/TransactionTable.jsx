import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getCategories } from '../lib/categorizer.js';
import { formatCurrency, fmtDate } from '../lib/utils.js';
import MerchantLogo from './MerchantLogo.jsx';
import { pillKey, pillStyle, CategoryIcon as _CategoryIcon, FilterDropdown } from './CategoryListPopover.jsx';

const BANK_LABELS = {
  chase: 'Chase', capitalOne: 'Capital One', discover: 'Discover',
  chaseChecking: 'Chase', chaseSavings: 'Chase',
  capitalOneChecking: 'Capital One', capitalOneSavings: 'Capital One',
};

function bankLabel(sourceBank) {
  if (BANK_LABELS[sourceBank]) return BANK_LABELS[sourceBank];
  // Fallback: split camelCase → title case ("chaseChecking" → "Chase Checking")
  return sourceBank
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

const PAGE_SIZE = 50;

// ── Local CategoryIcon alias (16px for wheel nodes) ──────────────────────────
function CategoryIcon({ category }) {
  return <_CategoryIcon category={category} className="w-4 h-4 shrink-0" />;
}

// ── Clean subtitle text ──────────────────────────────────────────────────────
// Transforms raw bank transaction descriptions into short, human-readable subtitles.
function cleanSubtitle(merchantRaw, merchant) {
  if (!merchantRaw || merchantRaw === merchant) return null;
  let s = merchantRaw.trim();

  // 1. Payment processor prefix patterns: "DD *DOORDASH CHICK-FIL" → "via DoorDash"
  const processorPrefixes = [
    { pattern: /^DD\s*\*\s*DOORDASH\b/i, label: 'via DoorDash' },
    { pattern: /^TST\s*\*/i, label: null },        // Toast POS — strip, keep rest
    { pattern: /^SQ\s*\*/i, label: null },          // Square — strip, keep rest
    { pattern: /^SP\s*\*/i, label: null },          // Shopify — strip, keep rest
    { pattern: /^PP\s*\*/i, label: null },          // PayPal — strip, keep rest
    { pattern: /^CKE\s*\*/i, label: null },         // Cake — strip, keep rest
    { pattern: /^IN\s*\*/i, label: null },          // Invoice — strip, keep rest
    { pattern: /^RAZ\s*\*/i, label: null },         // Razorpay — strip, keep rest
  ];

  for (const { pattern, label } of processorPrefixes) {
    if (pattern.test(s)) {
      if (label) return label;
      s = s.replace(pattern, '').trim();
      break;
    }
  }

  // 2. E-PAYMENT / ACH descriptors — strip early so they don't pollute later steps
  //    "DISCOVER E-PAYMENT 7855 WEB ID:" → ""
  s = s.replace(/\bE-PAYMENT\b.*$/i, '');
  s = s.replace(/\b(PPD|WEB|CCD|TEL|CTX|ARC)\s+ID:?\s*\S*/gi, '');

  // 3. "CAPITAL ONE MOBILE PYMT" / "CAPITAL ONE AUTOPAY" → "Mobile payment" / "Autopay"
  const mobilePayment = s.match(/\bMOBILE\s+(PYMT|PAYMENT)\b/i);
  if (mobilePayment) return 'Mobile payment';
  const autopay = s.match(/\bAUTOPAY\b/i);
  if (autopay) return 'Autopay';

  // 4. Strip store numbers with # prefix: "SAFEWAY #0464" → "#0464"
  const storeHashMatch = s.match(/(#\w+)/);
  if (storeHashMatch && s.replace(storeHashMatch[0], '').replace(/[A-Z\s]/gi, '').length < 4) {
    return storeHashMatch[0];
  }

  // 5. Strip store/location codes without #: "MCDONALD'S M6720 OF WA" → strip M6720, OF, WA
  s = s.replace(/\b[A-Z]?\d{3,}\b/g, '');           // M6720, 0464, etc.
  s = s.replace(/\s+\bOF\b\s*/gi, ' ');              // "OF"
  s = s.replace(/\s+[A-Z]{2}\s*$/g, '');             // trailing state abbrev "WA", "CA"

  // 6. Remove long hex/numeric IDs
  s = s.replace(/\b[A-F0-9]{8,}\b/gi, '');
  s = s.replace(/\b\d{6,}\b/g, '');

  // 7. Apple Pay suffix
  s = s.replace(/APPLE\s*PAY\s+ENDING\s+IN\s*.*/gi, '');

  // 8. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  // 9. If cleaned result matches merchant display name (case-insensitive), skip
  if (!s || s.toLowerCase() === merchant.toLowerCase()) return null;

  // 10. Sentence-case: first letter uppercase, rest lowercase (unless it looks like an acronym/domain)
  if (/^[A-Z\s*#.\-]+$/.test(s) && s.length > 3) {
    s = s.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    // Re-capitalize domain extensions like ".com"
    s = s.replace(/\.[a-z]{2,4}\b/g, (m) => m.toLowerCase());
  }

  return s || null;
}

// ── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(transactions) {
  const headers = ['Date', 'Merchant', 'Amount', 'Category', 'Bank', 'Source', 'Notes'];
  const rows = transactions.map((tx) => [
    tx.date,
    `"${tx.merchant.replace(/"/g, '""')}"`,
    tx.amount.toFixed(2),
    tx.category,
    tx.sourceBank,
    tx.categorySource,
    `"${(tx.notes || '').replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ col, sortCol, sortDir }) {
  const active = sortCol === col;
  const asc = active && sortDir === 'asc';
  const desc = active && sortDir === 'desc';
  return (
    <span className="inline-flex flex-col gap-px ml-1 align-middle">
      <svg width="7" height="5" viewBox="0 0 7 5" fill="none" className={asc ? 'opacity-100' : 'opacity-25'}>
        <path d="M3.5 0L7 5H0L3.5 0Z" fill={asc ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'} />
      </svg>
      <svg width="7" height="5" viewBox="0 0 7 5" fill="none" className={desc ? 'opacity-100' : 'opacity-25'}>
        <path d="M3.5 5L0 0H7L3.5 5Z" fill={desc ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'} />
      </svg>
    </span>
  );
}

// ── Radial Category Wheel ────────────────────────────────────────────────────
// Star-chart radial selector. Two states only: rest (entering/closing) ↔ open.
// Close is a true mirror of open — same layers, same stagger, reversed.

const WHEEL_RADIUS = 140;
const LABEL_RADIUS = 190;
const NODE_SIZE = 40;
const DURATION = 220;
const STAGGER = 14;
const LABEL_DELAY = 100;

// Open: extra-bouncy bubble pop
const SPRING_OPEN = 'cubic-bezier(0.2, 1.7, 0.4, 1)';
// Close: hard snap — kick out then vacuum in
const SPRING_CLOSE = 'cubic-bezier(0.6, 0, 0.35, -0.7)';

function CategoryWheel({ categories, current, anchor, onSelect, onClose }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [closing, setClosing] = useState(false);
  const wheelRef = useRef(null);

  const pad = LABEL_RADIUS + 80;
  const cx = Math.max(pad, Math.min(window.innerWidth - pad, anchor.left + anchor.width / 2));
  const cy = Math.max(pad, Math.min(window.innerHeight - pad, anchor.top + anchor.height / 2));

  const count = categories.length;
  const angleStep = 360 / count;
  // Total animation envelope: last node's delay + duration
  const totalEnvelope = (count - 1) * STAGGER + DURATION + LABEL_DELAY;

  const closeWheel = useCallback((selectedCat) => {
    if (closing) return;
    setClosing(true);
    setIsOpen(false); // single state flip — everything reverses
    setTimeout(() => {
      if (selectedCat) onSelect(selectedCat);
      onClose();
    }, totalEnvelope);
  }, [onSelect, onClose, totalEnvelope, closing]);

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') closeWheel(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [closeWheel]);

  // Single trigger: entering → open
  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 30);
    return () => clearTimeout(t);
  }, []);

  return createPortal(
    <div
      ref={wheelRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      {/* ── Backdrop ── */}
      <div
        onClick={() => closeWheel()}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          opacity: isOpen ? 1 : 0,
          transition: `opacity ${DURATION}ms ease`,
          cursor: 'default',
        }}
      />

      {/* ── SVG: orbit ring + spokes ── */}
      <svg style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
        opacity: isOpen ? 1 : 0,
        transform: `scale(${isOpen ? 1 : 0})`,
        transformOrigin: `${cx}px ${cy}px`,
        transition: isOpen
          ? `opacity ${DURATION}ms ease ${LABEL_DELAY * 0.5}ms, transform ${DURATION}ms ${SPRING_OPEN} ${LABEL_DELAY * 0.3}ms`
          : `opacity ${DURATION}ms ease, transform ${DURATION}ms ${SPRING_CLOSE}`,
      }}>
        <circle cx={cx} cy={cy} r={WHEEL_RADIUS}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={WHEEL_RADIUS - 20}
          fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5"
          strokeDasharray="4 8" />
        {categories.map((cat, i) => {
          const rad = (-90 + i * angleStep) * Math.PI / 180;
          const x2 = cx + (WHEEL_RADIUS - NODE_SIZE / 2 - 2) * Math.cos(rad);
          const y2 = cy + (WHEEL_RADIUS - NODE_SIZE / 2 - 2) * Math.sin(rad);
          return (
            <line key={cat} x1={cx} y1={cy} x2={x2} y2={y2}
              stroke={hovered === cat || cat === current
                ? `var(--pill-${pillKey(cat)}-border)` : 'rgba(255,255,255,0.06)'}
              strokeWidth={hovered === cat ? 1.5 : cat === current ? 1 : 0.5}
              style={{ transition: 'stroke 150ms ease, stroke-width 150ms ease' }}
            />
          );
        })}
      </svg>

      {/* ── Center hub ── */}
      <div style={{
        position: 'fixed', left: cx, top: cy,
        transform: 'translate(-50%, -50%)',
        width: 56, height: 56, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: isOpen ? 1 : 0,
        transition: `opacity ${DURATION}ms ease`,
        pointerEvents: 'none',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.15)',
        }} />
      </div>

      {/* ── Nodes + labels ── */}
      {categories.map((cat, i) => {
        const angleDeg = -90 + i * angleStep;
        const angleRad = (angleDeg * Math.PI) / 180;
        const nx = cx + WHEEL_RADIUS * Math.cos(angleRad);
        const ny = cy + WHEEL_RADIUS * Math.sin(angleRad);
        const lx = cx + LABEL_RADIUS * Math.cos(angleRad);
        const ly = cy + LABEL_RADIUS * Math.sin(angleRad);
        const isCurrent = cat === current;
        const isHov = hovered === cat;
        const ps = pillStyle(cat);

        // Open: forward stagger (0,1,2…). Close: reverse stagger (last→first).
        const openDelay = i * STAGGER;
        const closeNodeDelay = (count - 1 - i) * STAGGER + LABEL_DELAY; // nodes wait for labels
        const closeLabelDelay = (count - 1 - i) * STAGGER; // labels go first

        // Label alignment
        const cosA = Math.cos(angleRad);
        const onLeft = cosA < -0.15;
        const onRight = cosA > 0.15;
        const textAlign = onLeft ? 'right' : onRight ? 'left' : 'center';
        const labelTx = onLeft ? '-100%' : onRight ? '0%' : '-50%';

        const nodeScale = isOpen ? (isHov ? 1.22 : isCurrent ? 1.08 : 1) : 0.15;

        return (
          <div key={cat}>
            {/* Node */}
            <button
              onMouseEnter={() => setHovered(cat)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => closeWheel(cat)}
              style={{
                position: 'fixed',
                left: isOpen ? nx : cx,
                top: isOpen ? ny : cy,
                width: NODE_SIZE, height: NODE_SIZE,
                transform: `translate(-50%, -50%) scale(${nodeScale})`,
                opacity: isOpen ? 1 : 0,
                transition: isOpen
                  ? [
                      `left ${DURATION}ms ${SPRING_OPEN} ${openDelay}ms`,
                      `top ${DURATION}ms ${SPRING_OPEN} ${openDelay}ms`,
                      `transform 180ms ${SPRING_OPEN}`,
                      `opacity ${DURATION * 0.5}ms ease ${openDelay}ms`,
                      `box-shadow 180ms ease`,
                    ].join(', ')
                  : [
                      `left ${DURATION}ms ${SPRING_CLOSE} ${closeNodeDelay}ms`,
                      `top ${DURATION}ms ${SPRING_CLOSE} ${closeNodeDelay}ms`,
                      `transform ${DURATION}ms ${SPRING_CLOSE} ${closeNodeDelay}ms`,
                      `opacity ${DURATION * 0.5}ms ease ${closeNodeDelay + DURATION * 0.4}ms`,
                      `box-shadow 180ms ease`,
                    ].join(', '),
                borderRadius: '50%',
                backgroundColor: ps.backgroundColor,
                color: ps.color,
                border: `2px solid ${isCurrent || isHov ? ps.color : ps.borderColor}`,
                boxShadow: isHov
                  ? `0 0 0 4px ${ps.borderColor}, 0 0 24px rgba(0,0,0,0.5)`
                  : isCurrent
                    ? `0 0 0 3px ${ps.borderColor}, 0 0 12px ${ps.borderColor}`
                    : '0 2px 10px rgba(0,0,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: closing ? 'default' : 'pointer',
                zIndex: isHov ? 10 : 2,
                padding: 0,
                pointerEvents: closing ? 'none' : 'auto',
              }}
            >
              <CategoryIcon category={cat} />
            </button>

            {/* Label */}
            <div
              onMouseEnter={() => setHovered(cat)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => closeWheel(cat)}
              style={{
                position: 'fixed',
                left: lx, top: ly,
                transform: `translate(${labelTx}, -50%) scale(${isOpen ? 1 : 0.5})`,
                opacity: isOpen ? (isHov ? 1 : 0.7) : 0,
                transition: isOpen
                  ? [
                      `opacity ${DURATION * 0.5}ms ease ${openDelay + LABEL_DELAY}ms`,
                      `transform ${DURATION}ms ${SPRING_OPEN} ${openDelay + LABEL_DELAY}ms`,
                    ].join(', ')
                  : [
                      `opacity ${DURATION * 0.4}ms ease ${closeLabelDelay}ms`,
                      `transform ${DURATION * 0.6}ms ${SPRING_CLOSE} ${closeLabelDelay}ms`,
                    ].join(', '),
                fontSize: isHov ? 12 : 10,
                fontWeight: isHov || isCurrent ? 600 : 500,
                color: isHov ? ps.color : isCurrent ? ps.color : 'rgba(255,255,255,0.55)',
                textAlign,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                pointerEvents: isOpen ? 'auto' : 'none',
                userSelect: 'none',
                letterSpacing: '0.01em',
                textShadow: isHov ? `0 0 12px ${ps.borderColor}` : 'none',
                zIndex: isHov ? 10 : 1,
              }}
            >
              {cat}
              {isCurrent && <span style={{ marginLeft: 4, fontSize: 8, opacity: 0.5 }}>●</span>}
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

// ── Category Pill (click to open wheel) ──────────────────────────────────────
function CategoryPill({ category, merchantRaw, onChange, customCategories = [], onAddCategory }) {
  const [wheelOpen, setWheelOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const pillRef = useRef(null);
  const allCategories = getCategories(customCategories);

  const openWheel = useCallback(() => {
    setWheelOpen(true);
  }, []);

  function handleWheelSelect(cat) {
    if (cat === '__new__') {
      setAddingNew(true);
    } else {
      onChange(cat);
    }
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
            if (e.key === 'Enter') {
              const name = newCatInput.trim();
              if (name) { onAddCategory?.(name); onChange(name); }
              setAddingNew(false); setNewCatInput('');
            }
            if (e.key === 'Escape') { setAddingNew(false); setNewCatInput(''); }
          }}
          onBlur={() => { setAddingNew(false); setNewCatInput(''); }}
        />
      </div>
    );
  }

  const displayLabel = category || 'Other';
  const ps = pillStyle(displayLabel);

  return (
    <>
      <button
        ref={pillRef}
        onClick={openWheel}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 cursor-pointer transition-all hover:opacity-80 max-w-full"
        style={{
          backgroundColor: ps.backgroundColor,
          color: ps.color,
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: ps.borderColor,
          fontSize: '12px',
          fontWeight: 500,
          lineHeight: '16px',
          overflow: 'hidden',
        }}
        title={`Click to change category (${displayLabel})`}
      >
        <CategoryIcon category={displayLabel} />
        <span className="truncate">{displayLabel}</span>
      </button>
      {wheelOpen && pillRef.current && (
        <CategoryWheel
          categories={allCategories}
          current={displayLabel}
          anchor={pillRef.current.getBoundingClientRect()}
          onSelect={handleWheelSelect}
          onClose={() => setWheelOpen(false)}
        />
      )}
    </>
  );
}

// ── Category source label ────────────────────────────────────────────────────
const SOURCE_STYLES = {
  user:          'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  bank:          'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
  keyword:       'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
  ai:            'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  trove:         'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
  uncategorized: 'bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400',
};

function SourceBadge({ source }) {
  const cls = SOURCE_STYLES[source] || SOURCE_STYLES.uncategorized;
  const label = source === 'uncategorized' ? 'none' : source;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${cls}`}>
      {label}
    </span>
  );
}

// ── Row action buttons (Trove / Gemini) ─────────────────────────────────────
function RowActions({ merchantRaw, onEnrichOne, onCategorizeMerchant, visible }) {
  const [loading, setLoading] = useState(null); // 'trove' | 'gemini' | null
  const [result, setResult] = useState(null);   // { type, ok, msg }

  async function handleTrove() {
    if (!onEnrichOne) return;
    setLoading('trove'); setResult(null);
    const res = await onEnrichOne(merchantRaw);
    setLoading(null);
    setResult({ type: 'trove', ok: res.ok, msg: res.ok ? 'Enriched' : (res.message || 'No match') });
    setTimeout(() => setResult(null), 3000);
  }

  async function handleGemini() {
    if (!onCategorizeMerchant) return;
    setLoading('gemini'); setResult(null);
    const res = await onCategorizeMerchant(merchantRaw);
    setLoading(null);
    setResult({ type: 'gemini', ok: res.ok, msg: res.ok ? (res.suggestedCategory || 'Done') : (res.message || 'Failed') });
    setTimeout(() => setResult(null), 3000);
  }

  if (result) {
    return (
      <span className={`text-[10px] font-medium ${result.ok ? 'text-emerald-500' : 'text-red-400'}`}>
        {result.msg}
      </span>
    );
  }

  if (loading) {
    return (
      <span className="text-[10px] text-zinc-400 animate-pulse">
        {loading === 'trove' ? 'Enriching…' : 'Categorizing…'}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1 transition-opacity ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {onEnrichOne && (
        <button
          onClick={handleTrove}
          className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-zinc-400 hover:text-violet-500 transition-colors"
          title="Enrich with Trove (logo, name, category)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 21 21 6 18 3 3 18 6 21" /><line x1="15" y1="6" x2="18" y2="9" /><path d="M9 3a2 2 0 0 0 2 2a2 2 0 0 0-2 2a2 2 0 0 0-2-2a2 2 0 0 0 2-2" /><path d="M19 13a2 2 0 0 0 2 2a2 2 0 0 0-2 2a2 2 0 0 0-2-2a2 2 0 0 0 2-2" />
          </svg>
        </button>
      )}
      {onCategorizeMerchant && (
        <button
          onClick={handleGemini}
          className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-zinc-400 hover:text-emerald-500 transition-colors"
          title="Categorize with Gemini AI"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Grid column template ─────────────────────────────────────────────────────
const GRID_COLS = '100px 1fr 90px 180px 50px 90px 60px';

// ── Main Component ───────────────────────────────────────────────────────────
export default function TransactionTable({ transactions, overrides, onOverride, onUpdateNote, customCategories = [], onIdentify, geminiModel, onAddCategory, onEnrichOne, onCategorizeMerchant }) {
  const allCategories = getCategories(customCategories);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterBank, setFilterBank] = useState('');
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [editingNotes, setEditingNotes] = useState(null);

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'amount' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  const filtered = transactions.filter((tx) => {
    if (filterCat && tx.category !== filterCat) return false;
    if (filterBank && tx.sourceBank !== filterBank) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesMerchant = (tx.merchant ?? '').toLowerCase().includes(q) || (tx.merchantRaw ?? '').toLowerCase().includes(q);
      const matchesCategory = (tx.category ?? '').toLowerCase().includes(q);
      const matchesDate = tx.date.includes(q);
      const matchesAmount = String(Math.abs(tx.amount)).includes(q);
      const matchesBank = (bankLabel(tx.sourceBank)).toLowerCase().includes(q);
      if (!matchesMerchant && !matchesCategory && !matchesDate && !matchesAmount && !matchesBank) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortCol === 'date')     { av = a.date; bv = b.date; }
    else if (sortCol === 'merchant') { av = (a.merchant ?? '').toLowerCase(); bv = (b.merchant ?? '').toLowerCase(); }
    else if (sortCol === 'amount')   { av = a.amount; bv = b.amount; }
    else if (sortCol === 'category') { av = (a.category ?? '').toLowerCase(); bv = (b.category ?? '').toLowerCase(); }
    else { av = a[sortCol]; bv = b[sortCol]; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleCategoryChange(tx, cat) { onOverride(tx.merchantRaw, cat); }
  function resetPage() { setPage(0); }

  const banks = [...new Set(transactions.map((t) => t.sourceBank))];

  const headerCls = 'cursor-pointer select-none hover:opacity-80 transition-opacity whitespace-nowrap';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <h2 style={{ color: 'var(--color-text-primary)' }} className="font-semibold text-base shrink-0 mr-1">Transactions</h2>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            style={{ color: 'var(--color-text-primary)' }}
            placeholder="Search merchant, category, amount…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: 'var(--color-text-secondary)' }} onClick={() => { setSearch(''); resetPage(); }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Category filter */}
        <FilterDropdown
          options={allCategories.map((c) => ({ value: c, label: c }))}
          value={filterCat}
          onChange={(v) => { setFilterCat(v); resetPage(); }}
          placeholder="All categories"
          clearValue=""
          withIcons={true}
        />

        {/* Bank filter */}
        {banks.length > 1 && (
          <FilterDropdown
            options={banks.map((b) => ({ value: b, label: bankLabel(b) }))}
            value={filterBank}
            onChange={(v) => { setFilterBank(v); resetPage(); }}
            placeholder="All banks"
            clearValue=""
            withIcons={false}
          />
        )}

        <span className="text-xs ml-auto whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>{filtered.length} transactions</span>
        <button
          onClick={() => exportCSV(sorted)}
          className="flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-lg px-2.5 py-1.5 text-xs transition-colors shrink-0"
          style={{ color: 'var(--color-text-secondary)' }}
          title="Export filtered transactions as CSV"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto">
        {/* Header */}
        <div
          className="grid items-center border-b"
          style={{
            gridTemplateColumns: GRID_COLS,
            gap: '16px',
            padding: '0 16px 10px',
            borderColor: 'var(--color-border-row)',
          }}
        >
          <span className={headerCls} style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }} onClick={() => toggleSort('date')}>
            DATE <SortIcon col="date" sortCol={sortCol} sortDir={sortDir} />
          </span>
          <span className={headerCls} style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }} onClick={() => toggleSort('merchant')}>
            MERCHANT <SortIcon col="merchant" sortCol={sortCol} sortDir={sortDir} />
          </span>
          <span className={`${headerCls} text-right`} style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }} onClick={() => toggleSort('amount')}>
            AMOUNT <SortIcon col="amount" sortCol={sortCol} sortDir={sortDir} />
          </span>
          <span className={headerCls} style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }} onClick={() => toggleSort('category')}>
            CATEGORY <SortIcon col="category" sortCol={sortCol} sortDir={sortDir} />
          </span>
          <span style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
            SRC
          </span>
          <span style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
            BANK
          </span>
          <span style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
          </span>
        </div>

        {/* Rows */}
        {paged.map((tx, idx) => {
          const isSpend = tx.amount < 0;
          const override = overrides[tx.merchantRaw];
          const currentCategory = override?.category ?? tx.category;
          const subtitle = cleanSubtitle(tx.merchantRaw, tx.merchant);
          const isLast = idx === paged.length - 1;

          return (
            <div
              key={tx.id}
              className="grid items-center transition-colors"
              style={{
                gridTemplateColumns: GRID_COLS,
                gap: '16px',
                padding: '8px 16px',
                borderBottom: isLast ? 'none' : '0.5px solid var(--color-border-row)',
                backgroundColor: hoveredRow === tx.id ? 'var(--color-surface-hover)' : 'transparent',
              }}
              onMouseEnter={() => setHoveredRow(tx.id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Date */}
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }} className="whitespace-nowrap">
                {fmtDate(tx.date)}
              </span>

              {/* Merchant */}
              <div className="flex items-center gap-2.5 min-w-0">
                <MerchantLogo domain={tx.domain} logo={tx.logo} name={tx.merchant} size={32} />
                <div className="min-w-0">
                  <div
                    className="truncate"
                    style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}
                    title={tx.merchant}
                  >
                    {tx.merchant}
                  </div>
                  {subtitle && (
                    <div
                      className="truncate"
                      style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}
                      title={tx.merchantRaw}
                    >
                      {subtitle}
                    </div>
                  )}
                </div>
              </div>

              {/* Amount */}
              <span
                className="text-right whitespace-nowrap"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: isSpend ? 'var(--color-amount-negative)' : 'var(--color-amount-positive)',
                }}
              >
                {isSpend ? '\u2212' : '+'}{formatCurrency(tx.amount)}
              </span>

              {/* Category pill */}
              <div className="min-w-0 overflow-hidden">
                <CategoryPill
                  category={currentCategory}
                  merchantRaw={tx.merchantRaw}
                  onChange={(cat) => handleCategoryChange(tx, cat)}
                  customCategories={customCategories}
                  onAddCategory={onAddCategory}
                />
              </div>

              {/* Source badge */}
              <div>
                <SourceBadge source={tx.categorySource} />
              </div>

              {/* Bank */}
              <span
                style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={bankLabel(tx.sourceBank)}
              >
                {bankLabel(tx.sourceBank)}
              </span>

              {/* Actions */}
              <RowActions
                merchantRaw={tx.merchantRaw}
                onEnrichOne={onEnrichOne}
                onCategorizeMerchant={onCategorizeMerchant}
                visible={hoveredRow === tx.id}
              />
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border-row)' }}>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 disabled:opacity-25 disabled:pointer-events-none transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              disabled={page === 0}
              onClick={() => setPage(0)}
              title="First page"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 disabled:opacity-25 disabled:pointer-events-none transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {Array.from({ length: pageCount }, (_, i) => i)
              .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1)
              .reduce((acc, i, idx, arr) => {
                if (idx > 0 && i - arr[idx - 1] > 1) acc.push('…');
                acc.push(i);
                return acc;
              }, [])
              .map((item, idx) =>
                item === '…' ? (
                  <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>…</span>
                ) : (
                  <button
                    key={item}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium border transition-colors ${
                      item === page
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                    style={item !== page ? { color: 'var(--color-text-secondary)' } : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item + 1}
                  </button>
                )
              )}
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 disabled:opacity-25 disabled:pointer-events-none transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              disabled={page >= pageCount - 1}
              onClick={() => setPage(page + 1)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 disabled:opacity-25 disabled:pointer-events-none transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              disabled={page >= pageCount - 1}
              onClick={() => setPage(pageCount - 1)}
              title="Last page"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M6 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
