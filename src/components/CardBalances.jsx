import { motion } from 'framer-motion';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const BANK_META = {
  chase:      { label: 'Chase',        color: '#4f46e5', bg: 'from-indigo-100 dark:from-indigo-950 to-white dark:to-zinc-900' },
  capitalOne: { label: 'Capital One',  color: '#0ea5e9', bg: 'from-sky-100 dark:from-sky-950 to-white dark:to-zinc-900' },
  discover:   { label: 'Discover',     color: '#f97316', bg: 'from-orange-100 dark:from-orange-950 to-white dark:to-zinc-900' },
};

export default function CardBalances({ transactions, cards = {} }) {
  const banks = {};
  for (const tx of transactions) {
    const b = tx.sourceBank;
    if (!banks[b]) banks[b] = { spend: 0, payments: 0, txCount: 0, lastDate: null };
    if (tx.amount < 0 && !TRANSFER_CATEGORIES.has(tx.category)) {
      banks[b].spend += Math.abs(tx.amount);
      banks[b].txCount++;
    }
    // Positive on a credit card = payment received → reduces outstanding balance
    if (tx.amount > 0 && tx.category === 'Credit Card Payment') {
      banks[b].payments += tx.amount;
    }
    if (!banks[b].lastDate || tx.date > banks[b].lastDate) banks[b].lastDate = tx.date;
  }

  const entries = Object.entries(banks)
    .map(([bank, d]) => ({ bank, ...d, outstanding: Math.max(0, d.spend - d.payments) }))
    .sort((a, b) => b.outstanding - a.outstanding);

  if (entries.length === 0) return null;

  const maxSpend = Math.max(...entries.map((e) => e.spend));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1">Card Activity</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">Spend per account from loaded statements</p>

      <div className="space-y-3">
        {entries.map(({ bank, spend, payments, txCount, lastDate, outstanding }, i) => {
          const meta = BANK_META[bank] ?? { label: bank, color: '#71717a', bg: 'from-zinc-800 to-white dark:to-zinc-900' };
          const barPct = maxSpend > 0 ? (spend / maxSpend) * 100 : 0;

            const limit = cards[bank]?.limit || 0;
          const utilPct = limit > 0 ? Math.min((outstanding / limit) * 100, 100) : null;
          const utilColor = utilPct == null ? meta.color
            : utilPct > 70 ? '#f43f5e'
            : utilPct > 40 ? '#f59e0b'
            : '#10b981';

          return (
            <motion.div
              key={bank}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.4 + i * 0.08 }}
              className={`bg-gradient-to-r ${meta.bg} border border-zinc-200 dark:border-zinc-800 rounded-xl p-4`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm">{meta.label}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{txCount} transactions · last {lastDate}</p>
                </div>
                <div className="text-right">
                  <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">{formatCurrency(spend)}</p>
                  <p className="text-zinc-500 text-xs">total spend</p>
                </div>
              </div>

              {/* Spend bar */}
              <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-3">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barPct}%` }}
                  transition={{ duration: 0.9, delay: 0.5 + i * 0.08, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
              </div>

              {payments > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Payments received</span>
                  <span className="text-emerald-400 font-medium tabular-nums">−{formatCurrency(payments)}</span>
                </div>
              )}
              {outstanding > 0 && (
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-zinc-500">Outstanding</span>
                  <span className="text-amber-400 font-semibold tabular-nums">{formatCurrency(outstanding)}</span>
                </div>
              )}

              {/* Utilization */}
              {utilPct !== null && (
                <div className="mt-3 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-500">Utilization</span>
                    <span className="font-semibold tabular-nums" style={{ color: utilColor }}>
                      {utilPct.toFixed(0)}% of {formatCurrency(limit)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${utilPct}%` }}
                      transition={{ duration: 0.9, delay: 0.6 + i * 0.08, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: utilColor }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
