import TransactionTable from './TransactionTable.jsx';
import PeriodNavigator from './PeriodNavigator.jsx';

export default function TransactionsPage({
  transactions, overrides, settings, selectedMonth,
  onOverride, onMonthChange, onIdentifyMerchant, onAddCategory, onUpdateNote,
  onEnrichOne, onCategorizeMerchant,
}) {
  const filtered = selectedMonth
    ? transactions.filter((tx) => tx.date?.startsWith(selectedMonth))
    : transactions;

  return (
    <div className="space-y-4">
      <PeriodNavigator
        transactions={transactions}
        selectedMonth={selectedMonth}
        onMonthChange={onMonthChange}
      />

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
