import { useState, useEffect } from 'react';
import { storage } from '../lib/storage.js';
import { formatCurrency, fmtDate, fmtDatetime } from '../lib/utils.js';

const BANK_LABELS = {
  chase: 'Chase', chaseChecking: 'Chase Checking',
  capitalOne: 'Capital One', discover: 'Discover',
  bankOfAmerica: 'Bank of America', wellsFargo: 'Wells Fargo', amex: 'Amex',
};

const fmtDateShort = fmtDate;

function BalanceBadge({ row }) {
  // No balance data for this bank
  if (row.balance_opening == null || row.balance_closing == null) {
    return <span className="text-zinc-500 dark:text-zinc-600 text-xs">—</span>;
  }

  const match = row.balance_match;
  const discrepancy = row.balance_discrepancy;

  if (match === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Verified
      </span>
    );
  }

  if (match === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium" title={`Computed: ${formatCurrency(row.balance_computed)} · Reported: ${formatCurrency(row.balance_closing)} · Diff: ${formatCurrency(Math.abs(discrepancy))}`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        {formatCurrency(Math.abs(discrepancy))} off
      </span>
    );
  }

  return <span className="text-zinc-500 dark:text-zinc-600 text-xs">Pending</span>;
}

export default function ImportAuditLog({ onTransactionsChanged }) {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  function load() {
    storage.getImports()
      .then(setImports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    if (!window.confirm('Delete this import and all its transactions?')) return;
    setDeleting(id);
    try {
      await storage.deleteImport(id);
      setImports((prev) => prev.filter((r) => r.id !== id));
      onTransactionsChanged?.();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <p className="text-zinc-500 dark:text-zinc-600 text-sm animate-pulse">Loading import history…</p>;
  }

  if (imports.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-zinc-500 dark:text-zinc-600 text-sm">No imports yet.</p>
        <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-1">Each CSV you import will appear here with its verification status.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">{imports.length}</p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Files imported</p>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">
            {imports.reduce((s, r) => s + (r.rows_added ?? 0), 0).toLocaleString()}
          </p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Transactions added</p>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">
            {imports.filter((r) => r.balance_match === 1).length}
            <span className="text-zinc-500 dark:text-zinc-600 font-normal text-xs">/{imports.filter((r) => r.balance_opening != null).length}</span>
          </p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Balances verified</p>
        </div>
      </div>

      {/* Import rows */}
      {imports.map((row) => (
        <div
          key={row.id}
          className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Bank + filename */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-zinc-800 dark:text-zinc-200 text-sm font-medium">
                  {BANK_LABELS[row.bank] ?? row.bank}
                </span>
                <span className="text-zinc-500 dark:text-zinc-600 text-xs truncate">{row.filename}</span>
              </div>

              {/* Date range */}
              <p className="text-zinc-500 dark:text-zinc-600 text-xs mb-2">
                {row.date_from ? `${fmtDateShort(row.date_from)} → ${fmtDateShort(row.date_to)}` : 'Date range unknown'}
                <span className="mx-1.5 opacity-40">·</span>
                {fmtDatetime(row.imported_at)}
              </p>

              {/* Counts + balance */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-emerald-400 font-medium">+{row.rows_added} added</span>
                {row.rows_skipped > 0 && (
                  <span className="text-xs text-zinc-500">{row.rows_skipped} skipped</span>
                )}
                <span className="text-xs text-zinc-500">{row.rows_parsed} parsed</span>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <BalanceBadge row={row} />
                {row.balance_match === 0 && (
                  <span className="text-xs text-zinc-500">
                    computed {formatCurrency(row.balance_computed)} vs reported {formatCurrency(row.balance_closing)}
                  </span>
                )}
              </div>
            </div>

            {/* Delete button */}
            <button
              onClick={() => handleDelete(row.id)}
              disabled={deleting === row.id}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-40"
              title="Delete this import and its transactions"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
