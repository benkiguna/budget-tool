import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { motion } from 'framer-motion';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtMonth(m) {
  const [, mm] = m.split('-');
  return MONTH_LABELS[parseInt(mm, 10) - 1] ?? m;
}

function fmtMonthFull(m) {
  const [yyyy, mm] = m.split('-');
  const name = MONTH_FULL[parseInt(mm, 10) - 1];
  return name ? `${name} ${yyyy}` : m;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-100/95 dark:bg-zinc-800/95 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-xl text-sm backdrop-blur">
      <p className="text-zinc-400 text-xs mb-2">{fmtMonthFull(label)}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300">{p.name}:</span>
          <span className="text-zinc-900 dark:text-zinc-100 font-semibold">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function TrendChart({ transactions, salary, selectedMonth }) {
  const byMonth = {};
  for (const tx of transactions) {
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    if (!byMonth[month]) byMonth[month] = { spend: 0, income: 0 };
    if (tx.amount < 0 && !TRANSFER_CATEGORIES.has(tx.category)) {
      byMonth[month].spend += Math.abs(tx.amount);
    }
    if (tx.category === 'Income') {
      byMonth[month].income += Math.abs(tx.amount);
    }
  }

  const data = Object.keys(byMonth).sort().map((m) => ({
    month: m,
    spend: parseFloat(byMonth[m].spend.toFixed(2)),
    income: parseFloat(byMonth[m].income.toFixed(2)),
  }));

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-center h-64">
        <p className="text-zinc-500 dark:text-zinc-600 text-sm">No data</p>
      </div>
    );
  }

  const fmt = (v) => `$${(v / 1000).toFixed(0)}k`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex-1 flex flex-col"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1 shrink-0">Monthly Trend</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4 shrink-0">
        Actual income vs spend{salary > 0 ? ` · salary target ${fmt(salary)}` : ''}
      </p>

      <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={fmtMonth}
            tick={{ fill: '#52525b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fill: '#52525b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 50 }} />
          {salary > 0 && (
            <ReferenceLine
              y={salary}
              stroke="#10b981"
              strokeDasharray="4 3"
              strokeOpacity={0.45}
              label={{ value: 'Salary', position: 'insideTopRight', fontSize: 10, fill: '#10b981', opacity: 0.7 }}
            />
          )}
          {selectedMonth?.length === 7 && data.some((d) => d.month === selectedMonth) && (
            <ReferenceLine
              x={selectedMonth}
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              strokeDasharray="4 3"
              label={{ value: fmtMonth(selectedMonth), position: 'insideTopLeft', fontSize: 10, fill: '#6366f1', opacity: 0.8 }}
            />
          )}
          <Area
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#incomeGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#10b981' }}
          />
          <Area
            type="monotone"
            dataKey="spend"
            name="Spend"
            stroke="#f43f5e"
            strokeWidth={2}
            fill="url(#spendGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#f43f5e' }}
          />
          <Legend
            wrapperStyle={{ paddingTop: 12, fontSize: 12, color: '#71717a' }}
            formatter={(v) => <span style={{ color: '#71717a' }}>{v}</span>}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
