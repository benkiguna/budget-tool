import { motion } from 'framer-motion';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const BANK_META = {
  chase:      { label: 'Chase',       color: '#818cf8', bg: 'from-indigo-100/70 dark:from-indigo-950/70 to-white dark:to-zinc-900' },
  capitalOne: { label: 'Capital One', color: '#38bdf8', bg: 'from-sky-100/70 dark:from-sky-950/70 to-white dark:to-zinc-900' },
  discover:   { label: 'Discover',    color: '#fb923c', bg: 'from-orange-100/70 dark:from-orange-950/70 to-white dark:to-zinc-900' },
};

function cycleInfo(statementDay) {
  if (!statementDay) return null;
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  let closeDate = new Date(year, month, statementDay);
  if (closeDate <= today) closeDate = new Date(year, month + 1, statementDay);

  const daysToClose = Math.round((closeDate - today) / 86400000);
  const dueDate = new Date(closeDate);
  dueDate.setDate(dueDate.getDate() + 21);
  const daysToDue = Math.round((dueDate - today) / 86400000);

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { daysToClose, daysToDue, closeLabel: fmt(closeDate), dueLabel: fmt(dueDate) };
}

// Thin SVG arc — shows utilization as a sweep around a circle
function ArcGauge({ pct, color, size = 40 }) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const fill = circumference * Math.min((pct ?? 0) / 100, 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={4} />
      {pct > 0 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
    </svg>
  );
}

export default function CardSummary({ transactions, cards = {} }) {
  const banks = {};
  for (const tx of transactions) {
    const b = tx.sourceBank;
    if (!b) continue;
    if (!banks[b]) banks[b] = { spend: 0, txCount: 0 };
    if (tx.amount < 0 && !TRANSFER_CATEGORIES.has(tx.category)) {
      banks[b].txCount++;
      banks[b].spend += Math.abs(tx.amount);
    }
  }

  const entries = Object.entries(banks)
    .map(([bank, d]) => {
      const cfg = cards[bank] || {};
      const cycle = cycleInfo(cfg.statementDay);
      const limit = cfg.limit || 0;
      const utilPct = limit > 0 ? Math.min((d.spend / limit) * 100, 100) : null;
      const utilColor =
        utilPct == null ? '#71717a'
        : utilPct > 70 ? '#f87171'
        : utilPct > 40 ? '#fbbf24'
        : '#34d399';
      return { bank, ...d, cycle, limit, utilPct, utilColor };
    })
    .filter((e) => BANK_META[e.bank])
    .sort((a, b) => b.spend - a.spend);

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {entries.map(({ bank, spend, txCount, cycle, limit, utilPct, utilColor }, i) => {
        const meta = BANK_META[bank];
        const urgentClose = cycle && cycle.daysToClose <= 5;
        const urgentDue = cycle && cycle.daysToDue <= 7;

        return (
          <motion.div
            key={bank}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }}
            className={`bg-gradient-to-br ${meta.bg} border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden`}
          >
            <div className="h-0.5 w-full" style={{ backgroundColor: meta.color, opacity: 0.6 }} />

            <div className="p-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                  <span className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-xs font-semibold">{meta.label}</span>
                </div>
                <span className="text-zinc-500 dark:text-zinc-600 text-xs">{txCount} txns</span>
              </div>

              {/* Spend + arc row */}
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <p className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tabular-nums leading-none">
                    {formatCurrency(spend)}
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">this month</p>
                </div>
                {utilPct !== null && (
                  <div className="relative shrink-0">
                    <ArcGauge pct={utilPct} color={utilColor} size={40} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold tabular-nums leading-none" style={{ color: utilColor, fontSize: 9 }}>
                        {utilPct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Utilization bar */}
              {utilPct !== null ? (
                <div className="mb-3">
                  <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${utilPct}%` }}
                      transition={{ duration: 1, delay: 0.3 + i * 0.08, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: utilColor }}
                    />
                  </div>
                  <p className="text-zinc-400 dark:text-zinc-700 text-xs mt-1">{formatCurrency(limit)} limit</p>
                </div>
              ) : (
                <p className="text-zinc-400 dark:text-zinc-700 text-xs mb-3">No limit set</p>
              )}

              {/* Dates */}
              {cycle && (
                <div className="grid grid-cols-2 gap-1.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/60">
                  <div className={`rounded-lg px-2 py-1.5 ${urgentClose ? 'bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/40' : 'bg-zinc-100/40 dark:bg-zinc-800/40'}`}>
                    <p className={`text-sm font-bold tabular-nums leading-none ${urgentClose ? 'text-amber-300' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {cycle.closeLabel}
                    </p>
                    <p className={`text-xs mt-0.5 ${urgentClose ? 'text-amber-500' : 'text-zinc-500 dark:text-zinc-600'}`}>
                      closes · {cycle.daysToClose}d
                    </p>
                  </div>
                  <div className={`rounded-lg px-2 py-1.5 ${urgentDue ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700/40' : 'bg-zinc-100/40 dark:bg-zinc-800/40'}`}>
                    <p className={`text-sm font-bold tabular-nums leading-none ${urgentDue ? 'text-rose-300' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {cycle.dueLabel}
                    </p>
                    <p className={`text-xs mt-0.5 ${urgentDue ? 'text-rose-500' : 'text-zinc-500 dark:text-zinc-600'}`}>
                      due · {cycle.daysToDue}d
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
