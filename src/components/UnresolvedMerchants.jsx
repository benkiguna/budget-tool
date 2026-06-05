import { useState } from 'react';
import { formatCurrency } from '../lib/utils.js';
import CategorySelect from './CategorySelect.jsx';

function groupMerchants(transactions) {
  const map = {};
  for (const tx of transactions) {
    if (tx.categorySource !== 'uncategorized') continue;
    if (!map[tx.merchantRaw]) {
      map[tx.merchantRaw] = { merchantRaw: tx.merchantRaw, merchant: tx.merchant, count: 0, total: 0 };
    }
    map[tx.merchantRaw].count++;
    map[tx.merchantRaw].total += tx.amount;
  }
  return Object.values(map).sort((a, b) => a.total - b.total);
}

export default function UnresolvedMerchants({ transactions, onOverride, onIdentify, geminiModel, customCategories = [], onAddCategory }) {
  const groups = groupMerchants(transactions);
  const [selected, setSelected] = useState({});
  const [saved, setSaved] = useState({});

  if (groups.length === 0) return null;

  const pending = groups.filter((g) => !saved[g.merchantRaw]);

  function handleSave(merchantRaw) {
    const category = selected[merchantRaw];
    if (!category) return;
    onOverride(merchantRaw, category);
    setSaved((s) => ({ ...s, [merchantRaw]: true }));
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-amber-900/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm">Unresolved Merchants</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {pending.length} merchant{pending.length !== 1 ? 's' : ''} need a category
            {!geminiModel && <span className="text-amber-500"> — select a Gemini model in Settings to use AI identify</span>}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((g) => {
          if (saved[g.merchantRaw]) return null;
          const chosenCategory = selected[g.merchantRaw] ?? '';

          return (
            <div key={g.merchantRaw} className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-zinc-900 dark:text-zinc-100 text-sm font-medium truncate">{g.merchant}</p>
                  <p className="text-zinc-500 text-xs truncate">{g.merchantRaw}</p>
                  <p className="text-zinc-400 text-xs mt-0.5">
                    {g.count} transaction{g.count !== 1 ? 's' : ''} · {formatCurrency(Math.abs(g.total))} spend
                  </p>
                </div>

                <div className="flex items-start gap-2 shrink-0 flex-wrap">
                  <CategorySelect
                    merchantRaw={g.merchantRaw}
                    value={chosenCategory}
                    onChange={(cat, isNew) => {
                      if (isNew && onAddCategory) onAddCategory(cat);
                      setSelected((s) => ({ ...s, [g.merchantRaw]: cat }));
                    }}
                    onIdentify={onIdentify}
                    geminiModel={geminiModel}
                    customCategories={customCategories}
                    selectClassName="bg-zinc-200 dark:bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
                  />

                  <button
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded px-3 py-1 transition-colors"
                    onClick={() => handleSave(g.merchantRaw)}
                    disabled={!chosenCategory}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
