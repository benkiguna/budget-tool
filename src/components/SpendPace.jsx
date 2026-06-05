import { motion } from 'framer-motion';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

export default function SpendPace({ transactions, settings, selectedMonth }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Hide for historical months — pace only makes sense for the current live month
  if (selectedMonth && selectedMonth !== currentMonthStr) return null;

  const day = today.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysLeft = daysInMonth - day;
  const monthFraction = day / daysInMonth;
  let spend = 0;
  for (const tx of transactions) {
    if (!tx.date?.startsWith(currentMonthStr)) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    if (tx.amount < 0) {
      spend += Math.abs(tx.amount);
    } else if (tx.category !== 'Income') {
      // Refund/cashback — reduce spend
      spend -= tx.amount;
    }
  }
  spend = Math.max(0, spend);

  const salary = settings?.salary || 0;
  const budget = salary > 0 ? salary : null;
  const projected = monthFraction > 0.05 ? spend / monthFraction : null;
  const dailyAvg = day > 0 ? spend / day : 0;
  const onTrack = budget ? budget * monthFraction : null;
  const delta = onTrack && onTrack > 0 ? ((spend - onTrack) / onTrack) * 100 : null;
  const isOver = delta !== null && delta > 5;
  const isUnder = delta !== null && delta < -5;

  const monthPct = (day / daysInMonth) * 100;
  const spendPct = budget ? Math.min((spend / budget) * 100, 100) : null;
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">{monthName} Pace</h2>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Day {day} of {daysInMonth} · {daysLeft}d left</p>
        </div>
        {delta !== null && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${
            isOver
              ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800/40'
              : isUnder
              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800/40'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-300 dark:border-zinc-700'
          }`}>
            {isOver ? '↑' : isUnder ? '↓' : '≈'} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Dual progress tracks */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-zinc-500 dark:text-zinc-600">Month elapsed</span>
            <span className="text-zinc-500 tabular-nums">{monthPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${monthPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full bg-zinc-600"
            />
          </div>
        </div>

        {spendPct !== null && (
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-500 dark:text-zinc-600">Budget used</span>
              <span className="font-semibold tabular-nums" style={{ color: isOver ? '#f43f5e' : '#10b981' }}>
                {spendPct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${spendPct}%` }}
                transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: isOver ? '#f43f5e' : '#10b981' }}
              />
            </div>
          </div>
        )}

        {budget && (
          <p className="text-zinc-400 dark:text-zinc-700 text-xs">
            On-pace spend: {formatCurrency(onTrack)} · budget {formatCurrency(budget)}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <div className="text-center">
          <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">{formatCurrency(spend)}</p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">so far</p>
        </div>
        <div className="text-center border-x border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">{formatCurrency(dailyAvg)}</p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">/ day</p>
        </div>
        <div className="text-center">
          <p className={`font-bold tabular-nums ${isOver ? 'text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
            {projected ? formatCurrency(projected) : '—'}
          </p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">projected</p>
        </div>
      </div>
    </motion.div>
  );
}
