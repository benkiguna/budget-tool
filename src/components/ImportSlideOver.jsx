import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import UploadZone from './UploadZone.jsx';
import { validateTransactions, fmtDate } from '../lib/importValidator.js';
import { formatCurrency } from '../lib/utils.js';

const BANK_LABELS = {
  chase: 'Chase', chaseChecking: 'Chase Checking',
  capitalOne: 'Capital One', discover: 'Discover',
  bankOfAmerica: 'Bank of America', wellsFargo: 'Wells Fargo', amex: 'Amex',
};

function ValidationBadge({ items, type }) {
  if (!items?.length) return null;
  const isError = type === 'error';
  return (
    <div className={`rounded-lg px-3 py-2 text-xs mt-2 ${
      isError
        ? 'bg-rose-100/60 dark:bg-rose-950/40 border border-rose-300/60 dark:border-rose-800/40 text-rose-700 dark:text-rose-400'
        : 'bg-amber-100/60 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-800/40 text-amber-700 dark:text-amber-400'
    }`}>
      {items.map((item, i) => (
        <div key={i}>
          <span className="font-medium">{isError ? '✕' : '⚠'} {item.label}: </span>
          <span className="opacity-90">{item.detail}</span>
          {item.examples?.length > 0 && (
            <div className="mt-1 opacity-70 font-mono text-xs truncate">
              {item.examples.slice(0, 2).join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ImportSlideOver({ open, onClose, onTransactions, transactions }) {
  const [pending, setPending] = useState(null);

  const existingIds = new Set(transactions.map((tx) => tx.id));

  function handleParsed(results) {
    const preview = results.map((r) => {
      const newTxs = r.transactions.filter((tx) => !existingIds.has(tx.id));
      const validation = validateTransactions(r.transactions);
      return {
        ...r,
        importId: crypto.randomUUID(),
        newCount: newTxs.length,
        dupCount: r.transactions.length - newTxs.length,
        validation,
      };
    });
    setPending(preview);
  }

  function handleConfirm() {
    if (!pending) return;
    onTransactions(pending);
    setPending(null);
    onClose();
  }

  function handleCancel() {
    setPending(null);
  }

  const totalNew = pending?.reduce((s, r) => s + r.newCount, 0) ?? 0;
  const hasBlockingErrors = false; // warnings are non-blocking; errors are informational

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div>
                <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Import Transactions</h2>
                <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Chase · Capital One · Discover · BofA · Wells Fargo · Amex</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {!pending ? (
                <>
                  <UploadZone onParsed={handleParsed} />
                  {transactions.length > 0 && (
                    <div className="mt-6 p-4 bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-xl">
                      <p className="text-zinc-400 text-sm font-medium">{transactions.length} transactions loaded</p>
                      <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-1">Drop more files to merge — duplicates are skipped automatically.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm mb-1">Review before importing</h3>
                    <p className="text-zinc-500 dark:text-zinc-600 text-xs">Validation complete. Confirm to add transactions to your data.</p>
                  </div>

                  <div className="space-y-3">
                    {pending.map((r, i) => {
                      const { summary, warnings, errors } = r.validation;
                      const hasBalance = r.balances?.supported;
                      return (
                        <div key={i} className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3">
                          {/* Bank + filename */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-zinc-800 dark:text-zinc-200 text-sm font-medium">{BANK_LABELS[r.bank] ?? r.bank}</span>
                            <span className="text-zinc-500 dark:text-zinc-600 text-xs truncate max-w-32" title={r.fileName}>{r.fileName}</span>
                          </div>

                          {/* Date range */}
                          {summary.dateRange && (
                            <p className="text-zinc-500 dark:text-zinc-500 text-xs mb-2">
                              {fmtDate(summary.dateRange.from)} → {fmtDate(summary.dateRange.to)}
                            </p>
                          )}

                          {/* Debit / credit summary */}
                          <div className="flex gap-3 text-xs mb-2">
                            <span className="text-zinc-500">
                              <span className="text-rose-400 font-medium">↓ {summary.debits.count}</span> debits {formatCurrency(summary.debits.total)}
                            </span>
                            {summary.credits.count > 0 && (
                              <span className="text-zinc-500">
                                <span className="text-emerald-400 font-medium">↑ {summary.credits.count}</span> credits {formatCurrency(summary.credits.total)}
                              </span>
                            )}
                          </div>

                          {/* New / dup counts */}
                          <div className="flex gap-3 text-xs mb-1">
                            <span className="text-emerald-400 font-medium">+{r.newCount} new</span>
                            {r.dupCount > 0 && <span className="text-zinc-500">{r.dupCount} duplicate{r.dupCount !== 1 ? 's' : ''} skipped</span>}
                            <span className="text-zinc-500">{r.transactions.length} parsed</span>
                          </div>

                          {/* Balance reconciliation note */}
                          {hasBalance && (
                            <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-1.5">
                              Balance: {formatCurrency(r.balances.opening)} → {formatCurrency(r.balances.closing)} · verified on import
                            </p>
                          )}

                          {/* Validation warnings/errors */}
                          <ValidationBadge items={warnings} type="warning" />
                          <ValidationBadge items={errors} type="error" />
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleConfirm}
                      disabled={totalNew === 0 || hasBlockingErrors}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                    >
                      {totalNew === 0 ? 'Nothing new to import' : `Import ${totalNew} transaction${totalNew !== 1 ? 's' : ''}`}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-xl px-4 py-2.5 text-sm transition-colors"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
