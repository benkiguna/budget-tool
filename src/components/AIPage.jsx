import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { chatWithData, generateInsights, buildSpendingContext, categorizeMerchants } from '../lib/gemini.js';
import { formatCurrency } from '../lib/utils.js';
import CategorySelect from './CategorySelect.jsx';
import { identifyMerchant } from '../lib/gemini.js';
import MerchantLogo from './MerchantLogo.jsx';

const TABS = ['Chat', 'Insights', 'Categorize'];

import { getModelLimits, fmtLimit } from '../lib/modelLimits.js';

function SparkleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

function UsageMeter({ aiUsage, model, tier }) {
  const limits = getModelLimits(model, tier);
  const todayCount = aiUsage.today?.count || 0;
  const rpd = limits?.rpd ?? null;
  const dayPct = rpd ? Math.min((todayCount / rpd) * 100, 100) : 0;
  const dayColor = dayPct > 90 ? 'bg-rose-500' : dayPct > 70 ? 'bg-amber-500' : 'bg-indigo-500';
  const dayTextColor = dayPct > 90 ? 'text-rose-400' : dayPct > 70 ? 'text-amber-400' : 'text-zinc-900 dark:text-zinc-100';

  const breakdown = [
    { label: 'Chat',            key: 'chat',            color: 'bg-indigo-500' },
    { label: 'Insights',        key: 'insights',        color: 'bg-violet-500' },
    { label: 'Identifications', key: 'identifications', color: 'bg-sky-500' },
    { label: 'Categorizations', key: 'categorizations', color: 'bg-emerald-500' },
  ];
  const monthlyRequests = breakdown.reduce((s, b) => s + (aiUsage.requests?.[b.key] || 0), 0);
  const totalTokens = breakdown.reduce((s, b) => s + (aiUsage.tokens?.[b.key] || 0), 0);

  return (
    <div className="bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">

      {/* Daily requests — primary metric */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-zinc-400 text-xs font-medium">Requests today</span>
          <div className="flex items-center gap-2">
            {rpd && (
              <span className={`text-sm font-bold tabular-nums ${dayTextColor}`}>
                {todayCount} <span className="text-zinc-500 dark:text-zinc-600 font-normal text-xs">/ {rpd} RPD</span>
              </span>
            )}
            {!rpd && <span className="text-zinc-400 text-sm font-bold">{todayCount}</span>}
          </div>
        </div>
        {rpd && (
          <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${dayPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`h-full rounded-full ${dayColor}`}
            />
          </div>
        )}
        {dayPct > 70 && rpd && (
          <p className={`text-xs mt-1 ${dayPct > 90 ? 'text-rose-400' : 'text-amber-400'}`}>
            {rpd - todayCount} requests remaining today
          </p>
        )}
      </div>

      {/* Model limits reference */}
      {limits && (
        <div className="flex gap-4 py-2 border-t border-zinc-200 dark:border-zinc-800">
          {[
            { label: 'RPM', val: fmtLimit(limits.rpm), title: 'Requests per minute' },
            { label: 'RPD', val: fmtLimit(limits.rpd), title: 'Requests per day' },
            { label: 'TPM', val: fmtLimit(limits.tpm), title: 'Input tokens per minute' },
            { label: 'CTX', val: fmtLimit(limits.ctx), title: 'Input context window (tokens)' },
          ].map(({ label, val, title }) => (
            <div key={label} title={title} className="text-center">
              <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-sm font-semibold">{val}</p>
              <p className="text-zinc-500 dark:text-zinc-600 text-xs">{label}</p>
            </div>
          ))}
          <div className="ml-auto text-right">
            <p className="text-zinc-500 dark:text-zinc-600 text-xs capitalize">{tier} tier · {limits.name}</p>
          </div>
        </div>
      )}
      {!limits && (
        <p className="text-zinc-400 dark:text-zinc-700 text-xs border-t border-zinc-200 dark:border-zinc-800 pt-2">Limits unknown for this model</p>
      )}

      {/* Monthly summary */}
      <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-3">
        <div className="flex gap-4">
          <div>
            <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-sm font-semibold tabular-nums">{monthlyRequests}</p>
            <p className="text-zinc-500 dark:text-zinc-600 text-xs">requests this month</p>
          </div>
          <div>
            <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-sm font-semibold tabular-nums">{totalTokens.toLocaleString()}</p>
            <p className="text-zinc-500 dark:text-zinc-600 text-xs">tokens this month</p>
          </div>
        </div>
        <div className="flex gap-3">
          {breakdown.map((b) => {
            const req = aiUsage.requests?.[b.key] || 0;
            if (!req) return null;
            return (
              <div key={b.key} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${b.color}`} />
                <span className="text-zinc-500 dark:text-zinc-600 text-xs">{b.label.slice(0, 3)}: {req}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────
const SUGGESTED_QUESTIONS = [
  'What are my biggest spending categories?',
  'How does my spending compare month to month?',
  'Where am I overspending?',
  'What subscriptions should I consider cancelling?',
  'What is my savings rate?',
];

function ChatTab({ transactions, model, onTrackUsage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const context = buildSpendingContext(transactions);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text) {
    const q = text.trim();
    if (!q || loading) return;
    setInput('');
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    const result = await chatWithData(q, context, model, history);
    setMessages((prev) => [
      ...prev,
      { role: 'model', text: result.ok ? result.text : `Error: ${result.message}`, error: !result.ok },
    ]);
    if (result.ok) onTrackUsage('chat', result.tokens);
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 480 }}>
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 py-8">
          <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center">
            <SparkleIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-1">Ask about your finances</p>
            <p className="text-zinc-500 dark:text-zinc-600 text-xs">Your spending data is loaded as context</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-500 rounded-full px-3 py-1.5 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'model' && (
                <div className="w-6 h-6 bg-indigo-500/15 border border-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <SparkleIcon className="w-3.5 h-3.5 text-indigo-400" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : m.error
                    ? 'bg-rose-900/30 border border-rose-300 dark:border-rose-800/40 text-rose-300'
                    : 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-bl-sm'
              }`}>
                {m.text}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-6 h-6 bg-indigo-500/15 border border-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
                <SparkleIcon className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} className="w-1.5 h-1.5 bg-zinc-500 rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="flex gap-2 mt-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <input
          className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          placeholder="Ask about your spending…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none rounded-xl flex items-center justify-center transition-colors shrink-0"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Insights Tab ──────────────────────────────────────────────────────────────
function InsightsTab({ transactions, model, onTrackUsage }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  const months = [...new Set(
    transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean)
  )].sort().reverse();

  const scopedTxs = selectedMonth
    ? transactions.filter((tx) => tx.date?.startsWith(selectedMonth))
    : transactions;

  async function handleGenerate() {
    setLoading(true);
    setInsight(null);
    const context = buildSpendingContext(scopedTxs);
    const result = await generateInsights(context, model, focus);
    setInsight(result);
    if (result.ok) onTrackUsage('insights', result.tokens);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
        {/* Period pills */}
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-2">Period to analyze</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedMonth('')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                !selectedMonth
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
              }`}
            >
              All time
            </button>
            {months.map((m) => {
              const [year, mo] = m.split('-');
              const label = new Date(Number(year), Number(mo) - 1)
                .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              return (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedMonth === m
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Focus input */}
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-2">Focus (optional)</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              placeholder="e.g. focus on food spending, compare to last month, why did I overspend…"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || scopedTxs.length === 0}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors shrink-0"
            >
              {loading
                ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Analyzing…</>
                : <><SparkleIcon className="w-3.5 h-3.5" /> Analyze</>
              }
            </button>
          </div>
          <p className="text-zinc-400 dark:text-zinc-700 text-xs mt-1.5">
            {scopedTxs.length} transactions in scope
          </p>
        </div>
      </div>

      {/* Result */}
      <AnimatePresence mode="wait">
        {!insight && !loading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 gap-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl"
          >
            <SparkleIcon className="w-7 h-7 text-zinc-400 dark:text-zinc-700" />
            <p className="text-zinc-500 dark:text-zinc-600 text-sm">Select a period and click Analyze</p>
          </motion.div>
        )}

        {insight && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={insight.ok
              ? 'bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-2xl p-6'
              : 'bg-rose-900/20 border border-rose-300 dark:border-rose-800/40 rounded-2xl p-6'}
          >
            {insight.ok
              ? <div className="text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{insight.text}</div>
              : <p className="text-rose-400 text-sm">{insight.message}</p>
            }
            {insight.ok && (
              <button onClick={handleGenerate} disabled={loading}
                className="mt-4 text-xs text-zinc-500 dark:text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1 disabled:opacity-40">
                <SparkleIcon className="w-3 h-3" /> Regenerate
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Categorize Tab ────────────────────────────────────────────────────────────
function CategorizeTab({ transactions, overrides, model, onOverride, onAddCategory, onTrackUsage, settings }) {
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState({});
  const [saved, setSaved] = useState({});

  const uncategorized = [...new Map(
    transactions
      .filter((tx) => tx.categorySource === 'uncategorized')
      .map((tx) => [tx.merchantRaw, tx])
  ).values()];

  const totalSpend = uncategorized.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const pending = uncategorized.filter((tx) => !saved[tx.merchantRaw]);

  async function runAll() {
    if (!model) return;
    setRunning(true);
    const names = pending.map((tx) => tx.merchantRaw);
    const { categorizeMerchants: cm } = await import('../lib/gemini.js');
    const { overrides: newEntries, tokens } = await cm(names, model);
    for (const [merchantRaw, entry] of Object.entries(newEntries)) {
      onOverride(merchantRaw, entry.category);
      setSaved((s) => ({ ...s, [merchantRaw]: true }));
    }
    onTrackUsage('categorizations', tokens);
    setRunning(false);
  }

  function handleSaveOne(merchantRaw) {
    const cat = selected[merchantRaw];
    if (!cat) return;
    onOverride(merchantRaw, cat);
    setSaved((s) => ({ ...s, [merchantRaw]: true }));
  }

  if (uncategorized.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 font-medium text-sm">All merchants categorized</p>
        <p className="text-zinc-500 dark:text-zinc-600 text-xs">Nothing left to review</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 text-sm font-medium">{pending.length} merchant{pending.length !== 1 ? 's' : ''} uncategorized</p>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">{formatCurrency(totalSpend)} in unclassified spend</p>
        </div>
        <button
          onClick={runAll}
          disabled={running || !model || pending.length === 0}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
        >
          {running
            ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Running…</>
            : <><SparkleIcon className="w-3.5 h-3.5" /> Auto-categorize all</>
          }
        </button>
      </div>

      <div className="space-y-2">
        {uncategorized.map((tx) => {
          if (saved[tx.merchantRaw]) return null;
          const chosenCategory = selected[tx.merchantRaw] ?? '';
          return (
            <div key={tx.merchantRaw} className="flex items-center gap-3 bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-zinc-900 dark:text-zinc-100 text-sm font-medium truncate">{tx.merchant}</p>
                <p className="text-zinc-500 dark:text-zinc-600 text-xs truncate font-mono">{tx.merchantRaw}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CategorySelect
                  merchantRaw={tx.merchantRaw}
                  value={chosenCategory}
                  onChange={(cat, isNew) => {
                    if (isNew && onAddCategory) onAddCategory(cat);
                    setSelected((s) => ({ ...s, [tx.merchantRaw]: cat }));
                  }}
                  onIdentify={async (raw) => { const r = await identifyMerchant(raw, model); onTrackUsage('identifications', r.tokens); return r; }}
                  geminiModel={model}
                  customCategories={settings.categories ?? []}
                  selectClassName="bg-zinc-200 dark:bg-zinc-700 border border-zinc-600 rounded-lg px-2 py-1.5 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => handleSaveOne(tx.merchantRaw)}
                  disabled={!chosenCategory}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white transition-colors"
                  title="Save"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trove Enrichment Panel ────────────────────────────────────────────────────
function TrovePanel({ transactions, overrides, onRunTrove }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState('');

  // "attempted" = Trove ran on this merchant (has domain, even if 'unknown' sentinel)
  // "unenriched" = never attempted by Trove
  const unenriched = [...new Set(
    transactions.map((tx) => tx.merchantRaw).filter((raw) => !overrides[raw]?.domain)
  )];
  const enriched = [...new Set(
    transactions.map((tx) => tx.merchantRaw).filter((raw) => overrides[raw]?.domain && overrides[raw]?.domain !== 'unknown')
  )];
  const attempted = [...new Set(
    transactions.map((tx) => tx.merchantRaw).filter((raw) => overrides[raw]?.domain === 'unknown')
  )];

  // Deduplicate by domain so the preview strip shows one logo per service
  const seenDomains = new Set();
  const sample = enriched
    .map((raw) => ({ raw, ...overrides[raw] }))
    .filter((ov) => ov?.displayName && ov?.domain && !seenDomains.has(ov.domain) && seenDomains.add(ov.domain))
    .slice(0, 6);

  async function handleRun() {
    setRunning(true);
    setDone(false);
    setProgress('');
    await onRunTrove(setProgress);
    setProgress('');
    setRunning(false);
    setDone(true);
    setTimeout(() => setDone(false), 4000);
  }

  return (
    <div className="bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">Trove</span>
            <span className="text-zinc-500 dark:text-zinc-600 text-xs">Merchant Enrichment</span>
          </div>
          {running && progress ? (
            <p className="text-violet-400 text-xs font-medium">{progress}</p>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-600 text-xs">
              {enriched.length > 0 || attempted.length > 0 ? (
                <>
                  {enriched.length} enriched
                  {attempted.length > 0 && <> · {attempted.length} not found</>}
                  {unenriched.length > 0 && <> · {unenriched.length} pending</>}
                </>
              ) : (
                <>{unenriched.length} merchant{unenriched.length !== 1 ? 's' : ''} to enrich</>
              )}
            </p>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running || unenriched.length === 0}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0"
        >
          {running
            ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Running…</>
            : done ? <>✓ Done</> : <>Re-enrich all</>
          }
        </button>
      </div>

      {/* Logo preview strip */}
      {sample.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-zinc-200 dark:border-zinc-700">
          {sample.map((ov) => (
            <div key={ov.raw} className="flex items-center gap-1.5" title={ov.displayName}>
              <MerchantLogo domain={ov.domain} logo={ov.logo} name={ov.displayName} size={18} />
              <span className="text-zinc-500 dark:text-zinc-600 text-xs truncate max-w-[80px]">{ov.displayName}</span>
            </div>
          ))}
          {enriched.length > 6 && (
            <span className="text-zinc-500 dark:text-zinc-600 text-xs">+{enriched.length - 6} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI Bulk Enrichment Panel ──────────────────────────────────────────────────
function AIEnrichPanel({ transactions, overrides, onRunBulkAI }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState('');

  // "enriched by AI" = has description from AI
  const allMerchants = [...new Set(transactions.map((tx) => tx.merchantRaw))];
  const aiEnriched = allMerchants.filter((raw) => overrides[raw]?.description);
  const aiCategorized = allMerchants.filter((raw) => overrides[raw]?.source === 'ai');
  const unenriched = allMerchants.filter((raw) => !overrides[raw]?.description);

  async function handleRun() {
    setRunning(true);
    setDone(false);
    setProgress('');
    await onRunBulkAI(setProgress);
    setProgress('');
    setRunning(false);
    setDone(true);
    setTimeout(() => setDone(false), 4000);
  }

  return (
    <div className="bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Gemini AI</span>
            <span className="text-zinc-500 dark:text-zinc-600 text-xs">Bulk Categorization</span>
          </div>
          {running && progress ? (
            <p className="text-emerald-400 text-xs font-medium">{progress}</p>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-600 text-xs">
              {aiEnriched.length > 0 || aiCategorized.length > 0 ? (
                <>
                  {aiEnriched.length} with AI descriptions
                  {aiCategorized.length > 0 && <> · {aiCategorized.length} AI-categorized</>}
                  {unenriched.length > 0 && <> · {unenriched.length} pending</>}
                </>
              ) : (
                <>{unenriched.length} merchant{unenriched.length !== 1 ? 's' : ''} to enrich</>
              )}
            </p>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running || unenriched.length === 0}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0"
        >
          {running
            ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Running…</>
            : done ? <>✓ Done</> : <>Enrich all with AI</>
          }
        </button>
      </div>

      {/* Sample of AI-enriched merchants */}
      {aiEnriched.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-zinc-200 dark:border-zinc-700">
          {aiEnriched.slice(0, 4).map((raw) => {
            const ov = overrides[raw];
            return (
              <div key={raw} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-900 dark:text-zinc-100 font-medium truncate max-w-[120px]">
                  {ov.displayName || raw.slice(0, 20)}
                </span>
                <span className="text-zinc-400 dark:text-zinc-600 truncate flex-1">{ov.description}</span>
                <span className="text-emerald-400 shrink-0">{ov.category}</span>
              </div>
            );
          })}
          {aiEnriched.length > 4 && (
            <span className="text-zinc-500 dark:text-zinc-600 text-xs">+{aiEnriched.length - 4} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main AIPage ───────────────────────────────────────────────────────────────
export default function AIPage({
  transactions, overrides, settings,
  onOverride, onAddCategory, onUpdateUsage, onRunTrove, onRunBulkAI,
  activeTab: activeTabProp, onTabChange,
}) {
  const [localTab, setLocalTab] = useState('Chat');
  const activeTab = activeTabProp ?? localTab;
  const setActiveTab = onTabChange ?? setLocalTab;
  const model = settings.geminiModel;
  const tier = settings.geminiTier ?? 'free';
  const aiUsage = settings.aiUsage ?? { tokens: {}, requests: {}, today: {}, month: '' };

  function handleTrackUsage(type, tokens) {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const currentDate = now.toISOString().slice(0, 10);
    const blank = { chat: 0, insights: 0, identifications: 0, categorizations: 0 };

    const base = aiUsage.month === currentMonth
      ? aiUsage
      : { ...aiUsage, tokens: { ...blank }, requests: { ...blank }, month: currentMonth };

    const prevToday = base.today?.date === currentDate ? base.today : { date: currentDate, count: 0 };

    onUpdateUsage({
      ...base,
      tokens: { ...base.tokens, [type]: (base.tokens?.[type] || 0) + (tokens?.total ?? 0) },
      requests: { ...base.requests, [type]: (base.requests?.[type] || 0) + 1 },
      today: { date: currentDate, count: prevToday.count + 1 },
      month: currentMonth,
    });
  }

  function handleLimitChange(limit) {
    onUpdateUsage({ ...aiUsage, limit });
  }

  if (!model) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-2xl flex items-center justify-center">
          <SparkleIcon className="w-6 h-6 text-zinc-500" />
        </div>
        <div>
          <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 font-medium mb-1">No AI model selected</p>
          <p className="text-zinc-500 dark:text-zinc-600 text-sm">Go to Settings → AI to choose a Gemini model first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-500/15 border border-indigo-500/20 rounded-xl flex items-center justify-center">
            <SparkleIcon className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base leading-none">AI Assistant</h1>
            <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">{model}</p>
          </div>
        </div>
      </div>

      {/* Usage meter */}
      <UsageMeter aiUsage={aiUsage} model={model} tier={tier} />

      {/* Trove enrichment */}
      {onRunTrove && transactions.length > 0 && (
        <TrovePanel transactions={transactions} overrides={overrides} onRunTrove={onRunTrove} />
      )}

      {/* AI bulk enrichment */}
      {onRunBulkAI && transactions.length > 0 && (
        <AIEnrichPanel transactions={transactions} overrides={overrides} onRunBulkAI={onRunBulkAI} />
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            const uncatCount = tab === 'Categorize'
              ? new Set(transactions.filter((tx) => tx.categorySource === 'uncategorized').map((tx) => tx.merchantRaw)).size
              : 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors ${isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
              >
                {tab}
                {uncatCount > 0 && (
                  <span className="text-xs bg-amber-900/50 text-amber-400 border border-amber-300 dark:border-amber-800/40 rounded-full px-1.5 leading-5">
                    {uncatCount}
                  </span>
                )}
                {isActive && (
                  <motion.div layoutId="ai-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                    transition={{ type: 'spring', damping: 30, stiffness: 400 }} />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'Chat' && (
                <ChatTab transactions={transactions} model={model} onTrackUsage={handleTrackUsage} />
              )}
              {activeTab === 'Insights' && (
                <InsightsTab transactions={transactions} model={model} onTrackUsage={handleTrackUsage} />
              )}
              {activeTab === 'Categorize' && (
                <CategorizeTab
                  transactions={transactions}
                  overrides={overrides}
                  model={model}
                  onOverride={onOverride}
                  onAddCategory={onAddCategory}
                  onTrackUsage={handleTrackUsage}
                  settings={settings}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
