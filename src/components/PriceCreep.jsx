import { motion } from 'framer-motion';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

// Linear regression slope ($ per month) — positive = increasing trend
function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const sumX = (n * (n - 1)) / 2;
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY = values.reduce((s, v) => s + v, 0);
  const sumXY = values.reduce((s, v, i) => s + i * v, 0);
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

// Detect merchants whose per-month charge has increased over time
function detectPriceCreep(transactions) {
  // Group by merchant → by month → sum
  const byMerchant = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    if (!byMerchant[tx.merchant]) byMerchant[tx.merchant] = { category: tx.category, months: {} };
    byMerchant[tx.merchant].months[month] =
      (byMerchant[tx.merchant].months[month] || 0) + Math.abs(tx.amount);
  }

  const results = [];

  for (const [merchant, { category, months }] of Object.entries(byMerchant)) {
    const sorted = Object.keys(months).sort();
    if (sorted.length < 3) continue;

    const amounts = sorted.map((m) => months[m]);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;

    // Use linear regression slope — catches gradual creep, tolerates noise
    const slope = linearSlope(amounts);
    if (slope <= 0) continue; // must be trending upward

    // Slope must be at least 0.5% of average per month to be notable
    if (slope / avg < 0.005) continue;

    // Projected total growth over the observed period using regression
    const projectedFirst = avg - slope * (amounts.length - 1) / 2;
    const projectedLast = avg + slope * (amounts.length - 1) / 2;
    const totalGrowth = projectedFirst > 0 ? ((projectedLast - projectedFirst) / projectedFirst) * 100 : 0;
    if (totalGrowth < 3) continue;

    const first = amounts[0];
    const last = amounts[amounts.length - 1];

    results.push({
      merchant,
      category,
      first,
      last,
      totalGrowth,
      months: sorted.length,
      monthlyIncrease: slope,
    });
  }

  return results.sort((a, b) => b.totalGrowth - a.totalGrowth).slice(0, 6);
}

export default function PriceCreep({ transactions }) {
  const creeping = detectPriceCreep(transactions);
  if (creeping.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Price Creep</h2>
        <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800/40 rounded-full px-2 py-0.5">
          {creeping.length}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">Charges that have been quietly increasing</p>

      <div className="space-y-3">
        {creeping.map(({ merchant, category, first, last, totalGrowth, months, monthlyIncrease }, i) => {
          const color = CATEGORY_COLORS[category] ?? '#71717a';
          return (
            <motion.div
              key={merchant}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.05 }}
              className="flex items-center justify-between py-2 border-b border-zinc-200 dark:border-zinc-800 last:border-0"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <div className="min-w-0">
                  <p className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{merchant}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">
                    {formatCurrency(first)} → {formatCurrency(last)} over {months} months
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-amber-400 text-sm font-semibold">+{totalGrowth.toFixed(0)}%</p>
                <p className="text-zinc-500 dark:text-zinc-600 text-xs">+{formatCurrency(monthlyIncrease)}/mo avg</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
