import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(m) {
  const [, mm] = m.split('-');
  return MONTH_LABELS[parseInt(mm, 10) - 1] ?? m;
}

function CustomTooltip({ active, payload, label, hoveredCategory }) {
  if (!active || !payload?.length) return null;
  const visible = hoveredCategory
    ? payload.filter((p) => p.dataKey === hoveredCategory && p.value > 0)
    : payload.filter((p) => p.value > 0);
  if (!visible.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-zinc-100/95 dark:bg-zinc-800/95 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-xl text-xs backdrop-blur max-w-48">
      <p className="text-zinc-400 mb-2">{fmtMonth(label)} {label?.slice(0, 4)}</p>
      {[...visible].reverse().map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.stroke }} />
            <span className="text-zinc-400">{p.dataKey}</span>
          </div>
          <span className="text-zinc-800 dark:text-zinc-200 font-medium tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
      {!hoveredCategory && (
        <div className="border-t border-zinc-300 dark:border-zinc-700 mt-2 pt-2 flex justify-between">
          <span className="text-zinc-500">Total</span>
          <span className="text-zinc-900 dark:text-zinc-100 font-semibold">{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}

function CustomLegend({ categories, hoveredCategory, onHover, onCategoryClick }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-3 justify-center">
      {categories.map((cat) => {
        const color = CATEGORY_COLORS[cat] ?? '#71717a';
        const dimmed = hoveredCategory && hoveredCategory !== cat;
        return (
          <button
            key={cat}
            onMouseEnter={() => onHover(cat)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onCategoryClick?.(cat)}
            className="flex items-center gap-1.5 text-xs transition-opacity duration-150"
            style={{ opacity: dimmed ? 0.3 : 1 }}
          >
            <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: color }} />
            <span style={{ color: dimmed ? '#71717a' : color }}>{cat}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function CategoryTrend({ transactions, onCategoryClick }) {
  const [hoveredCategory, setHoveredCategory] = useState(null);

  const monthCatMap = {};
  const catSet = new Set();

  for (const tx of transactions) {
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    if (!monthCatMap[month]) monthCatMap[month] = {};
    if (tx.amount < 0) {
      monthCatMap[month][tx.category] = (monthCatMap[month][tx.category] || 0) + Math.abs(tx.amount);
      catSet.add(tx.category);
    } else if (tx.category !== 'Income') {
      // Refund — reduce category spend for that month
      monthCatMap[month][tx.category] = (monthCatMap[month][tx.category] || 0) - tx.amount;
    }
  }

  // Fill in all consecutive months between earliest and latest (no gaps in chart)
  const allMonths = Object.keys(monthCatMap).sort();
  if (allMonths.length < 2) return null;

  const firstMonth = allMonths[0];
  const lastMonth = allMonths[allMonths.length - 1];
  const filledMonths = [];
  {
    const [fy, fm] = firstMonth.split('-').map(Number);
    const [ly, lm] = lastMonth.split('-').map(Number);
    let y = fy, m = fm;
    while (y < ly || (y === ly && m <= lm)) {
      filledMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }
  const months = filledMonths.slice(-8);

  const data = months.map((m) => {
    const row = { month: m };
    for (const cat of catSet) {
      row[cat] = parseFloat(((monthCatMap[m] || {})[cat] || 0).toFixed(2));
    }
    return row;
  });

  const categories = [...catSet].sort((a, b) => {
    const sumA = data.reduce((s, d) => s + (d[a] || 0), 0);
    const sumB = data.reduce((s, d) => s + (d[b] || 0), 0);
    return sumB - sumA;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1">Spend by Category Over Time</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">Last {months.length} months · hover a line or legend to focus</p>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <defs>
            {categories.map((cat, i) => {
              const color = CATEGORY_COLORS[cat] ?? '#71717a';
              return (
                <linearGradient key={i} id={`ct-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
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
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#52525b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={(props) => <CustomTooltip {...props} hoveredCategory={hoveredCategory} />}
            wrapperStyle={{ zIndex: 50 }}
          />
          {categories.map((cat, i) => {
            const color = CATEGORY_COLORS[cat] ?? '#71717a';
            const isHovered = hoveredCategory === cat;
            const isDimmed = hoveredCategory && !isHovered;
            return (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeOpacity={isDimmed ? 0.12 : 1}
                fill={`url(#ct-grad-${i})`}
                fillOpacity={isDimmed ? 0 : 1}
                dot={false}
                activeDot={isDimmed ? false : { r: 4, fill: color, strokeWidth: 0 }}
                onMouseEnter={() => setHoveredCategory(cat)}
                onMouseLeave={() => setHoveredCategory(null)}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>

      <CustomLegend
        categories={categories}
        hoveredCategory={hoveredCategory}
        onHover={setHoveredCategory}
        onCategoryClick={onCategoryClick}
      />
    </motion.div>
  );
}
