import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryListPopover, pillStyle } from './CategoryListPopover.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts';
import {
  X, ChevronLeft, ChevronRight,
  UtensilsCrossed, ShoppingCart, Car, ShoppingBag, Tv2, Zap,
  HeartPulse, Plane, Clapperboard, TrendingUp, Package2,
  CreditCard, PiggyBank, Home, Landmark, Building2,
} from 'lucide-react';

const CATEGORY_ICONS = {
  Food:                  UtensilsCrossed,
  Groceries:             ShoppingCart,
  Transport:             Car,
  Shopping:              ShoppingBag,
  Subscriptions:         Tv2,
  Bills:                 Zap,
  Health:                HeartPulse,
  Travel:                Plane,
  Entertainment:         Clapperboard,
  Income:                TrendingUp,
  Other:                 Package2,
  'Credit Card Payment': CreditCard,
  Savings:               PiggyBank,
  Checking:              Building2,
  Rent:                  Home,
  'House Rent':          Home,
  EMI:                   Landmark,
};
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES, getCategories } from '../lib/categorizer.js';
import { formatCurrency, fmtDate } from '../lib/utils.js';
import MerchantLogo from './MerchantLogo.jsx';

function fmtMonth(m) {
  if (!m || typeof m !== 'string') return 'All time';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Sparkline tooltip ──────────────────────────────────────────────────────────
function SparkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs">
      <p className="text-zinc-300 font-medium">{fmtMonth(label)}</p>
      <p className="text-zinc-100 tabular-nums">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

export default function CategoryDrawer({
  category,
  month,
  transactions,
  overrides,
  settings,
  onClose,
  onOverride,
  onMonthChange,
  onAddCategory,
}) {
  const isOpen = !!category;
  const [drawerMonth, setDrawerMonth] = useState(month);
  const [editingTx, setEditingTx] = useState(null); // txId being re-assigned
  const listRef = useRef(null);

  // Sync drawer month when parent month changes or drawer opens
  useEffect(() => {
    if (isOpen) setDrawerMonth(month);
  }, [month, isOpen]);

  // Lock scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const color = CATEGORY_COLORS[category] ?? '#71717a';
  const CategoryIcon = CATEGORY_ICONS[category] ?? Package2;

  // All sorted months in data
  const allMonths = useMemo(() => [...new Set(
    transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean)
  )].sort().reverse(), [transactions]);

  // Transactions in the selected category
  const catTxs = useMemo(() => transactions.filter((tx) => tx.category === category), [transactions, category]);

  // Filtered by drawer month
  const filtered = useMemo(() => drawerMonth
    ? catTxs.filter((tx) => tx.date?.startsWith(drawerMonth))
    : catTxs, [catTxs, drawerMonth]);

  // Split into spend (negative) and refunds (positive, excluding Income category)
  const spend = filtered.filter((tx) => tx.amount < 0).sort((a, b) => b.date.localeCompare(a.date));
  const refunds = filtered.filter((tx) => tx.amount >= 0).sort((a, b) => b.date.localeCompare(a.date));

  // Stats
  const totalSpend = spend.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const totalRefunds = refunds.reduce((s, tx) => s + tx.amount, 0);
  const netSpend = Math.max(0, totalSpend - totalRefunds);
  const allSpend = transactions.filter((tx) => {
    const inMonth = drawerMonth ? tx.date?.startsWith(drawerMonth) : true;
    return inMonth && tx.amount < 0 && !TRANSFER_CATEGORIES.has(tx.category);
  }).reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const pct = allSpend > 0 ? (netSpend / allSpend) * 100 : 0;

  // Month navigation
  const monthIdx = drawerMonth ? allMonths.indexOf(drawerMonth) : -1;
  const canPrev = monthIdx > 0; // prev = earlier in list = higher index in desc-sorted
  const canNext = monthIdx < allMonths.length - 1 || monthIdx === -1;
  function goPrev() {
    if (!drawerMonth) { setDrawerMonth(allMonths[0]); return; }
    if (canPrev) setDrawerMonth(allMonths[monthIdx - 1]);
  }
  function goNext() {
    if (monthIdx === -1 || monthIdx === allMonths.length - 1) return;
    if (monthIdx + 1 === allMonths.length) { setDrawerMonth(''); return; }
    setDrawerMonth(allMonths[monthIdx + 1]);
  }

  // 6-month sparkline data (most recent 6 months)
  const sparkData = useMemo(() => {
    const recent = [...allMonths].slice(0, 6).reverse();
    return recent.map((m) => ({
      month: m,
      value: catTxs
        .filter((tx) => tx.date?.startsWith(m) && tx.amount < 0)
        .reduce((s, tx) => s + Math.abs(tx.amount), 0),
    }));
  }, [allMonths, catTxs]);

  // Top 5 merchants in this filter period
  const topMerchants = useMemo(() => {
    const map = {};
    for (const tx of spend) {
      const key = tx.merchantRaw;
      if (!map[key]) map[key] = { merchant: tx.merchant, merchantRaw: key, domain: tx.domain, logo: tx.logo, total: 0, count: 0 };
      map[key].total += Math.abs(tx.amount);
      map[key].count++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [spend]);

  const maxMerchant = topMerchants[0]?.total ?? 0;

  const categories = getCategories(settings?.categories);

  function handleReassign(merchantRaw, newCat) {
    onOverride(merchantRaw, newCat);
    setEditingTx(null);
  }

  // Scroll to top when category or month changes
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [category, drawerMonth]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
          >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}22` }}
              >
                <CategoryIcon size={18} color={color} strokeWidth={1.5} />
              </div>
              <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base flex-1 truncate">
                {category}
              </h2>

              {/* Month navigation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={goPrev}
                  disabled={!drawerMonth && allMonths.length === 0}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs text-zinc-500 w-16 text-center tabular-nums">
                  {fmtMonth(drawerMonth)}
                </span>
                <button
                  onClick={goNext}
                  disabled={drawerMonth === '' || monthIdx === allMonths.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Scrollable body ──────────────────────────────────────────── */}
            <div ref={listRef} className="flex-1 overflow-y-auto">

              {/* ── Stats strip ────────────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800">
                {[
                  { label: 'Net spend', value: formatCurrency(netSpend) },
                  { label: 'Transactions', value: spend.length },
                  { label: '% of spend', value: `${pct.toFixed(1)}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white dark:bg-zinc-900 px-4 py-3 text-center">
                    <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* ── 6-month sparkline ───────────────────────────────────────── */}
              {sparkData.some((d) => d.value > 0) && (
                <div className="px-5 pt-5 pb-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-2">6-month trend</p>
                  <ResponsiveContainer width="100%" height={60}>
                    <BarChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={20}>
                      <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={color} opacity={0.85} />
                      <Tooltip content={<SparkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Month labels */}
                  <div className="flex justify-between mt-1">
                    {sparkData.map((d) => (
                      <button
                        key={d.month}
                        onClick={() => setDrawerMonth(d.month === drawerMonth ? '' : d.month)}
                        className={`text-xs transition-colors ${
                          d.month === drawerMonth
                            ? 'font-semibold'
                            : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
                        }`}
                        style={d.month === drawerMonth ? { color } : {}}
                      >
                        {fmtMonth(d.month).split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Top merchants ───────────────────────────────────────────── */}
              {topMerchants.length > 0 && (
                <div className="px-5 pt-4 pb-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-3">Top merchants</p>
                  <div className="space-y-2.5">
                    {topMerchants.map((m) => (
                      <div key={m.merchantRaw}>
                        <div className="flex items-center gap-2 mb-1">
                          <MerchantLogo domain={m.domain} logo={m.logo} name={m.merchant} size={18} />
                          <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate">{m.merchant}</span>
                          <span className="text-xs text-zinc-500 tabular-nums">{m.count}×</span>
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 tabular-nums ml-1">
                            {formatCurrency(m.total)}
                          </span>
                        </div>
                        <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(m.total / maxMerchant) * 100}%`, backgroundColor: color, opacity: 0.7 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Transaction list ─────────────────────────────────────────── */}
              <div className="px-5 pt-4 pb-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-3">
                  Transactions {spend.length > 0 ? `(${spend.length})` : ''}
                </p>

                {spend.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-zinc-600 py-4 text-center">
                    No transactions for this period
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {spend.map((tx) => (
                      <TxRow
                        key={tx.id}
                        tx={tx}
                        color={color}
                        categories={categories}
                        isEditing={editingTx === tx.id}
                        onToggleEdit={() => setEditingTx(editingTx === tx.id ? null : tx.id)}
                        onReassign={(cat) => handleReassign(tx.merchantRaw, cat)}
                        onAddCategory={onAddCategory}
                        amountSign={-1}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Refunds ─────────────────────────────────────────────────── */}
              {refunds.length > 0 && (
                <div className="px-5 pt-4 pb-5">
                  <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-3">
                    Refunds / credits ({refunds.length})
                  </p>
                  <div className="space-y-0.5">
                    {refunds.map((tx) => (
                      <TxRow
                        key={tx.id}
                        tx={tx}
                        color="#10b981"
                        categories={categories}
                        isEditing={editingTx === tx.id}
                        onToggleEdit={() => setEditingTx(editingTx === tx.id ? null : tx.id)}
                        onReassign={(cat) => handleReassign(tx.merchantRaw, cat)}
                        onAddCategory={onAddCategory}
                        amountSign={1}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="h-10" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const SOURCE_BADGE = {
  user:          'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
  ai:            'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
  trove:         'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
  keyword:       'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
  bank:          'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400',
  uncategorized: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',
};

// ── Individual transaction row ──────────────────────────────────────────────────
function TxRow({ tx, color, categories, isEditing, onToggleEdit, onReassign, onAddCategory, amountSign }) {
  const [localCat, setLocalCat] = useState(tx.category);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const pickerBtnRef = useRef(null);

  useEffect(() => { setLocalCat(tx.category); }, [tx.category]);

  const amt = Math.abs(tx.amount);
  const sign = amountSign > 0 ? '+' : '-';
  const sourceCls = SOURCE_BADGE[tx.categorySource] ?? SOURCE_BADGE.uncategorized;
  const catColor = CATEGORY_COLORS[tx.category] ?? '#71717a';

  return (
    <div className={`rounded-lg transition-colors ${isEditing ? 'bg-zinc-50 dark:bg-zinc-800/60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}>
      <button
        onClick={onToggleEdit}
        className="w-full flex items-center gap-2.5 px-2.5 py-2.5 text-left"
      >
        <MerchantLogo domain={tx.domain} logo={tx.logo} name={tx.merchant} size={32} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{tx.merchant}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-zinc-400 dark:text-zinc-600">{fmtDate(tx.date)}</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium leading-none"
              style={{ backgroundColor: `${catColor}20`, color: catColor }}
            >
              {tx.category}
            </span>
            {tx.categorySource && tx.categorySource !== 'uncategorized' && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium leading-none ${sourceCls}`}>
                {tx.categorySource}
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-sm font-semibold tabular-nums shrink-0 ${amountSign > 0 ? 'text-emerald-500' : 'text-zinc-700 dark:text-zinc-300'}`}
        >
          {sign}{formatCurrency(amt)}
        </span>
      </button>

      {/* Inline re-assign */}
      {isEditing && (() => {
        const ps = pillStyle(localCat);
        return (
          <div className="px-2.5 pb-2.5 flex items-center gap-2">
            <span className="text-xs text-zinc-500 shrink-0">Move to</span>
            {!addingNew && <button
              ref={pickerBtnRef}
              onClick={() => setPickerOpen((v) => !v)}
              className="flex-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-all hover:opacity-80"
              style={{
                backgroundColor: ps.backgroundColor,
                color: ps.color,
                border: `1px solid ${ps.borderColor}`,
              }}
            >
              <span className="flex-1 text-left">{localCat}</span>
              <svg style={{ width: 10, height: 10, opacity: 0.6, transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 140ms ease' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>}
            {addingNew && (
              <input
                autoFocus
                className="flex-1 bg-zinc-100 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded-full px-3 py-1 text-xs focus:outline-none"
                style={{ color: 'var(--color-text-primary)' }}
                placeholder="New category name…"
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const name = newCatInput.trim();
                    if (name) { onAddCategory?.(name); setLocalCat(name); }
                    setAddingNew(false); setNewCatInput('');
                  }
                  if (e.key === 'Escape') { setAddingNew(false); setNewCatInput(''); }
                }}
                onBlur={() => { setAddingNew(false); setNewCatInput(''); }}
              />
            )}
            {pickerOpen && pickerBtnRef.current && (
              <CategoryListPopover
                options={[...categories.map((c) => ({ value: c, label: c })), { value: '__new__', label: '+ New category' }]}
                value={localCat}
                onChange={(cat) => {
                  if (cat === '__new__') { setPickerOpen(false); setAddingNew(true); }
                  else { setLocalCat(cat); setPickerOpen(false); }
                }}
                onClose={() => setPickerOpen(false)}
                anchor={pickerBtnRef.current.getBoundingClientRect()}
                withIcons={true}
              />
            )}
            <button
              onClick={() => onReassign(localCat)}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-md font-medium transition-colors shrink-0"
            >
              Save
            </button>
          </div>
        );
      })()}
    </div>
  );
}
