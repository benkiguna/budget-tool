import { useState } from 'react';
import CategoryEditor from './CategoryEditor.jsx';
import ImportAuditLog from './ImportAuditLog.jsx';
import ConnectedAccounts from './ConnectedAccounts.jsx';
import { CATEGORIES } from '../lib/categorizer.js';

const BANKS = [
  { key: 'chase',      label: 'Chase' },
  { key: 'capitalOne', label: 'Capital One' },
  { key: 'discover',   label: 'Discover' },
];

function defaultCards(cards = {}) {
  const out = {};
  for (const { key } of BANKS) {
    out[key] = {
      limit: String(cards[key]?.limit || ''),
      statementDay: String(cards[key]?.statementDay || ''),
    };
  }
  return out;
}

export default function SettingsPage({
  settings, onSave, onClearData,
  uncategorizedCount, onRunAI, onTestAI, onFetchModels,
  overrides, onUpdateOverride, onDeleteOverride,
  onIdentify, onAddCategory, onTransactionsChanged,
  activeTab: activeTabProp, onTabChange,
  plaidItems, onPlaidRefresh,
}) {
  const [localTab, setLocalTab] = useState('General');
  const activeTab = activeTabProp ?? localTab;
  const setActiveTab = onTabChange ?? setLocalTab;
  const TABS = ['General', 'Budgets', 'Cards', 'AI', 'Rules', 'Imports', 'Banks'];

  // General form
  const [generalForm, setGeneralForm] = useState({
    salary: String(settings.salary || ''),
    payday: String(settings.payday || '15'),
  });
  const [generalSaved, setGeneralSaved] = useState(false);
  const [budgetForm, setBudgetForm] = useState(
    Object.fromEntries(
      CATEGORIES.filter((c) => c !== 'Income' && c !== 'Credit Card Payment' && c !== 'Savings')
        .map((c) => [c, String(settings.categoryBudgets?.[c] || '')])
    )
  );
  const [budgetSaved, setBudgetSaved] = useState(false);

  // Cards form
  const [cardForm, setCardForm] = useState(defaultCards(settings.cards));
  const [cardsSaved, setCardsSaved] = useState(false);

  // AI state
  const [testStatus, setTestStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState(settings.geminiModel ?? '');

  function saveGeneral() {
    onSave({ salary: parseFloat(generalForm.salary) || 0, payday: parseInt(generalForm.payday, 10) || 15 });
    setGeneralSaved(true);
    setTimeout(() => setGeneralSaved(false), 1500);
  }

  function saveBudgets() {
    const categoryBudgets = {};
    for (const [cat, val] of Object.entries(budgetForm)) {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0) categoryBudgets[cat] = n;
    }
    onSave({ categoryBudgets });
    setBudgetSaved(true);
    setTimeout(() => setBudgetSaved(false), 1500);
  }

  function saveCards() {
    const cards = {};
    for (const { key } of BANKS) {
      cards[key] = {
        limit: parseFloat(cardForm[key].limit) || 0,
        statementDay: parseInt(cardForm[key].statementDay, 10) || 0,
      };
    }
    onSave({ cards });
    setCardsSaved(true);
    setTimeout(() => setCardsSaved(false), 1500);
  }

  async function handleFetchModels() {
    setFetchingModels(true);
    setModels(null);
    setTestStatus(null);
    const result = await onFetchModels();
    if (result.ok) setModels(result.models);
    else setTestStatus({ ok: false, message: result.message });
    setFetchingModels(false);
  }

  function handleSelectModel(id) {
    setSelectedModel(id);
    setTestStatus(null);
    onSave({ geminiModel: id });
  }

  async function handleTestAI() {
    setTesting(true);
    setTestStatus(null);
    const result = await onTestAI(selectedModel);
    setTestStatus(result);
    setTesting(false);
  }

  async function handleRunAI() {
    setRunning(true);
    await onRunAI();
    setRunning(false);
  }

  const inputCls = 'w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:border-zinc-500 transition-colors';
  const labelCls = 'block text-xs text-zinc-500 uppercase tracking-wide mb-1.5';

  return (
    <div className="max-w-2xl">
      {/* Internal tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* General */}
      {activeTab === 'General' && (
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Monthly Take-Home Salary</label>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-sm">$</span>
              <input type="number" min="0" step="100" className={inputCls} value={generalForm.salary}
                onChange={(e) => setGeneralForm((f) => ({ ...f, salary: e.target.value }))} placeholder="5000" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Payday (day of month)</label>
            <input type="number" min="1" max="31" className="w-24 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
              value={generalForm.payday} onChange={(e) => setGeneralForm((f) => ({ ...f, payday: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors" onClick={saveGeneral}>
              {generalSaved ? 'Saved ✓' : 'Save'}
            </button>
            <button
              className="border border-red-900 text-red-500 hover:bg-red-900/20 rounded-lg px-4 py-2 text-sm transition-colors"
              onClick={() => { if (confirm('Clear all transactions and overrides? This cannot be undone.')) onClearData(); }}
            >
              Clear All Data
            </button>
          </div>
        </div>
      )}

      {/* Budgets */}
      {activeTab === 'Budgets' && (
        <div className="space-y-5">
          <p className="text-zinc-500 text-sm">Set monthly spending limits per category. Leave blank for no limit.</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.keys(budgetForm).map((cat) => (
              <div key={cat}>
                <label className={labelCls}>{cat}</label>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-sm">$</span>
                  <input
                    type="number" min="0" step="10"
                    className={inputCls}
                    placeholder="no limit"
                    value={budgetForm[cat]}
                    onChange={(e) => setBudgetForm((f) => ({ ...f, [cat]: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors" onClick={saveBudgets}>
            {budgetSaved ? 'Saved ✓' : 'Save Budgets'}
          </button>
        </div>
      )}

      {/* Cards */}
      {activeTab === 'Cards' && (
        <div className="space-y-6">
          <p className="text-zinc-500 text-sm">Set credit limits and statement close dates for utilization tracking and payment countdowns.</p>
          {BANKS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-sm font-medium mb-3">{label}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Credit Limit ($)</label>
                  <input type="number" min="0" step="500" className={inputCls}
                    value={cardForm[key].limit}
                    onChange={(e) => setCardForm((prev) => ({ ...prev, [key]: { ...prev[key], limit: e.target.value } }))}
                    placeholder="10000" />
                </div>
                <div>
                  <label className={labelCls}>Statement Close Day</label>
                  <input type="number" min="1" max="31" className={inputCls}
                    value={cardForm[key].statementDay}
                    onChange={(e) => setCardForm((prev) => ({ ...prev, [key]: { ...prev[key], statementDay: e.target.value } }))}
                    placeholder="25" />
                </div>
              </div>
            </div>
          ))}
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors" onClick={saveCards}>
            {cardsSaved ? 'Saved ✓' : 'Save Card Settings'}
          </button>
        </div>
      )}

      {/* AI */}
      {activeTab === 'AI' && (
        <div className="space-y-5">
          <p className="text-zinc-500 text-sm">
            Uses Gemini API via <code className="text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">VITE_GEMINI_API_KEY</code> in .env.local.
            {uncategorizedCount > 0
              ? <> <span className="text-amber-400">{uncategorizedCount} merchant{uncategorizedCount !== 1 ? 's' : ''} uncategorized.</span></>
              : <> All merchants are categorized.</>}
          </p>

          {/* Tier selector */}
          <div>
            <label className={labelCls}>API Tier</label>
            <p className="text-zinc-500 dark:text-zinc-600 text-xs mb-2">Used to display accurate rate limits for your plan.</p>
            <div className="flex gap-2">
              {['free', 'paid'].map((tier) => (
                <button
                  key={tier}
                  onClick={() => onSave({ geminiTier: tier })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    (settings.geminiTier ?? 'free') === tier
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  {tier === 'free' ? 'Free Tier' : 'Paid Tier'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Model</label>
            <div className="flex items-center gap-3 mb-3">
              <button
                className="border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                onClick={handleFetchModels} disabled={fetchingModels}
              >
                {fetchingModels ? 'Loading…' : 'Load Available Models'}
              </button>
              {selectedModel && <span className="text-xs text-zinc-500">Selected: <span className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300">{selectedModel}</span></span>}
            </div>
            {models !== null && (
              <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl divide-y divide-zinc-200/50 dark:divide-zinc-700/50 max-h-52 overflow-y-auto">
                {models.length === 0 && <p className="text-xs text-zinc-500 px-3 py-3">No models found.</p>}
                {models.map((m) => (
                  <button key={m.id}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors ${selectedModel === m.id ? 'bg-indigo-900/20' : ''}`}
                    onClick={() => handleSelectModel(m.id)}
                  >
                    <div>
                      <p className={`text-sm font-medium ${selectedModel === m.id ? 'text-indigo-300' : 'text-zinc-800 dark:text-zinc-200'}`}>{m.displayName}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-600">{m.id}</p>
                    </div>
                    {selectedModel === m.id && <span className="text-xs text-indigo-400">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="border border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
              onClick={handleTestAI} disabled={testing || !selectedModel}>
              {testing ? 'Testing…' : 'Test Model'}
            </button>
            <button className="border border-indigo-700 text-indigo-300 hover:bg-indigo-900/30 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
              onClick={handleRunAI} disabled={running || uncategorizedCount === 0 || !selectedModel}>
              {running ? 'Running…' : `Run AI${uncategorizedCount > 0 ? ` (${uncategorizedCount})` : ''}`}
            </button>
          </div>
          {testStatus && (
            <p className={`text-xs ${testStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>{testStatus.message}</p>
          )}
        </div>
      )}

      {/* Rules */}
      {activeTab === 'Rules' && (
        <div>
          <p className="text-zinc-500 text-sm mb-5">Merchant overrides applied during categorization. AI-learned rules are shown here and can be corrected.</p>
          <CategoryEditor
            overrides={overrides}
            onUpdate={onUpdateOverride}
            onDelete={onDeleteOverride}
            customCategories={settings.categories ?? []}
            onIdentify={onIdentify}
            geminiModel={settings.geminiModel}
            onAddCategory={onAddCategory}
          />
        </div>
      )}

      {/* Imports */}
      {activeTab === 'Imports' && (
        <div>
          <p className="text-zinc-500 text-sm mb-5">
            Every CSV import is logged here with its date range, transaction counts, and balance verification status.
            Deleting an import removes all transactions tied to that file.
          </p>
          <ImportAuditLog onTransactionsChanged={onTransactionsChanged} />
        </div>
      )}

      {/* Banks */}
      {activeTab === 'Banks' && (
        <div>
          <p className="text-zinc-500 text-sm mb-5">
            Connected banks sync automatically via Plaid. Up to 10 accounts on the Trial plan.
            CSV import remains available for backfilling history older than Plaid's coverage window.
          </p>
          <ConnectedAccounts items={plaidItems ?? []} onRefresh={onPlaidRefresh} />
        </div>
      )}
    </div>
  );
}
