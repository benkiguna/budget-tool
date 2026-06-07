import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import SummaryCard from './SummaryCard.jsx';
import SpendDonut from './SpendDonut.jsx';
import TrendChart from './TrendChart.jsx';
import SpendPace from './SpendPace.jsx';
import InsightTabs from './InsightTabs.jsx';
import ReviewQueue from './ReviewQueue.jsx';
import TopMerchants from './TopMerchants.jsx';
import RecurringCharges from './RecurringCharges.jsx';
import PeriodNavigator from './PeriodNavigator.jsx';
import BudgetProgress from './BudgetProgress.jsx';
import { formatCurrency } from '../lib/utils.js';
import { TRANSFER_CATEGORIES } from '../lib/categorizer.js';
import { unmatchedTransferCount } from '../lib/transferPairing.js';

function calcTotals(txs) {
  let spend = 0, income = 0, refunds = 0;
  // savingsOut: checking → savings outflows (negative Savings txs)
  // checkingIn: savings → checking inflows (positive Checking txs) — money taken back out of savings
  // ccPayments: credit card payment debits
  let savingsOut = 0, checkingIn = 0, ccPayments = 0, investedOut = 0, investedIn = 0;

  for (const tx of txs) {
    const abs = Math.abs(tx.amount);
    if (tx.amount < 0) {
      if (tx.category === 'Savings')                  savingsOut += abs;
      else if (tx.category === 'Checking')            savingsOut += abs;
      else if (tx.category === 'Investment')          investedOut += abs;
      else if (tx.category === 'Credit Card Payment') ccPayments += abs;
      else                                            spend += abs;
    } else {
      if (tx.category === 'Income')                   income += tx.amount;
      else if (tx.category === 'Checking')            checkingIn += tx.amount;
      else if (tx.category === 'Investment')          investedIn += tx.amount; // withdrawals / returns from investments
      else                                            refunds += tx.amount;
    }
  }

  const netSaved = Math.max(0, savingsOut - checkingIn);
  const netInvested = investedOut - investedIn; // positive = money still in market; negative = took profit
  return {
    spend: Math.max(0, spend - refunds),
    income,
    transfers: ccPayments + savingsOut + checkingIn + investedOut + investedIn,
    netSaved,
    ccPayments,
    investedOut,
    investedIn,
    netInvested,
  };
}

function trend(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const fmt = (v) => formatCurrency(v);

export default function Dashboard({
  transactions, overrides, settings, selectedMonth,
  onOverride, onMonthChange, onIdentifyMerchant, onAddCategory, onCategoryClick, onCreateRule,
}) {
  const salary = settings.salary || 0;
  const [insightTab, setInsightTab] = useState('Overview');

  const anomalyCount = useMemo(() => {
    const WINDOW = 5;
    const spend = transactions.filter((tx) => tx.amount < 0);
    const groups = {};
    for (const tx of spend) {
      const k = `${tx.merchant}||${Math.round(Math.abs(tx.amount) * 100)}`;
      (groups[k] = groups[k] || []).push(tx);
    }
    let n = 0;
    for (const g of Object.values(groups)) {
      if (g.length < 2) continue;
      const s = [...g].sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 0; i < s.length; i++) {
        for (let j = i + 1; j < s.length; j++) {
          if (Math.abs(new Date(s[i].date) - new Date(s[j].date)) / 86400000 <= WINDOW) { n++; break; }
        }
        break;
      }
    }
    return n + unmatchedTransferCount(transactions);
  }, [transactions]);

  const months = [...new Set(
    transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean)
  )].sort().reverse();

  // selectedMonth can be YYYY-MM (month), YYYY (year), or '' (all)
  const isYearMode = selectedMonth?.length === 4;

  const filtered = selectedMonth
    ? transactions.filter((tx) => tx.date?.startsWith(selectedMonth))
    : transactions;

  const reviewCount = useMemo(() => {
    const seen = new Set();
    return transactions.filter((tx) => {
      if (tx.categorySource === 'user') return false;
      const needsReview = tx.categorySource === 'uncategorized' || (tx.confidence != null && tx.confidence < 0.65);
      if (!needsReview || seen.has(tx.merchantRaw)) return false;
      seen.add(tx.merchantRaw);
      return true;
    }).length;
  }, [transactions]);

  const { spend, income, transfers, netSaved, ccPayments, investedOut, investedIn, netInvested } = calcTotals(filtered);
  const salaryIncome = salary > 0 ? salary : income;
  const surplus = salaryIncome - spend;
  // Use actual savings transfers if detected, otherwise fall back to implied surplus
  const savingsAmount = netSaved > 0 ? netSaved : Math.max(0, surplus);
  const savingsRate = salaryIncome > 0 ? (savingsAmount / salaryIncome) * 100 : 0;

  const prevMonth = isYearMode
    ? String(parseInt(selectedMonth, 10) - 1)
    : selectedMonth
    ? months[months.indexOf(selectedMonth) + 1]
    : months[1];
  const prevFiltered = prevMonth
    ? transactions.filter((tx) => tx.date?.startsWith(prevMonth))
    : [];
  const prev = calcTotals(prevFiltered);

  const spendTrend = trend(spend, prev.spend);

  return (
    <div className="space-y-5">

      {/* Review queue — uncategorized + low-confidence merchants */}
      {reviewCount > 0 && (
        <ReviewQueue
          transactions={transactions}
          settings={settings}
          onOverride={onOverride}
          onIdentifyMerchant={onIdentifyMerchant}
          onAddCategory={onAddCategory}
          onCreateRule={onCreateRule}
        />
      )}

      {/* Zone 1 — Period navigator + summary cards */}
      <div className="space-y-4">
        <PeriodNavigator
          transactions={transactions}
          selectedMonth={selectedMonth}
          onMonthChange={onMonthChange}
        />

        {/* Summary cards — 3-card hierarchy */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <SummaryCard
            label="Total Spend"
            value={spend}
            format={fmt}
            trend={spendTrend}
            color="#f43f5e"
            delay={0}
            sub={salary > 0 ? `of ${formatCurrency(salary)} salary` : 'excl. transfers'}
          />
          <SummaryCard
            label={surplus >= 0 ? 'Savings Rate' : 'Deficit'}
            value={salaryIncome > 0 ? savingsRate : Math.abs(surplus)}
            format={salaryIncome > 0 ? (v) => `${v.toFixed(1)}%` : fmt}
            color={surplus >= 0 ? '#10b981' : '#f43f5e'}
            delay={0.06}
            sub={salaryIncome > 0
              ? `${formatCurrency(savingsAmount)} ${netSaved > 0 ? 'to savings' : surplus >= 0 ? 'surplus' : 'over budget'}`
              : undefined}
          />
          <SummaryCard
            label="Transfers"
            value={transfers}
            format={fmt}
            color="#71717a"
            delay={0.12}
            sub={ccPayments > 0
              ? `${formatCurrency(ccPayments)} card pmts`
              : 'excl. from spend'}
          />
        </div>
      </div>

      {/* Investment strip — shown when investment transactions exist */}
      {investedOut > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="flex flex-wrap items-center gap-4 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800/40 rounded-xl px-4 py-3"
        >
          <div className="flex items-center gap-2 shrink-0">
            <svg className="w-4 h-4 text-cyan-600 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              <polyline points="16 7 22 7 22 13"/>
            </svg>
            <span className="text-cyan-700 dark:text-cyan-400 text-sm font-semibold">Investments</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <div>
              <p className="text-xs text-cyan-600/70 dark:text-cyan-500/70 mb-0.5">Deposited</p>
              <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 tabular-nums">{formatCurrency(investedOut)}</p>
            </div>
            {investedIn > 0 && (
              <div>
                <p className="text-xs text-cyan-600/70 dark:text-cyan-500/70 mb-0.5">Withdrawn</p>
                <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 tabular-nums">{formatCurrency(investedIn)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-cyan-600/70 dark:text-cyan-500/70 mb-0.5">Net invested</p>
              <p className={`text-sm font-semibold tabular-nums ${netInvested >= 0 ? 'text-cyan-700 dark:text-cyan-300' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {netInvested >= 0 ? formatCurrency(netInvested) : `+${formatCurrency(Math.abs(netInvested))} returned`}
              </p>
            </div>
            {income > 0 && (
              <div>
                <p className="text-xs text-cyan-600/70 dark:text-cyan-500/70 mb-0.5">Investment rate</p>
                <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 tabular-nums">
                  {((investedOut / income) * 100).toFixed(1)}%
                  <span className="text-xs font-normal ml-1 opacity-60">of income</span>
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Budget progress — shown when any budgets are configured */}
      {Object.keys(settings.categoryBudgets ?? {}).length > 0 && (
        <BudgetProgress
          transactions={filtered}
          settings={settings}
          selectedMonth={selectedMonth}
        />
      )}

      {/* Zone 2 — Main charts */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-5 gap-5"
      >
        <div className="lg:col-span-2 flex flex-col gap-5">
          <SpendDonut transactions={filtered} onCategoryClick={onCategoryClick} />
          <SpendPace transactions={transactions} settings={settings} selectedMonth={selectedMonth} />
        </div>
        <div className="lg:col-span-3 flex flex-col gap-5">
          <TrendChart transactions={transactions} salary={salary} selectedMonth={selectedMonth} />
        </div>
      </motion.div>

      {/* Zone 3 — Top Merchants + Recurring Charges */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        <TopMerchants transactions={filtered} />
        <RecurringCharges transactions={transactions} />
      </motion.div>

      {/* Anomaly strip — only shown when issues are detected */}
      {anomalyCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.35 }}
          className="flex items-center justify-between gap-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-xl px-4 py-3"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <p className="text-rose-700 dark:text-rose-400 text-sm font-medium">
              {anomalyCount} potential {anomalyCount === 1 ? 'issue' : 'issues'} detected
              <span className="text-rose-500 dark:text-rose-500 font-normal"> — duplicate charges or unmatched transfers</span>
            </p>
          </div>
          <button
            onClick={() => setInsightTab('Anomalies')}
            className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 shrink-0 transition-colors"
          >
            Review →
          </button>
        </motion.div>
      )}

      {/* Zone 4 — Tabbed insight panel */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <InsightTabs
          transactions={transactions}
          filtered={filtered}
          selectedMonth={selectedMonth}
          settings={settings}
          onCategoryClick={onCategoryClick}
          activeTab={insightTab}
          onTabChange={setInsightTab}
        />
      </motion.div>

    </div>
  );
}
