import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';

function fmt(v) {
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function SalaryVsSpend({ transactions, salary }) {
  const byMonth = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue; // exclude card payments & savings
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    byMonth[month] = (byMonth[month] || 0) + Math.abs(tx.amount);
  }

  const data = Object.keys(byMonth)
    .sort()
    .map((m) => ({
      month: m,
      spend: parseFloat(byMonth[m].toFixed(2)),
      salary: salary || 0,
    }));

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-5 flex items-center justify-center h-48">
        <p className="text-zinc-500 text-sm">No data to display.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-5">
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-4">Salary vs. Monthly Spend</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} />
          <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={fmt} />
          <Tooltip
            formatter={(v, name) => [fmt(v), name === 'spend' ? 'Spend' : 'Monthly Salary']}
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#e4e4e7' }}
          />
          <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
          <Bar dataKey="salary" name="Monthly Salary" fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.7} />
          <Bar dataKey="spend"  name="Spend"          fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.85} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
