import { useState } from 'react';
import CategorySelect from './CategorySelect.jsx';
import MerchantLogo from './MerchantLogo.jsx';

const SOURCE_LABELS = {
  user:    { label: 'Manual',  cls: 'text-indigo-400' },
  ai:      { label: 'AI',      cls: 'text-emerald-400' },
  trove:   { label: 'Trove',   cls: 'text-violet-400' },
  keyword: { label: 'Keyword', cls: 'text-amber-400' },
  bank:    { label: 'Bank',    cls: 'text-sky-400' },
};

export default function CategoryEditor({ overrides, onUpdate, onDelete, customCategories = [], onIdentify, geminiModel, onAddCategory }) {
  const [search, setSearch] = useState('');

  const entries = Object.entries(overrides)
    .filter(([merchant]) =>
      !search || merchant.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b[1].savedAt ?? 0) - (a[1].savedAt ?? 0));

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Merchant Category Rules</h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            Overrides applied per merchant to all transactions — past and future imports.
          </p>
        </div>
        <input
          className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm placeholder:text-zinc-500 w-56"
          placeholder="Search merchants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {entries.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">
          {search ? 'No merchants match your search.' : 'No overrides yet. Import a CSV or edit categories in the transaction list.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-700">
                <th className="text-left text-zinc-500 font-medium pb-3 pr-4">Merchant</th>
                <th className="text-left text-zinc-500 font-medium pb-3 pr-4">Category</th>
                <th className="text-left text-zinc-500 font-medium pb-3 pr-4">Source</th>
                <th className="pb-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {entries.map(([merchantRaw, entry]) => {
                const src = SOURCE_LABELS[entry.source] ?? { label: entry.source, cls: 'text-zinc-400' };
                const displayName = entry.displayName ?? null;
                return (
                  <tr key={merchantRaw} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50">
                    <td className="py-2.5 pr-4 max-w-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <MerchantLogo domain={entry.domain} logo={entry.logo} name={displayName ?? merchantRaw} size={18} />
                        <div className="min-w-0">
                          {displayName && (
                            <div className="text-zinc-900 dark:text-zinc-100 text-xs font-medium truncate">{displayName}</div>
                          )}
                          <div className={`font-mono text-xs truncate ${displayName ? 'text-zinc-500 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100'}`} title={merchantRaw}>
                            {merchantRaw}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <CategorySelect
                        merchantRaw={merchantRaw}
                        value={entry.category}
                        onChange={(cat, isNew) => { if (isNew && onAddCategory) onAddCategory(cat); onUpdate(merchantRaw, cat); }}
                        onIdentify={onIdentify}
                        geminiModel={geminiModel}
                        customCategories={customCategories}
                        selectClassName="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-zinc-900 dark:text-zinc-100 text-xs"
                      />
                    </td>
                    <td className={`py-2.5 pr-4 text-xs font-medium ${src.cls}`}>
                      {src.label}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        className="text-zinc-500 dark:text-zinc-600 hover:text-red-400 transition-colors text-xs"
                        onClick={() => onDelete(merchantRaw)}
                        title="Remove override"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
