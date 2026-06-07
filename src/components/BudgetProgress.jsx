import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency } from '../lib/utils.js';
import { pillStyle, CategoryIcon } from './CategoryListPopover.jsx';

function BudgetBar({ category, spent, budget, delay }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const over = budget > 0 && spent > budget;
  const warning = !over && pct >= 75;

  const barColor = over
    ? 'bg-rose-500'
    : warning
    ? 'bg-amber-400'
    : 'bg-emerald-500';

  const ps = pillStyle(category);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay }}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0"
          style={ps}
        >
          <CategoryIcon category={category} className="w-3 h-3 shrink-0" />
          {category}
        </span>
        <span className={`text-xs tabular-nums font-medium ${over ? 'text-rose-500' : 'text-zinc-500'}`}>
          {formatCurrency(spent)}
          <span className="text-zinc-400"> / {formatCurrency(budget)}</span>
        </span>
      </div>

      <div className="h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, delay: delay + 0.1, ease: 'easeOut' }}
        />
      </div>

      {over && (
        <p className="text-xs text-rose-500">
          {formatCurrency(spent - budget)} over budget
        </p>
      )}
    </motion.div>
  );
}

export default function BudgetProgress({ transactions, settings, selectedMonth }) {
  const budgets = settings.categoryBudgets ?? {};

  const spent = useMemo(() => {
    const period = selectedMonth ?? '';
    const result = {};
    for (const tx of transactions) {
      if (tx.amount >= 0) continue;
      if (tx.pnlImpact === 0 || tx.pnlImpact === false) continue;
      if (period && !tx.date?.startsWith(period)) continue;
      result[tx.category] = (result[tx.category] ?? 0) + Math.abs(tx.amount);
    }
    return result;
  }, [transactions, selectedMonth]);

  // Only show categories that have a budget set
  const rows = Object.entries(budgets)
    .filter(([, budget]) => budget > 0)
    .map(([cat, budget]) => ({ cat, budget, spent: spent[cat] ?? 0 }))
    .sort((a, b) => {
      // Sort: over budget first, then by % used descending
      const pa = a.budget > 0 ? a.spent / a.budget : 0;
      const pb = b.budget > 0 ? b.spent / b.budget : 0;
      return pb - pa;
    });

  if (rows.length === 0) return null;

  const overCount = rows.filter((r) => r.spent > r.budget).length;
  const warnCount = rows.filter((r) => r.budget > 0 && r.spent / r.budget >= 0.75 && r.spent <= r.budget).length;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm">Budget</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {selectedMonth ? `${selectedMonth} spending` : 'All-time spending'} vs monthly limits
          </p>
        </div>
        {(overCount > 0 || warnCount > 0) && (
          <div className="flex items-center gap-1.5">
            {overCount > 0 && (
              <span className="text-xs bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800/40 rounded-full px-2 py-0.5">
                {overCount} over
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800/40 rounded-full px-2 py-0.5">
                {warnCount} near limit
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rows.map(({ cat, budget, spent: s }, i) => (
          <BudgetBar
            key={cat}
            category={cat}
            spent={s}
            budget={budget}
            delay={i * 0.04}
          />
        ))}
      </div>
    </div>
  );
}
