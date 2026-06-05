import { motion } from 'framer-motion';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { formatCurrency } from '../lib/utils.js';
import MerchantLogo from './MerchantLogo.jsx';

function medianOf(sorted) {
  const n = sorted.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Median Absolute Deviation — robust to single outlier months (e.g. annual fee month)
function madRelative(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const med = medianOf(sorted);
  if (med === 0) return Infinity;
  const absDevs = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  return medianOf(absDevs) / med;
}

// Detect merchants that appear in 2+ different months with consistent amounts
function detectRecurring(transactions) {
  // Group spend transactions by merchant
  const byMerchant = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (TRANSFER_CATEGORIES.has(tx.category)) continue;
    const key = tx.merchant;
    if (!byMerchant[key]) byMerchant[key] = { category: tx.category, domain: tx.domain ?? null, logo: tx.logo ?? null, entries: [] };
    byMerchant[key].entries.push({ month: tx.date?.slice(0, 7), amount: Math.abs(tx.amount) });
  }

  const recurring = [];

  for (const [merchant, { category, domain, logo, entries }] of Object.entries(byMerchant)) {
    // Group by month, sum per month
    const byMonth = {};
    for (const e of entries) {
      if (!e.month) continue;
      byMonth[e.month] = (byMonth[e.month] || 0) + e.amount;
    }

    const months = Object.keys(byMonth).sort();
    if (months.length < 2) continue;

    const amounts = months.map((m) => byMonth[m]);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;

    // Use MAD (robust to single outlier months like annual fee months)
    // Allow up to 40% relative MAD — tolerates occasional fee bumps
    const relativeMAD = madRelative(amounts);
    if (relativeMAD > 0.4) continue;

    // Check rough monthly cadence: consecutive months or every-other-month
    const sortedMonths = months.map((m) => {
      const [y, mo] = m.split('-').map(Number);
      return y * 12 + mo;
    });
    const gaps = [];
    for (let i = 1; i < sortedMonths.length; i++) {
      gaps.push(sortedMonths[i] - sortedMonths[i - 1]);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap > 3) continue; // skip if avg gap > 3 months

    recurring.push({
      merchant,
      category,
      domain,
      logo,
      monthlyAvg: avg,
      streak: months.length,
      lastMonth: months[months.length - 1],
      annualCost: avg * 12,
    });
  }

  return recurring.sort((a, b) => b.monthlyAvg - a.monthlyAvg);
}

export default function RecurringCharges({ transactions }) {
  const recurring = detectRecurring(transactions);

  if (recurring.length === 0) return null;

  const totalMonthly = recurring.reduce((s, r) => s + r.monthlyAvg, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col h-[400px]"
    >
      <div className="flex items-start justify-between mb-1 shrink-0">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Recurring Charges</h2>
        <div className="text-right">
          <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums text-sm">{formatCurrency(totalMonthly)}<span className="text-zinc-500 dark:text-zinc-600 font-normal">/mo</span></p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs">{formatCurrency(totalMonthly * 12)}/yr</p>
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-4 shrink-0">{recurring.length} detected · consistent across months</p>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700">
        {recurring.map(({ merchant, category, domain, logo, monthlyAvg, streak, annualCost }, i) => {
          const color = CATEGORY_COLORS[category] ?? '#71717a';
          return (
            <motion.div
              key={merchant}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.04 }}
              className="flex items-center justify-between py-2 border-b border-zinc-200 dark:border-zinc-800 last:border-0"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <MerchantLogo domain={domain} logo={logo} name={merchant} size={22} />
                <div className="min-w-0">
                  <p className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{merchant}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">{category} · {streak} months</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-zinc-900 dark:text-zinc-100 text-sm font-semibold tabular-nums">
                  {formatCurrency(monthlyAvg)}<span className="text-zinc-500 dark:text-zinc-600 font-normal text-xs">/mo</span>
                </p>
                <p className="text-zinc-500 dark:text-zinc-600 text-xs tabular-nums">{formatCurrency(annualCost)}/yr</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
