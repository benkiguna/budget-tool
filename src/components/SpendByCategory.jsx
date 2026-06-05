import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#6b7280',
];

function fmt(v) {
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function SpendByCategory({ transactions, onCategoryClick }) {
  // Only spending (negative amounts), exclude Income category
  const expenses = transactions.filter((tx) => tx.amount < 0 && tx.category !== 'Income');

  const byCategory = {};
  for (const tx of expenses) {
    const cat = tx.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
  }

  const data = Object.entries(byCategory)
    .map(([name, total]) => ({ name, total: parseFloat(total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total);

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-5 flex items-center justify-center h-48">
        <p className="text-zinc-500 text-sm">No expense data for this period.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-5">
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-4">Spend by Category</h2>
      {/* Horizontal bar chart per spec */}
      <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={fmt} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 12 }} width={90} />
          <Tooltip
            formatter={(v) => [fmt(v), 'Total']}
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#e4e4e7' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar
            dataKey="total"
            radius={[0, 4, 4, 0]}
            onClick={(d) => onCategoryClick?.(d.name)}
            style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
          >
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
