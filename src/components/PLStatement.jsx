import { useMemo } from 'react';
import { formatCurrency } from '../lib/utils.js';
import { pillStyle, CategoryIcon } from './CategoryListPopover.jsx';

// Month labels for history table
function fmtMonth(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// Transactions that hit P&L (pnlImpact !== false, i.e. true or undefined = legacy)
function isPnL(tx) {
  return tx.pnlImpact !== 0 && tx.pnlImpact !== false;
}

function buildStatement(transactions, period) {
  const periodTxs = period
    ? transactions.filter((tx) => tx.date?.startsWith(period))
    : transactions;

  const income = {};
  const expenses = {};

  for (const tx of periodTxs) {
    if (!isPnL(tx)) continue;
    if (tx.amount > 0) {
      income[tx.category] = (income[tx.category] ?? 0) + tx.amount;
    } else {
      expenses[tx.category] = (expenses[tx.category] ?? 0) + Math.abs(tx.amount);
    }
  }

  const totalIncome = Object.values(income).reduce((s, v) => s + v, 0);
  const totalExpenses = Object.values(expenses).reduce((s, v) => s + v, 0);

  return {
    income: Object.entries(income).sort((a, b) => b[1] - a[1]),
    expenses: Object.entries(expenses).sort((a, b) => b[1] - a[1]),
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
  };
}

function buildHistory(transactions) {
  // Get last 6 months present in data
  const months = [...new Set(
    transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean)
  )].sort().slice(-6);

  return months.map((m) => {
    const { totalIncome, totalExpenses, net } = buildStatement(transactions, m);
    return { month: m, income: totalIncome, expenses: totalExpenses, net };
  });
}

function CategoryRow({ category, amount, total }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  const ps = pillStyle(category);
  return (
    <tr className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
      <td className="py-2 pr-3 pl-1">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
          style={ps}
        >
          <CategoryIcon category={category} className="w-3 h-3 shrink-0" />
          {category}
        </span>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-sm text-zinc-900 dark:text-zinc-100 font-medium">
        {formatCurrency(amount)}
      </td>
      <td className="py-2 w-28 hidden sm:table-cell">
        <div className="h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-400/70 transition-all"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </td>
      <td className="py-2 pl-2 text-right text-xs text-zinc-400 tabular-nums hidden sm:table-cell">
        {pct.toFixed(1)}%
      </td>
    </tr>
  );
}

export default function PLStatement({ transactions, selectedMonth }) {
  const statement = useMemo(
    () => buildStatement(transactions, selectedMonth),
    [transactions, selectedMonth]
  );

  const history = useMemo(() => buildHistory(transactions), [transactions]);

  const { income, expenses, totalIncome, totalExpenses, net } = statement;

  return (
    <div className="space-y-6">

      {/* Period totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3">
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mb-0.5">Income</p>
          <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {formatCurrency(totalIncome)}
          </p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-xl px-4 py-3">
          <p className="text-xs text-rose-600/70 dark:text-rose-500/70 mb-0.5">Expenses</p>
          <p className="text-lg font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
            {formatCurrency(totalExpenses)}
          </p>
        </div>
        <div className={`border rounded-xl px-4 py-3 ${
          net >= 0
            ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/40'
            : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700'
        }`}>
          <p className="text-xs text-zinc-500 mb-0.5">Net</p>
          <p className={`text-lg font-semibold tabular-nums ${
            net >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-500'
          }`}>
            {net >= 0 ? '+' : ''}{formatCurrency(net)}
          </p>
        </div>
      </div>

      {/* Income + Expenses breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Income */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Income</h3>
          {income.length === 0 ? (
            <p className="text-xs text-zinc-400 italic py-2">No income transactions for this period.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {income.map(([cat, amt]) => (
                  <CategoryRow key={cat} category={cat} amount={amt} total={totalIncome} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="pt-2 text-xs text-zinc-500 font-medium">Total</td>
                  <td className="pt-2 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatCurrency(totalIncome)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Expenses */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Expenses</h3>
          {expenses.length === 0 ? (
            <p className="text-xs text-zinc-400 italic py-2">No expenses for this period.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {expenses.map(([cat, amt]) => (
                  <CategoryRow key={cat} category={cat} amount={amt} total={totalExpenses} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="pt-2 text-xs text-zinc-500 font-medium">Total</td>
                  <td className="pt-2 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatCurrency(totalExpenses)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* 6-month history table */}
      {history.length > 1 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Monthly History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left text-xs text-zinc-500 font-medium pb-2 pr-4">Month</th>
                  <th className="text-right text-xs text-zinc-500 font-medium pb-2 pr-4">Income</th>
                  <th className="text-right text-xs text-zinc-500 font-medium pb-2 pr-4">Expenses</th>
                  <th className="text-right text-xs text-zinc-500 font-medium pb-2">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {history.map(({ month, income: inc, expenses: exp, net: n }) => (
                  <tr
                    key={month}
                    className={`transition-colors ${
                      selectedMonth === month
                        ? 'bg-indigo-50 dark:bg-indigo-950/20'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300 font-medium">{fmtMonth(month)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(inc)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-rose-600 dark:text-rose-400">
                      {formatCurrency(exp)}
                    </td>
                    <td className={`py-2 text-right tabular-nums font-medium ${
                      n >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'
                    }`}>
                      {n >= 0 ? '+' : ''}{formatCurrency(n)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
