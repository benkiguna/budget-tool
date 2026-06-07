import TransactionTable from './TransactionTable.jsx';
import PeriodNavigator from './PeriodNavigator.jsx';
import { exportTransactionsCSV } from '../lib/utils.js';

export default function TransactionsPage({
  transactions, overrides, settings, selectedMonth,
  onOverride, onMonthChange, onIdentifyMerchant, onAddCategory, onUpdateNote,
  onEnrichOne, onCategorizeMerchant,
}) {
  const filtered = selectedMonth
    ? transactions.filter((tx) => tx.date?.startsWith(selectedMonth))
    : transactions;

  const filename = selectedMonth
    ? `transactions-${selectedMonth}.csv`
    : 'transactions-all.csv';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <PeriodNavigator
          transactions={transactions}
          selectedMonth={selectedMonth}
          onMonthChange={onMonthChange}
        />
        <button
          onClick={() => exportTransactionsCSV(filtered, filename)}
          className="shrink-0 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors"
          title="Export visible transactions to CSV"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
      </div>

      <TransactionTable
        transactions={filtered}
        overrides={overrides}
        onOverride={onOverride}
        onUpdateNote={onUpdateNote}
        customCategories={settings.categories}
        onIdentify={onIdentifyMerchant}
        geminiModel={settings.geminiModel}
        onAddCategory={onAddCategory}
        onEnrichOne={onEnrichOne}
        onCategorizeMerchant={onCategorizeMerchant}
      />
    </div>
  );
}
