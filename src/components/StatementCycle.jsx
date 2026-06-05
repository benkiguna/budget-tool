import { motion } from 'framer-motion';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';

const BANK_META = {
  chase:      { label: 'Chase',       color: '#4f46e5' },
  capitalOne: { label: 'Capital One', color: '#0ea5e9' },
  discover:   { label: 'Discover',    color: '#f97316' },
};

// Compute days until next statement close and payment due
function cycleInfo(statementDay) {
  if (!statementDay) return null;
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  // Next statement close date
  let closeDate = new Date(year, month, statementDay);
  if (closeDate <= today) {
    // Already closed this month — next one is next month
    closeDate = new Date(year, month + 1, statementDay);
  }
  const daysToClose = Math.round((closeDate - today) / (1000 * 60 * 60 * 24));

  // Payment due 21 days after statement close
  const dueDate = new Date(closeDate);
  dueDate.setDate(dueDate.getDate() + 21);
  const daysToDue = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

  return {
    daysToClose,
    daysToDue,
    closeDate: closeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    dueDate: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

// Minimum payment: greater of $25 or 2% of balance (common card policy)
function minPayment(outstanding) {
  if (outstanding <= 0) return 0;
  return Math.max(25, outstanding * 0.02);
}

export default function StatementCycle({ transactions, cards = {} }) {
  // Get current month outstanding per bank
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const bankData = {};
  for (const tx of transactions) {
    const b = tx.sourceBank;
    if (!bankData[b]) bankData[b] = { spend: 0, payments: 0 };
    if (tx.amount < 0 && !TRANSFER_CATEGORIES.has(tx.category)) {
      if (tx.date?.startsWith(currentMonth)) bankData[b].spend += Math.abs(tx.amount);
    }
    if (tx.amount > 0 && tx.category === 'Credit Card Payment') {
      if (tx.date?.startsWith(currentMonth)) bankData[b].payments += tx.amount;
    }
  }

  const entries = Object.keys(bankData)
    .map((bank) => {
      const cardSettings = cards[bank] || {};
      const cycle = cycleInfo(cardSettings.statementDay);
      const outstanding = Math.max(0, bankData[bank].spend - bankData[bank].payments);
      const min = minPayment(outstanding);
      return { bank, cycle, outstanding, min, statementDay: cardSettings.statementDay };
    })
    .filter((e) => e.cycle); // only show cards with statement day configured

  if (entries.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
    >
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-1">Statement Cycles</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4">Current month · due dates &amp; minimum payments</p>

      <div className="space-y-4">
        {entries.map(({ bank, cycle, outstanding, min }, i) => {
          const meta = BANK_META[bank] ?? { label: bank, color: '#71717a' };
          const urgentClose = cycle.daysToClose <= 5;
          const urgentDue = cycle.daysToDue <= 7;

          return (
            <motion.div
              key={bank}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + i * 0.06 }}
              className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                <span className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm">{meta.label}</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                {/* Statement close */}
                <div className={`rounded-lg p-2 ${urgentClose ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/40' : 'bg-zinc-100/50 dark:bg-zinc-800/50'}`}>
                  <p className={`text-xs font-bold tabular-nums ${urgentClose ? 'text-amber-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                    {cycle.daysToClose}d
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">to close</p>
                  <p className={`text-xs mt-0.5 ${urgentClose ? 'text-amber-500' : 'text-zinc-500'}`}>{cycle.closeDate}</p>
                </div>

                {/* Payment due */}
                <div className={`rounded-lg p-2 ${urgentDue ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/40' : 'bg-zinc-100/50 dark:bg-zinc-800/50'}`}>
                  <p className={`text-xs font-bold tabular-nums ${urgentDue ? 'text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                    {cycle.daysToDue}d
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">due</p>
                  <p className={`text-xs mt-0.5 ${urgentDue ? 'text-rose-500' : 'text-zinc-500'}`}>{cycle.dueDate}</p>
                </div>

                {/* Min payment */}
                <div className="bg-zinc-100/50 dark:bg-zinc-800/50 rounded-lg p-2">
                  <p className="text-zinc-900 dark:text-zinc-100 text-xs font-bold tabular-nums">{formatCurrency(min)}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">min pay</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{formatCurrency(outstanding)} bal</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="text-zinc-400 dark:text-zinc-700 text-xs mt-3">* Min payment = max($25, 2% of balance). Due date = close date + 21 days.</p>
    </motion.div>
  );
}
