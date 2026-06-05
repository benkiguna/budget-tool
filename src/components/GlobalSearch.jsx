import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCurrency, fmtDate } from '../lib/utils.js';

function normalize(s) {
  return String(s ?? '').toLowerCase();
}

function searchTransactions(transactions, query) {
  if (!query) return [];
  const q = normalize(query);
  return transactions
    .filter((tx) =>
      normalize(tx.merchant).includes(q) ||
      normalize(tx.merchantRaw).includes(q) ||
      normalize(tx.category).includes(q) ||
      normalize(tx.date).includes(q) ||
      normalize(Math.abs(tx.amount).toFixed(2)).includes(q) ||
      normalize(tx.sourceBank).includes(q)
    )
    .slice(0, 12);
}

function searchMerchants(transactions, query) {
  if (!query) return [];
  const q = normalize(query);
  const seen = new Set();
  const results = [];
  for (const tx of transactions) {
    if (seen.has(tx.merchant)) continue;
    if (normalize(tx.merchant).includes(q) || normalize(tx.merchantRaw).includes(q)) {
      seen.add(tx.merchant);
      results.push({ merchant: tx.merchant, category: tx.category, source: tx.categorySource });
    }
    if (results.length >= 5) break;
  }
  return results;
}

export default function GlobalSearch({ transactions, open, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const txResults = searchTransactions(transactions, query);
  const merchantResults = query ? searchMerchants(transactions, query) : [];
  const hasResults = txResults.length > 0 || merchantResults.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4"
          >
            <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
              {/* Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search transactions, merchants, categories…"
                  className="flex-1 bg-transparent text-zinc-900 dark:text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-zinc-500 dark:text-zinc-600 hover:text-zinc-400 text-xs shrink-0">
                    Clear
                  </button>
                )}
                <kbd className="text-zinc-400 dark:text-zinc-700 text-xs border border-zinc-200 dark:border-zinc-800 rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-96 overflow-y-auto">
                {!query && (
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs text-center py-8">
                    Type to search across all transactions
                  </p>
                )}

                {query && !hasResults && (
                  <p className="text-zinc-500 dark:text-zinc-600 text-xs text-center py-8">No results for "{query}"</p>
                )}

                {merchantResults.length > 0 && (
                  <div className="px-2 pt-2">
                    <p className="text-zinc-500 dark:text-zinc-600 text-xs uppercase tracking-wider px-2 mb-1">Merchants</p>
                    {merchantResults.map(({ merchant, category }) => (
                      <div key={merchant} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <span className="text-zinc-800 dark:text-zinc-200 text-sm">{merchant}</span>
                        <span className="text-zinc-500 text-xs">{category}</span>
                      </div>
                    ))}
                  </div>
                )}

                {txResults.length > 0 && (
                  <div className="px-2 pt-2 pb-2">
                    <p className="text-zinc-500 dark:text-zinc-600 text-xs uppercase tracking-wider px-2 mb-1">
                      Transactions {txResults.length === 12 && <span className="normal-case">(showing first 12)</span>}
                    </p>
                    {txResults.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors gap-3">
                        <div className="min-w-0">
                          <p className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{tx.merchant}</p>
                          <p className="text-zinc-500 dark:text-zinc-600 text-xs">{fmtDate(tx.date)} · {tx.category} · {tx.sourceBank}</p>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums shrink-0 ${tx.amount < 0 ? 'text-zinc-400 dark:text-zinc-700 dark:text-zinc-300' : 'text-emerald-400'}`}>
                          {tx.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
