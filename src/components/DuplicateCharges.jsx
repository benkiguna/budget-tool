import { motion } from 'framer-motion';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency, fmtDate } from '../lib/utils.js';

const WINDOW_DAYS = 5; // charges within 5 days are suspicious

function detectDuplicates(transactions) {
  const spend = transactions.filter(
    (tx) => tx.amount < 0 && !TRANSFER_CATEGORIES.has(tx.category)
  );

  const groups = {};
  for (const tx of spend) {
    // Key: merchant + rounded amount (within $0.01)
    const amountKey = Math.round(Math.abs(tx.amount) * 100);
    const key = `${tx.merchant}||${amountKey}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const duplicates = [];

  for (const [, txs] of Object.entries(groups)) {
    if (txs.length < 2) continue;

    // Sort by date, find pairs within WINDOW_DAYS
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const flagged = new Set();

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const dA = new Date(sorted[i].date + 'T12:00:00');
        const dB = new Date(sorted[j].date + 'T12:00:00');
        const diffDays = Math.abs((dB - dA) / (1000 * 60 * 60 * 24));
        if (diffDays <= WINDOW_DAYS) {
          flagged.add(i);
          flagged.add(j);
        }
      }
    }

    if (flagged.size >= 2) {
      const flaggedTxs = [...flagged].map((idx) => sorted[idx]);
      duplicates.push({
        merchant: flaggedTxs[0].merchant,
        category: flaggedTxs[0].category,
        amount: Math.abs(flaggedTxs[0].amount),
        count: flaggedTxs.length,
        dates: flaggedTxs.map((t) => t.date),
        total: flaggedTxs.reduce((s, t) => s + Math.abs(t.amount), 0),
      });
    }
  }

  return duplicates.sort((a, b) => b.total - a.total).slice(0, 8);
}

export default function DuplicateCharges({ transactions }) {
  const dupes = detectDuplicates(transactions);
  if (dupes.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Possible Duplicates</h2>
        <span className="text-xs bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800/40 rounded-full px-2 py-0.5">
          {dupes.length}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">Same merchant + amount charged within {WINDOW_DAYS} days</p>

      <div className="space-y-3">
        {dupes.map(({ merchant, category, amount, count, dates, total }, i) => {
          const color = CATEGORY_COLORS[category] ?? '#71717a';
          const sortedDates = [...dates].sort();
          return (
            <motion.div
              key={`${merchant}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              className="flex items-start justify-between py-2 border-b border-zinc-200 dark:border-zinc-800 last:border-0"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
                <div className="min-w-0">
                  <p className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{merchant}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">
                    {formatCurrency(amount)} × {count} charges
                  </p>
                  <p className="text-zinc-400 dark:text-zinc-700 text-xs mt-0.5">
                    {fmtDate(sortedDates[0])} → {fmtDate(sortedDates[sortedDates.length - 1])}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-rose-400 text-sm font-semibold tabular-nums">{formatCurrency(total)}</p>
                <p className="text-zinc-500 dark:text-zinc-600 text-xs">total charged</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
