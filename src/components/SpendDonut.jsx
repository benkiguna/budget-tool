import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const CustomTooltip = ({ active, payload, total }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-zinc-100/95 dark:bg-zinc-800/95 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-xl text-sm backdrop-blur">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[name] ?? '#71717a' }} />
        <span className="text-zinc-900 dark:text-zinc-100 font-semibold">{name}</span>
      </div>
      <p className="text-zinc-400">{formatCurrency(value)}</p>
      <p className="text-zinc-500 text-xs">{((value / total) * 100).toFixed(1)}% of spend</p>
    </div>
  );
};

export default function SpendDonut({ transactions, onCategoryClick }) {
  const byCategory = {};
  for (const tx of transactions) {
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    if (tx.amount < 0) {
      byCategory[tx.category] = (byCategory[tx.category] || 0) + Math.abs(tx.amount);
    } else if (tx.category !== 'Income') {
      // Refund/cashback — reduce the category's spend
      byCategory[tx.category] = (byCategory[tx.category] || 0) - tx.amount;
    }
  }

  const data = Object.entries(byCategory)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-center h-64">
        <p className="text-zinc-500 dark:text-zinc-600 text-sm">No spend data</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1">Spend by Category</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">{formatCurrency(total)} total</p>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0 mx-auto sm:mx-0" style={{ width: 180, height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={54}
                outerRadius={82}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
                animationBegin={200}
                animationDuration={800}
                onClick={(d) => onCategoryClick?.(d.name)}
                style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#71717a'} />
                ))}
              </Pie>
              <Tooltip content={(props) => <CustomTooltip {...props} total={total} />} wrapperStyle={{ zIndex: 50 }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full sm:flex-1 flex flex-col gap-2 min-w-0">
          {data.slice(0, 7).map((d) => {
            const pct = (d.value / total) * 100;
            return (
              <div
                key={d.name}
                onClick={() => onCategoryClick?.(d.name)}
                className={onCategoryClick ? 'cursor-pointer' : ''}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[d.name] ?? '#71717a' }} />
                    <span className="text-zinc-400 text-xs truncate hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">{d.name}</span>
                  </div>
                  <span className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-xs font-medium tabular-nums ml-2 shrink-0">{formatCurrency(d.value)}</span>
                </div>
                <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[d.name] ?? '#71717a' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
