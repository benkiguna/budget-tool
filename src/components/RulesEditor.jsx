import { useState } from 'react';
import { getCategories } from '../lib/categorizer.js';
import { pillStyle, CategoryIcon } from './CategoryListPopover.jsx';

const RULE_TYPES = [
  { value: 'MERCHANT_CONTAINS', label: 'Contains', hint: 'Matches if merchant name contains the text (case-insensitive)' },
  { value: 'MERCHANT_EXACT',    label: 'Exact',    hint: 'Matches only the exact merchant string' },
  { value: 'DESCRIPTION_REGEX', label: 'Regex',    hint: 'Matches using a regular expression' },
  { value: 'AMOUNT_RANGE',      label: 'Amount',   hint: 'Matches transactions in an amount range (absolute value)' },
];

const SOURCE_LABELS = {
  USER_MANUAL:             { label: 'Manual',   cls: 'text-indigo-400' },
  LEARNED_FROM_CORRECTION: { label: 'Learned',  cls: 'text-emerald-400' },
};

const EMPTY_FORM = { rule_type: 'MERCHANT_CONTAINS', match_value: '', amount_min: '', amount_max: '', category: '', priority: '100' };

export default function RulesEditor({ rules = [], onCreateRule, onDeleteRule, customCategories = [] }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const allCategories = getCategories(customCategories);

  function handleSubmit() {
    if (!form.category) { setError('Category is required.'); return; }
    const isAmountRange = form.rule_type === 'AMOUNT_RANGE';
    if (!isAmountRange && !form.match_value.trim()) { setError('Match value is required.'); return; }
    setError('');
    onCreateRule({
      rule_type: form.rule_type,
      match_value: isAmountRange ? null : form.match_value.trim(),
      amount_min: form.amount_min ? parseFloat(form.amount_min) : null,
      amount_max: form.amount_max ? parseFloat(form.amount_max) : null,
      category: form.category,
      priority: parseInt(form.priority, 10) || 100,
      created_from: 'USER_MANUAL',
    });
    setForm(EMPTY_FORM);
    setAdding(false);
  }

  const inputCls = 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:border-indigo-500 transition-colors';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm">Pattern Rules</h2>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">
            Run before keyword rules. Useful when merchants appear with varying IDs.
          </p>
        </div>
        <button
          onClick={() => { setAdding((v) => !v); setError(''); }}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
        >
          {adding ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Rule type */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Type</label>
              <select
                className={inputCls + ' w-full'}
                value={form.rule_type}
                onChange={(e) => setForm((f) => ({ ...f, rule_type: e.target.value, match_value: '', amount_min: '', amount_max: '' }))}
              >
                {RULE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-zinc-500 text-xs mt-1">{RULE_TYPES.find((t) => t.value === form.rule_type)?.hint}</p>
            </div>

            {/* Match value / amount range */}
            {form.rule_type !== 'AMOUNT_RANGE' ? (
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">
                  {form.rule_type === 'DESCRIPTION_REGEX' ? 'Regex Pattern' : 'Match Value'}
                </label>
                <input
                  className={inputCls + ' w-full'}
                  placeholder={form.rule_type === 'MERCHANT_CONTAINS' ? 'e.g. VENMO' : form.rule_type === 'DESCRIPTION_REGEX' ? 'e.g. ^ZELLE.*RENT' : 'Exact merchant string'}
                  value={form.match_value}
                  onChange={(e) => setForm((f) => ({ ...f, match_value: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Amount Range ($)</label>
                <div className="flex items-center gap-2">
                  <input
                    className={inputCls + ' w-full'}
                    type="number" min="0" placeholder="Min"
                    value={form.amount_min}
                    onChange={(e) => setForm((f) => ({ ...f, amount_min: e.target.value }))}
                  />
                  <span className="text-zinc-500 text-xs shrink-0">to</span>
                  <input
                    className={inputCls + ' w-full'}
                    type="number" min="0" placeholder="Max"
                    value={form.amount_max}
                    onChange={(e) => setForm((f) => ({ ...f, amount_max: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Category */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Category</label>
              <select
                className={inputCls + ' w-full'}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">Pick category…</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Priority</label>
              <input
                className={inputCls + ' w-24'}
                type="number" min="1" max="999"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
              <p className="text-zinc-500 text-xs mt-1">Lower = runs first</p>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            onClick={handleSubmit}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-1.5 text-xs font-medium transition-colors"
          >
            Save Rule
          </button>
        </div>
      )}

      {/* Rule list */}
      {rules.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-600 text-xs py-4 text-center">
          No pattern rules yet. Add one above or confirm a merchant in the Review Queue.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="text-left text-zinc-500 font-medium pb-2 pr-3">Type</th>
                <th className="text-left text-zinc-500 font-medium pb-2 pr-3">Match</th>
                <th className="text-left text-zinc-500 font-medium pb-2 pr-3">Category</th>
                <th className="text-left text-zinc-500 font-medium pb-2 pr-3">Priority</th>
                <th className="text-left text-zinc-500 font-medium pb-2 pr-3">Hits</th>
                <th className="text-left text-zinc-500 font-medium pb-2 pr-3">Source</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rules.map((rule) => {
                const typeLabel = RULE_TYPES.find((t) => t.value === rule.rule_type)?.label ?? rule.rule_type;
                const src = SOURCE_LABELS[rule.created_from] ?? { label: rule.created_from, cls: 'text-zinc-500' };
                const ps = rule.category ? pillStyle(rule.category) : null;
                const matchDisplay = rule.rule_type === 'AMOUNT_RANGE'
                  ? `$${rule.amount_min ?? '0'} – $${rule.amount_max ?? '∞'}`
                  : rule.match_value;

                return (
                  <tr key={rule.id} className="group">
                    <td className="py-2.5 pr-3">
                      <span className="text-zinc-400 dark:text-zinc-500 font-mono">{typeLabel}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <code className="text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
                        {matchDisplay}
                      </code>
                    </td>
                    <td className="py-2.5 pr-3">
                      {ps ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium"
                          style={ps}
                        >
                          <CategoryIcon category={rule.category} className="w-3 h-3 shrink-0" />
                          {rule.category}
                        </span>
                      ) : (
                        <span className="text-zinc-500">{rule.category}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-zinc-500">{rule.priority}</td>
                    <td className="py-2.5 pr-3 text-zinc-500">{rule.hit_count ?? 0}</td>
                    <td className={`py-2.5 pr-3 ${src.cls}`}>{src.label}</td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => onDeleteRule(rule.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition-all"
                        title="Delete rule"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
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
