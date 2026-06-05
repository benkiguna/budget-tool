import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(m) {
  const [, mm] = m.split('-');
  return MONTH_LABELS[parseInt(mm, 10) - 1] ?? m;
}

const LINE_COLORS = ['#f43f5e','#8b5cf6','#0ea5e9','#f59e0b','#10b981'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-100/95 dark:bg-zinc-800/95 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-xl text-xs backdrop-blur">
      <p className="text-zinc-400 mb-2">{fmtMonth(label)} {label?.slice(0, 4)}</p>
      {payload.filter((p) => p.value > 0).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-400 truncate max-w-28">{p.dataKey}</span>
          <span className="text-zinc-900 dark:text-zinc-100 font-semibold ml-auto tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function MerchantTrend({ transactions }) {
  // Find top 5 merchants by total spend
  const merchantTotals = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    merchantTotals[tx.merchant] = (merchantTotals[tx.merchant] || 0) + Math.abs(tx.amount);
  }

  const top5 = Object.entries(merchantTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  if (top5.length === 0) return null;

  // Build per-month data for top 5
  const monthMap = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (!top5.includes(tx.merchant)) continue;
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    if (!monthMap[month]) monthMap[month] = {};
    monthMap[month][tx.merchant] = (monthMap[month][tx.merchant] || 0) + Math.abs(tx.amount);
  }

  const months = Object.keys(monthMap).sort().slice(-8);
  if (months.length < 2) return null;

  const data = months.map((m) => {
    const row = { month: m };
    for (const name of top5) {
      row[name] = parseFloat((monthMap[m]?.[name] || 0).toFixed(2));
    }
    return row;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1">Top Merchant Trends</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">Monthly spend for your top 5 merchants</p>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={fmtMonth}
            tick={{ fill: '#52525b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
            tick={{ fill: '#52525b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 50 }} />
          <Legend
            wrapperStyle={{ paddingTop: 12, fontSize: 11 }}
            formatter={(v) => <span style={{ color: '#71717a' }}>{v}</span>}
          />
          {top5.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={LINE_COLORS[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: LINE_COLORS[i] }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
