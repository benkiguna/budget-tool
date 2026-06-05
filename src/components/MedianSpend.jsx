import { useState, useMemo } from 'react';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

function median(sorted) {
  const n = sorted.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeStats(transactions) {
  const monthCatMap = {};
  const catSet = new Set();

  for (const tx of transactions) {
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    if (tx.category === 'Income') continue;
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    const cat = tx.category || 'Other';
    if (!monthCatMap[cat]) monthCatMap[cat] = {};
    if (tx.amount < 0) {
      monthCatMap[cat][month] = (monthCatMap[cat][month] || 0) + Math.abs(tx.amount);
      catSet.add(cat);
    } else {
      monthCatMap[cat][month] = (monthCatMap[cat][month] || 0) - tx.amount;
    }
  }

  const stats = {};
  for (const cat of catSet) {
    const monthlies = Object.values(monthCatMap[cat]).filter((v) => v > 0).sort((a, b) => a - b);
    if (!monthlies.length) continue;
    const med = median(monthlies);
    // Suggested budget: 10% above median, rounded up to nearest $5
    const suggested = Math.ceil((med * 1.1) / 5) * 5;
    stats[cat] = {
      median: med,
      min: monthlies[0],
      max: monthlies[monthlies.length - 1],
      suggested,
      total: monthlies.reduce((s, v) => s + v, 0),
      months: monthlies.length,
    };
  }

  return stats;
}

const PREVIEW_COUNT = 6;

export default function MedianSpend({ transactions }) {
  const stats = useMemo(() => computeStats(transactions), [transactions]);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(
    () =>
      Object.entries(stats)
        .sort((a, b) => b[1].median - a[1].median)
        .map(([cat, s]) => ({ cat, ...s })),
    [stats],
  );

  if (!rows.length) return null;

  const visible = expanded ? rows : rows.slice(0, PREVIEW_COUNT);
  // Scale bars against the largest suggested budget so the "buffer" region is always visible
  const maxVal = Math.max(...rows.map((r) => r.suggested), 1);

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm">Budget Baseline</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-0.5">
          Typical monthly spend per category · suggested adds a 10% buffer
        </p>
      </div>

      <div className="space-y-4">
        {visible.map(({ cat, median: med, min, max, suggested }) => {
          const color  = CATEGORY_COLORS[cat] ?? '#94a3b8';
          const medPct = (med / maxVal) * 100;
          const sugPct = (suggested / maxVal) * 100;

          return (
            <div key={cat} className="space-y-1.5">

              {/* Header row: name left, typical + suggested right */}
              <div className="flex items-baseline justify-between gap-3 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{cat}</span>
                </div>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                    {formatCurrency(med)}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-600 text-xs">typical</span>
                  <span className="text-zinc-300 dark:text-zinc-700 text-xs">·</span>
                  <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 font-medium">
                    {formatCurrency(suggested)}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-600 text-xs">budget</span>
                </div>
              </div>

              {/* Full-width bar */}
              <div className="relative h-3.5 overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-800" />
                <div
                  className="absolute left-0 top-0 bottom-0 transition-all duration-500"
                  style={{ width: `${sugPct}%`, backgroundColor: `${color}22` }}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 transition-all duration-500"
                  style={{ width: `${medPct}%`, backgroundColor: `${color}55` }}
                />
                <div
                  className="absolute top-0.5 bottom-0.5 w-px transition-all duration-500"
                  style={{ left: `${sugPct}%`, backgroundColor: color, opacity: 0.55 }}
                />
              </div>

              {/* Range anchors below bar */}
              <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">
                <span>Low {formatCurrency(min)}</span>
                <span>High {formatCurrency(max)}</span>
              </div>

            </div>
          );
        })}
      </div>

      {rows.length > PREVIEW_COUNT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          {expanded ? 'Show less' : `Show ${rows.length - PREVIEW_COUNT} more categories`}
        </button>
      )}
    </div>
  );
}
