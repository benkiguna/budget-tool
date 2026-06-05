import { motion } from 'framer-motion';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';
import MerchantLogo from './MerchantLogo.jsx';

export default function TopMerchants({ transactions }) {
  const map = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    if (!map[tx.merchant]) map[tx.merchant] = { total: 0, count: 0, category: tx.category, domain: tx.domain ?? null, logo: tx.logo ?? null };
    map[tx.merchant].total += Math.abs(tx.amount);
    map[tx.merchant].count++;
  }

  const top = Object.entries(map)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (top.length === 0) return null;

  const max = top[0].total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col h-[400px]"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1 shrink-0">Top Merchants</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4 shrink-0">By total spend</p>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {top.map(({ name, total, count, category, domain, logo }, i) => {
          const color = CATEGORY_COLORS[category] ?? '#71717a';
          const pct = (total / max) * 100;

          return (
            <motion.div
              key={name}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.45 + i * 0.05 }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <MerchantLogo domain={domain} logo={logo} name={name} size={22} />
                  <span className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{name}</span>
                  <span className="text-zinc-500 dark:text-zinc-600 text-xs shrink-0">{count}×</span>
                </div>
                <span className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-sm font-semibold tabular-nums ml-3 shrink-0">
                  {formatCurrency(total)}
                </span>
              </div>
              <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.05, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: color, opacity: 0.7 }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
