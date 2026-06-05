import { useState } from 'react';

const BANKS = [
  { key: 'chase',      label: 'Chase' },
  { key: 'capitalOne', label: 'Capital One' },
  { key: 'discover',   label: 'Discover' },
];

function defaultCards(cards = {}) {
  const out = {};
  for (const { key } of BANKS) {
    out[key] = { limit: String(cards[key]?.limit || ''), statementDay: String(cards[key]?.statementDay || '') };
  }
  return out;
}

export default function SettingsPanel({ settings, onSave, onClearData, uncategorizedCount = 0, onRunAI, onTestAI, onFetchModels }) {
  const [form, setForm] = useState({
    salary: String(settings.salary || ''),
    payday: String(settings.payday || '15'),
  });
  const [cardForm, setCardForm] = useState(defaultCards(settings.cards));
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // { ok, message }
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState(null); // null = not fetched yet
  const [fetchingModels, setFetchingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState(settings.geminiModel ?? '');

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleFetchModels() {
    setFetchingModels(true);
    setModels(null);
    setTestStatus(null);
    const result = await onFetchModels();
    if (result.ok) {
      setModels(result.models);
    } else {
      setTestStatus({ ok: false, message: result.message });
    }
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

  function handleCardChange(bankKey, field, value) {
    setCardForm((prev) => ({ ...prev, [bankKey]: { ...prev[bankKey], [field]: value } }));
  }

  function save() {
    const cards = {};
    for (const { key } of BANKS) {
      cards[key] = {
        limit: parseFloat(cardForm[key].limit) || 0,
        statementDay: parseInt(cardForm[key].statementDay, 10) || 0,
      };
    }
    onSave({
      salary: parseFloat(form.salary) || 0,
      payday: parseInt(form.payday, 10) || 15,
      cards,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-6 max-w-lg">
      <h2 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base mb-6">Settings</h2>

      <div className="space-y-5">
        <div>
          <label className="block text-xs text-zinc-400 uppercase tracking-wider mb-1.5">
            Monthly Take-Home Salary
          </label>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">$</span>
            <input
              type="number"
              min="0"
              step="100"
              className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:border-indigo-500"
              value={form.salary}
              onChange={(e) => handleChange('salary', e.target.value)}
              placeholder="5000"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 uppercase tracking-wider mb-1.5">
            Payday (day of month)
          </label>
          <input
            type="number"
            min="1"
            max="31"
            className="w-24 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:border-indigo-500"
            value={form.payday}
            onChange={(e) => handleChange('payday', e.target.value)}
          />
        </div>

      </div>

      {/* Card configuration */}
      <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1.5">Credit Cards</p>
        <p className="text-xs text-zinc-500 mb-4">Set credit limits and statement close dates for utilization tracking.</p>

        <div className="space-y-4">
          {BANKS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-xs text-zinc-400 mb-2">{label}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-600 mb-1">Credit Limit ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:border-indigo-500"
                    value={cardForm[key].limit}
                    onChange={(e) => handleCardChange(key, 'limit', e.target.value)}
                    placeholder="10000"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-600 mb-1">Statement Close Day</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:border-indigo-500"
                    value={cardForm[key].statementDay}
                    onChange={(e) => handleCardChange(key, 'statementDay', e.target.value)}
                    placeholder="25"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Categorization */}
      <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1.5">AI Categorization</p>
        <p className="text-xs text-zinc-500 mb-4">
          Uses Gemini API (<code className="text-zinc-400">VITE_GEMINI_API_KEY</code> in .env.local).
          {uncategorizedCount > 0
            ? <> <span className="text-amber-400">{uncategorizedCount} merchant{uncategorizedCount !== 1 ? 's' : ''} uncategorized.</span></>
            : <> All merchants are categorized.</>}
        </p>

        {/* Model picker */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <button
              className="border border-zinc-600 text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
              onClick={handleFetchModels}
              disabled={fetchingModels}
            >
              {fetchingModels ? 'Loading…' : 'Load Available Models'}
            </button>
            {selectedModel && (
              <span className="text-xs text-zinc-500">Selected: <span className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300">{selectedModel}</span></span>
            )}
          </div>

          {models !== null && (
            <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg divide-y divide-zinc-300 dark:divide-zinc-700 max-h-52 overflow-y-auto">
              {models.length === 0 && (
                <p className="text-xs text-zinc-500 px-3 py-2">No models found.</p>
              )}
              {models.map((m) => (
                <button
                  key={m.id}
                  className={`w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${selectedModel === m.id ? 'bg-indigo-900/30' : ''}`}
                  onClick={() => handleSelectModel(m.id)}
                >
                  <div>
                    <p className={`text-sm font-medium ${selectedModel === m.id ? 'text-indigo-300' : 'text-zinc-800 dark:text-zinc-200'}`}>{m.displayName}</p>
                    <p className="text-xs text-zinc-500">{m.id}</p>
                  </div>
                  {selectedModel === m.id && <span className="text-xs text-indigo-400 shrink-0">✓ selected</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="border border-zinc-600 text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
            onClick={handleTestAI}
            disabled={testing || !selectedModel}
          >
            {testing ? 'Testing…' : 'Test Selected Model'}
          </button>
          <button
            className="border border-indigo-700 text-indigo-300 hover:bg-indigo-900/30 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
            onClick={handleRunAI}
            disabled={running || uncategorizedCount === 0 || !selectedModel}
          >
            {running ? 'Running…' : `Run AI Categorization${uncategorizedCount > 0 ? ` (${uncategorizedCount})` : ''}`}
          </button>
        </div>
        {testStatus && (
          <p className={`mt-3 text-xs ${testStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
            {testStatus.message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mt-8">
        <button
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          onClick={save}
        >
          {saved ? 'Saved ✓' : 'Save Settings'}
        </button>
        <button
          className="border border-red-800 text-red-400 hover:bg-red-900/20 rounded-lg px-4 py-2 text-sm transition-colors"
          onClick={() => {
            if (confirm('Clear all transactions and overrides? This cannot be undone.')) {
              onClearData();
            }
          }}
        >
          Clear All Data
        </button>
      </div>
    </div>
  );
}
