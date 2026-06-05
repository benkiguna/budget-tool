import { motion } from 'framer-motion';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const MIN_MONTHS = 2; // need at least 2 historical months to establish a baseline

function median(sorted) {
  const n = sorted.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(values, mean) {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function detectUnusual(transactions, selectedMonth) {
  const months = [...new Set(
    transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean)
  )].sort().reverse();

  const currentMonth = selectedMonth || months[0];
  if (!currentMonth) return [];

  // Historical months (exclude current)
  const histMonths = months.filter((m) => m !== currentMonth);
  if (histMonths.length < MIN_MONTHS) return [];

  // Build per-category per-month totals
  const catMonthTotals = {}; // { category: { month: total } }

  for (const tx of transactions) {
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    if (tx.category === 'Income') continue;
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    if (!catMonthTotals[tx.category]) catMonthTotals[tx.category] = {};
    if (tx.amount < 0) {
      catMonthTotals[tx.category][month] =
        (catMonthTotals[tx.category][month] || 0) + Math.abs(tx.amount);
    } else {
      // Refund — reduce category spend
      catMonthTotals[tx.category][month] =
        (catMonthTotals[tx.category][month] || 0) - tx.amount;
    }
  }

  const alerts = [];

  for (const [category, monthMap] of Object.entries(catMonthTotals)) {
    const current = monthMap[currentMonth] || 0;
    if (current === 0) continue;

    // Use all historical months (zero-fill for months with no spend in this category)
    const histAmounts = histMonths.map((m) => monthMap[m] || 0);
    const nonZero = histAmounts.filter((a) => a > 0);
    if (nonZero.length < MIN_MONTHS) continue;

    // Median-based baseline is robust to outlier months
    const sorted = [...histAmounts].sort((a, b) => a - b);
    const med = median(sorted);
    if (med < 10) continue; // ignore tiny categories

    // Adaptive threshold: mean + 1.5σ (adapts to category volatility)
    const mean = histAmounts.reduce((s, a) => s + a, 0) / histAmounts.length;
    const sd = stddev(histAmounts, mean);
    const threshold = Math.max(med * 1.4, mean + 1.5 * sd);

    if (current < threshold) continue;

    alerts.push({
      category,
      current,
      avg: med, // show median as the "normal" reference
      ratio: current / med,
      delta: current - med,
    });
  }

  return alerts.sort((a, b) => b.delta - a.delta).slice(0, 6);
}

export default function UnusualSpend({ transactions, selectedMonth }) {
  const alerts = detectUnusual(transactions, selectedMonth);
  if (alerts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Unusual Spend</h2>
        <span className="text-xs bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800/40 rounded-full px-2 py-0.5">
          {alerts.length}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">Categories significantly above your typical spend this period</p>

      <div className="space-y-4">
        {alerts.map(({ category, current, avg, ratio, delta }, i) => {
          const color = CATEGORY_COLORS[category] ?? '#71717a';
          const pct = Math.min(100, (avg / current) * 100);

          return (
            <motion.div
              key={category}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.25 + i * 0.05 }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-zinc-800 dark:text-zinc-200 text-sm">{category}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-rose-400 text-xs font-medium">
                    +{((ratio - 1) * 100).toFixed(0)}% ({formatCurrency(delta)} extra)
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100 text-sm font-semibold tabular-nums">{formatCurrency(current)}</span>
                </div>
              </div>

              {/* Current spend bar */}
              <div className="relative h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.7, delay: 0.3 + i * 0.05, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: color, opacity: 0.35 }}
                />
                {/* Average marker */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, delay: 0.35 + i * 0.05, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
              <p className="text-zinc-400 dark:text-zinc-700 text-xs mt-1">typical {formatCurrency(avg)}/mo (median)</p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
