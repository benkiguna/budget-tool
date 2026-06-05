import { useState } from 'react';
import { pairTransfers } from '../lib/transferPairing.js';
import { formatCurrency, fmtDate } from '../lib/utils.js';

const BANK_LABELS = {
  chase: 'Chase',
  chaseChecking: 'Chase Checking',
  capitalOne: 'Capital One',
  discover: 'Discover',
  bankOfAmerica: 'BofA',
  wellsFargo: 'Wells Fargo',
  amex: 'Amex',
};

function bankLabel(tx) {
  return BANK_LABELS[tx.sourceBank] ?? tx.sourceBank ?? 'Unknown';
}


export default function TransferPairing({ transactions }) {
  const [showPaired, setShowPaired] = useState(false);
  const { paired, unmatchedDebits, unmatchedCredits, totalAmount } = pairTransfers(transactions);

  const totalPayments = paired.length + unmatchedDebits.length;

  // Nothing to show if there are no credit card payment transactions at all
  if (totalPayments === 0 && unmatchedCredits.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm mb-1">Transfer Pairing</h3>
        <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-3 leading-relaxed">
          No credit card payments found. Import a checking account alongside your credit cards to enable transfer reconciliation.
        </p>
      </div>
    );
  }

  const matchRate = totalPayments > 0 ? Math.round((paired.length / totalPayments) * 100) : 0;
  const allMatched = unmatchedDebits.length === 0 && unmatchedCredits.length === 0;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 lg:col-span-3">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm">Transfer Pairing</h3>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">
            Matching credit card payments between checking and card accounts
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${
          allMatched
            ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800/40'
            : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/40'
        }`}>
          {paired.length}/{totalPayments} matched
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums text-sm">{paired.length}</p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Paired</p>
        </div>
        <div className={`border rounded-xl p-3 text-center ${
          unmatchedDebits.length > 0
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
            : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800'
        }`}>
          <p className={`font-bold tabular-nums text-sm ${unmatchedDebits.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
            {unmatchedDebits.length}
          </p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Unmatched debits</p>
        </div>
        <div className={`border rounded-xl p-3 text-center ${
          unmatchedCredits.length > 0
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
            : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800'
        }`}>
          <p className={`font-bold tabular-nums text-sm ${unmatchedCredits.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
            {unmatchedCredits.length}
          </p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Unmatched credits</p>
        </div>
      </div>

      {/* Unmatched debits — most actionable */}
      {unmatchedDebits.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
            ⚠ Checking payments with no matching card import
          </p>
          <div className="space-y-1.5">
            {unmatchedDebits.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-zinc-800 dark:text-zinc-200 text-xs font-medium truncate">{tx.merchant}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">{bankLabel(tx)} · {fmtDate(tx.date)}</p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-rose-500 dark:text-rose-400 text-xs font-semibold tabular-nums">{formatCurrency(Math.abs(tx.amount))}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">no card match</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched credits */}
      {unmatchedCredits.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
            ⚠ Card payments with no matching checking import
          </p>
          <div className="space-y-1.5">
            {unmatchedCredits.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-zinc-800 dark:text-zinc-200 text-xs font-medium truncate">{tx.merchant}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">{bankLabel(tx)} · {fmtDate(tx.date)}</p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-emerald-500 dark:text-emerald-400 text-xs font-semibold tabular-nums">+{formatCurrency(tx.amount)}</p>
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs">no checking match</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All matched state */}
      {allMatched && paired.length > 0 && (
        <div className="flex items-center gap-2 mb-3 text-xs text-emerald-600 dark:text-emerald-400">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          All {paired.length} payment{paired.length !== 1 ? 's' : ''} ({formatCurrency(totalAmount)}) matched between checking and card accounts
        </div>
      )}

      {/* Paired transfers — collapsible */}
      {paired.length > 0 && (
        <div>
          <button
            onClick={() => setShowPaired((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showPaired ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {showPaired ? 'Hide' : 'Show'} {paired.length} matched payment{paired.length !== 1 ? 's' : ''}
          </button>

          {showPaired && (
            <div className="mt-2 space-y-1.5">
              {paired.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2">
                  {/* Debit side */}
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-500 dark:text-zinc-600 text-xs truncate">{bankLabel(p.debit)}</p>
                    <p className="text-zinc-500 dark:text-zinc-600 text-xs">{fmtDate(p.debit.date)}</p>
                  </div>

                  {/* Amount + arrow */}
                  <div className="text-center shrink-0 px-2">
                    <p className="text-zinc-800 dark:text-zinc-200 text-xs font-semibold tabular-nums">{formatCurrency(Math.abs(p.debit.amount))}</p>
                    <p className="text-zinc-400 dark:text-zinc-600 text-xs">{p.daysDiff === 0 ? 'same day' : `${p.daysDiff}d`} →</p>
                  </div>

                  {/* Credit side */}
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-zinc-500 dark:text-zinc-600 text-xs truncate">{bankLabel(p.credit)}</p>
                    <p className="text-zinc-500 dark:text-zinc-600 text-xs">{fmtDate(p.credit.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
