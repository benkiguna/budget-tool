import { motion } from 'framer-motion';
import {
  UtensilsCrossed, ShoppingCart, Car, ShoppingBag, Tv2, Zap,
  HeartPulse, Plane, Clapperboard, TrendingUp, Package2,
  CreditCard, PiggyBank, Home, Landmark,
} from 'lucide-react';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

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
  Rent:                  Home,
  'House Rent':          Home,
  EMI:                   Landmark,
};

function alpha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function buildCategoryTotals(transactions) {
  const map = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    map[tx.category] = (map[tx.category] || 0) + Math.abs(tx.amount);
  }
  return map;
}

function CategoryCard({ cat, cur, prev, delta, share, index, onClick }) {
  const color = CATEGORY_COLORS[cat] ?? '#71717a';
  const Icon = CATEGORY_ICONS[cat] ?? Package2;
  const isUp = delta !== null && delta > 5;
  const isDown = delta !== null && delta < -5;

  const isLarge = share > 22;
  const isMedium = share > 11;
  const iconSize = isLarge ? 44 : isMedium ? 34 : 26;
  const iconWrap = iconSize + 22;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.04 + index * 0.03 }}
      onClick={onClick}
      className={`flex flex-col items-center text-center py-4 px-3 overflow-hidden ${onClick ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors' : ''}`}
      style={{
        flexBasis: `calc(${Math.max(share * 1.15, 10)}% - 8px)`,
        flexGrow: 1,
        flexShrink: 0,
        minWidth: 90,
        maxWidth: '50%',
        boxSizing: 'border-box',
      }}
    >
      {/* Delta — in flow at top right */}
      <div className="w-full flex justify-end mb-1 min-h-[18px]">
        {delta !== null && (
          <span className={`text-xs font-semibold leading-none ${
            isUp ? 'text-rose-500 dark:text-rose-400'
            : isDown ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-zinc-400'
          }`}>
            {isUp ? '↑' : isDown ? '↓' : '≈'}{Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Big centered icon */}
      <div
        className="rounded-2xl flex items-center justify-center shrink-0"
        style={{ width: iconWrap, height: iconWrap, background: alpha(color, 0.14) }}
      >
        <Icon size={iconSize} color={color} strokeWidth={1.5} />
      </div>

      {/* Category name */}
      <p className={`mt-2.5 font-medium text-zinc-500 dark:text-zinc-400 w-full truncate ${isLarge ? 'text-sm' : 'text-xs'}`}>
        {cat}
      </p>

      {/* Amount */}
      <p
        className={`font-bold tabular-nums leading-tight ${isLarge ? 'text-xl' : isMedium ? 'text-base' : 'text-sm'}`}
        style={{ color }}
      >
        {formatCurrency(cur)}
      </p>

      {/* Share % */}
      <p className="text-zinc-400 dark:text-zinc-600 text-xs mt-0.5">{share.toFixed(0)}%</p>

      {/* Bottom bar — in flow */}
      <div className="w-full mt-3 h-0.5 rounded-full overflow-hidden" style={{ background: alpha(color, 0.15) }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(share * (100 / 35), 100)}%` }}
          transition={{ duration: 1, delay: 0.15 + index * 0.04, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </motion.div>
  );
}

export default function CategoryDelta({ transactions, selectedMonth, onCategoryClick }) {
  const months = [...new Set(
    transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean)
  )].sort().reverse();

  // All-time mode: aggregate all transactions, no delta comparison
  const isAllTime = !selectedMonth;
  const currentMonth = selectedMonth || null;
  const prevMonth = currentMonth ? months[months.indexOf(currentMonth) + 1] : null;

  if (!isAllTime && !currentMonth) return null;

  const current = isAllTime
    ? buildCategoryTotals(transactions)
    : buildCategoryTotals(transactions.filter((tx) => tx.date?.startsWith(currentMonth)));
  const previous = (!isAllTime && prevMonth)
    ? buildCategoryTotals(transactions.filter((tx) => tx.date?.startsWith(prevMonth)))
    : {};

  const allCats = [...new Set([...Object.keys(current), ...Object.keys(previous)])];
  const total = Object.values(current).reduce((s, v) => s + v, 0);

  const rows = allCats
    .map((cat) => {
      const cur = current[cat] || 0;
      const prev = previous[cat] || 0;
      const delta = prev > 0 ? ((cur - prev) / prev) * 100 : null;
      const share = total > 0 ? (cur / total) * 100 : 0;
      return { cat, cur, prev, delta, share };
    })
    .filter((r) => r.cur > 0)
    .sort((a, b) => b.cur - a.cur);

  if (rows.length === 0) return null;

  const fmtMonth = (m) =>
    new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Category Breakdown</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          {isAllTime
            ? 'All time'
            : prevMonth
              ? `${fmtMonth(currentMonth)} vs ${fmtMonth(prevMonth)}`
              : fmtMonth(currentMonth)
          }
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {rows.map(({ cat, cur, prev, delta, share }, i) => (
          <CategoryCard
            key={cat}
            cat={cat} cur={cur} prev={prev} delta={delta}
            share={share} index={i}
            onClick={onCategoryClick ? () => onCategoryClick(cat) : undefined}
          />
        ))}
      </div>
    </motion.div>
  );
}
