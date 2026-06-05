import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_COLORS = ['#8b5cf6', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#f97316', '#f43f5e'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-100/95 dark:bg-zinc-800/95 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-xl text-xs backdrop-blur">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="text-zinc-900 dark:text-zinc-100 font-semibold">{formatCurrency(payload[0].value)}</p>
      <p className="text-zinc-500">{payload[0].payload.count} transactions</p>
    </div>
  );
};

export default function WeeklyPattern({ transactions }) {
  // Aggregate spend by day of week
  const byDay = Array(7).fill(null).map(() => ({ total: 0, count: 0 }));
  // Count how many times each weekday occurs in the date range (for normalization)
  const dowOccurrences = Array(7).fill(0);

  // Collect all unique dates that appear in transactions to count weekday occurrences
  const uniqueDates = new Set(transactions.map((tx) => tx.date).filter(Boolean));
  for (const d of uniqueDates) {
    dowOccurrences[new Date(d + 'T12:00:00').getDay()]++;
  }

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    if (!tx.date) continue;
    const dow = new Date(tx.date + 'T12:00:00').getDay(); // noon to avoid TZ issues
    byDay[dow].total += Math.abs(tx.amount);
    byDay[dow].count += 1;
  }

  const data = DAY_LABELS.map((label, i) => {
    // Normalize by number of times this weekday appears — gives average spend per that day
    const occurrences = dowOccurrences[i] || 1;
    return {
      label,
      total: parseFloat((byDay[i].total / occurrences).toFixed(2)),
      rawTotal: byDay[i].total,
      count: byDay[i].count,
      occurrences,
    };
  });

  const totalTx = data.reduce((s, d) => s + d.count, 0);
  if (totalTx === 0) return null;

  const maxDay = data.reduce((best, d) => (d.total > best.total ? d : best), data[0]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1">Spend by Day</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">
        Average spend per weekday · heaviest: <span className="text-zinc-400">{maxDay.label}</span> · {formatCurrency(maxDay.total)}/occurrence
      </p>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={28}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#52525b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#52525b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--chart-cursor)' }} wrapperStyle={{ zIndex: 50 }} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={d.label}
                fill={DAY_COLORS[i]}
                opacity={d.label === maxDay.label ? 1 : 0.55}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Day pills */}
      <div className="grid grid-cols-7 gap-1 mt-3">
        {data.map((d, i) => {
          const isMax = d.label === maxDay.label;
          return (
            <div key={d.label} className="text-center">
              <p className={`text-xs tabular-nums ${isMax ? 'text-zinc-800 dark:text-zinc-200 font-semibold' : 'text-zinc-500 dark:text-zinc-600'}`}>
                {d.count}
              </p>
              <p className="text-zinc-400 dark:text-zinc-700 text-xs">tx</p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
