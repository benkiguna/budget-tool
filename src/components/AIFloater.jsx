import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { chatWithData, generateInsights, buildSpendingContext, categorizeMerchants } from '../lib/gemini.js';
import { CATEGORY_COLORS } from '../lib/categoryColors.js';
import { formatCurrency } from '../lib/utils.js';
import { getCategories } from '../lib/categorizer.js';
import { getModelLimits } from '../lib/modelLimits.js';
import MerchantLogo from './MerchantLogo.jsx';
import AIBlobWidget from './AIBlobWidget.tsx';

// ── Known models for the inline picker ────────────────────────────────────────
const KNOWN_MODELS = [
  { id: 'gemini-2.5-flash',      label: 'Flash 2.5',      note: '1.5K RPD · balanced' },
  { id: 'gemini-2.5-flash-lite', label: 'Flash Lite 2.5', note: '1.5K RPD · fastest' },
  { id: 'gemini-2.5-pro',        label: 'Pro 2.5',        note: '50 RPD · best quality' },
];

const SUGGESTED_QUESTIONS = [
  'What are my biggest spending categories?',
  'How does my spending compare month to month?',
  'Where am I overspending?',
  'What subscriptions should I consider cancelling?',
  "What's my savings rate this month?",
];

// ── Icons ─────────────────────────────────────────────────────────────────────
function SparkleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}


function ChatIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function InsightsIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function CategorizeIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

// Category SVG icons (simple, recognizable at small sizes)
function getCategoryIcon(category) {
  const cls = 'w-full h-full';
  const sw = { strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const base = { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', className: cls };
  switch (category) {
    case 'Food':
      return <svg {...base} {...sw}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6h5z"/></svg>;
    case 'Groceries':
      return <svg {...base} {...sw}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
    case 'Transport':
      return <svg {...base} {...sw}><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
    case 'Shopping':
      return <svg {...base} {...sw}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18M16 10a4 4 0 01-8 0"/></svg>;
    case 'Subscriptions':
      return <svg {...base} {...sw}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
    case 'Bills':
      return <svg {...base} {...sw}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case 'Health':
      return <svg {...base} {...sw}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
    case 'Travel':
      return <svg {...base} {...sw}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.16 2 2 0 012.11.99h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.29 8.69a16 16 0 006.02 6.02l1.06-1.06a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
    case 'Entertainment':
      return <svg {...base} {...sw}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
    case 'Income':
      return <svg {...base} {...sw}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
    case 'Savings':
      return <svg {...base} {...sw}><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2h0V5z"/><path d="M2 9v1a2 2 0 002 2h1"/><path d="M16 11s0 1.5-5 1.5-5-1.5-5-1.5"/></svg>;
    case 'Rent':
    case 'House Rent':
      return <svg {...base} {...sw}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case 'EMI':
      return <svg {...base} {...sw}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case 'Credit Card Payment':
      return <svg {...base} {...sw}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
    case 'Other':
    default:
      return <svg {...base} {...sw}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
  }
}

// ── Model picker popover ───────────────────────────────────────────────────────
function ModelPicker({ model, tier, onChangeModel, onChangeTier }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const shortLabel = KNOWN_MODELS.find((m) => m.id === model)?.label ?? model?.split('-').slice(-1)[0] ?? 'No model';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-medium transition-colors"
        title="Change AI model"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
        {shortLabel}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-2.5 h-2.5 shrink-0 opacity-50">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5"
          >
            {KNOWN_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => { onChangeModel(m.id); setOpen(false); }}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                  model === m.id
                    ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${model === m.id ? 'border-indigo-500 bg-indigo-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                  {model === m.id && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium">{m.label}</p>
                  <p className="text-zinc-400 dark:text-zinc-500 text-xs">{m.note}</p>
                </div>
              </button>
            ))}

            <div className="flex gap-1 px-2.5 pt-2 pb-1 border-t border-zinc-100 dark:border-zinc-800 mt-1">
              <span className="text-zinc-400 text-xs mr-auto self-center">Tier</span>
              {['free', 'paid'].map((t) => (
                <button
                  key={t}
                  onClick={() => onChangeTier(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    tier === t
                      ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                      : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Usage dot (compact fuel gauge) ────────────────────────────────────────────
function UsageDot({ aiUsage, model, tier }) {
  const limits = getModelLimits(model, tier);
  const todayCount = aiUsage?.today?.count || 0;
  const rpd = limits?.rpd ?? null;
  const pct = rpd ? Math.min((todayCount / rpd) * 100, 100) : 0;

  const color = pct > 90 ? 'bg-rose-400' : pct > 65 ? 'bg-amber-400' : 'bg-emerald-400';
  const title = rpd ? `${todayCount}/${rpd} requests today` : `${todayCount} requests today`;

  return (
    <div title={title} className="flex items-center gap-1.5 cursor-default">
      <span className={`w-2 h-2 rounded-full ${color} shrink-0`} />
      {rpd && (
        <span className="text-zinc-500 text-xs tabular-nums">{todayCount}/{rpd}</span>
      )}
    </div>
  );
}

// ── Chat mode ─────────────────────────────────────────────────────────────────
function ChatMode({ transactions, model, currentPage, onTrackUsage, onStateChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const context = buildSpendingContext(transactions);

  const pageHint = {
    dashboard: 'You\'re on the Dashboard',
    transactions: 'You\'re browsing your transactions',
    enrich: 'You\'re on the Enrich page',
    settings: 'You\'re in Settings',
  }[currentPage] ?? '';

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(text) {
    const q = text?.trim();
    if (!q || loading) return;
    setInput('');
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    onStateChange?.('thinking');
    const result = await chatWithData(q, context, model, history);
    setMessages((prev) => [
      ...prev,
      { role: 'model', text: result.ok ? result.text : `Error: ${result.message}`, error: !result.ok },
    ]);
    if (result.ok) onTrackUsage('chat', result.tokens);
    setLoading(false);
    onStateChange?.('done');
  }

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-6">
          <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center">
            <SparkleIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-0.5">Ask about your finances</p>
            {pageHint && <p className="text-zinc-500 text-xs">{pageHint}</p>}
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="text-left text-xs border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-500 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl px-3 py-2 transition-colors bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-3 pb-3 pr-0.5 min-h-0">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'model' && (
                <div className="w-5 h-5 bg-indigo-500/15 border border-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <SparkleIcon className="w-3 h-3 text-indigo-400" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : m.error
                    ? 'bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/40 text-rose-600 dark:text-rose-300'
                    : 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-bl-sm'
              }`}>
                {m.text}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-5 h-5 bg-indigo-500/15 border border-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
                <SparkleIcon className="w-3 h-3 text-indigo-400" />
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <input
          ref={inputRef}
          className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-100 text-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
          placeholder="Ask about your spending…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:pointer-events-none rounded-xl flex items-center justify-center transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Insights mode ─────────────────────────────────────────────────────────────
function InsightsMode({ transactions, model, onTrackUsage, onStateChange }) {
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
    onStateChange?.('thinking');
    const context = buildSpendingContext(scopedTxs);
    const result = await generateInsights(context, model, focus);
    setInsight(result);
    if (result.ok) onTrackUsage('insights', result.tokens);
    setLoading(false);
    onStateChange?.('done');
  }

  const periodLabel = selectedMonth
    ? new Date(selectedMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  return (
    <div className="space-y-3 flex flex-col h-full">
      {/* Period pills */}
      <div>
        <p className="text-zinc-600 text-xs uppercase tracking-wide mb-2">Period</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedMonth('')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              !selectedMonth
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
            }`}
          >
            All time
          </button>
          {months.map((m) => {
            const label = new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            return (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedMonth === m
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Focus input */}
      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-100 text-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
          placeholder="Focus on… (optional)"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
        />
        <button
          onClick={handleGenerate}
          disabled={loading || scopedTxs.length === 0}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl px-3 py-2 text-xs font-medium transition-colors shrink-0"
        >
          {loading
            ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <SparkleIcon className="w-3 h-3" />
          }
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      <p className="text-zinc-500 text-xs -mt-1">{scopedTxs.length} transactions · {periodLabel}</p>

      {/* Result */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <AnimatePresence mode="wait">
          {!insight && !loading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-10 gap-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl"
            >
              <InsightsIcon className="w-6 h-6 text-zinc-400 dark:text-zinc-700" />
              <p className="text-zinc-400 dark:text-zinc-600 text-xs">Select a period and analyze</p>
            </motion.div>
          )}

          {insight && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl border ${insight.ok
                ? 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700'
                : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40'}`}
            >
              {insight.ok && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700/60">
                  <SparkleIcon className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">{periodLabel} · AI Analysis</span>
                  <button onClick={handleGenerate} disabled={loading}
                    className="ml-auto text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-400 transition-colors disabled:opacity-30"
                    title="Regenerate"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                  </button>
                </div>
              )}
              <div className="px-4 py-3">
                {insight.ok
                  ? <div className="text-zinc-700 dark:text-zinc-200 text-xs leading-relaxed whitespace-pre-wrap">{insight.text}</div>
                  : <p className="text-rose-600 dark:text-rose-400 text-xs">{insight.message}</p>
                }
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Categorize mode ───────────────────────────────────────────────────────────
function CategorizeMode({ transactions, overrides, model, settings, onOverride, onAddCategory, onTrackUsage, onStateChange }) {
  const allCategories = getCategories(settings?.categories ?? []);
  const [running, setRunning] = useState(false);
  const [localOverrides, setLocalOverrides] = useState({});

  // Only uncategorized merchants, skip user-overridden ones
  const uncategorized = [...new Map(
    transactions
      .filter((tx) => tx.categorySource === 'uncategorized' && overrides[tx.merchantRaw]?.source !== 'user')
      .map((tx) => [tx.merchantRaw, tx])
  ).values()];

  const totalUncatSpend = uncategorized.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const saved = Object.keys(localOverrides);
  const pending = uncategorized.filter((tx) => !localOverrides[tx.merchantRaw]);
  const progressPct = uncategorized.length > 0 ? Math.round((saved.length / uncategorized.length) * 100) : 100;

  function handlePick(merchantRaw, category) {
    onOverride(merchantRaw, category);
    setLocalOverrides((s) => ({ ...s, [merchantRaw]: category }));
  }

  async function runAll() {
    if (!model || pending.length === 0) return;
    setRunning(true);
    onStateChange?.('thinking');
    const names = pending.map((tx) => tx.merchantRaw);
    const { categorizeMerchants: cm } = await import('../lib/gemini.js');
    const { overrides: newEntries, tokens } = await cm(names, model);
    for (const [merchantRaw, entry] of Object.entries(newEntries)) {
      onOverride(merchantRaw, entry.category);
      setLocalOverrides((s) => ({ ...s, [merchantRaw]: entry.category }));
    }
    onTrackUsage('categorizations', tokens);
    setRunning(false);
    onStateChange?.('done');
  }

  if (uncategorized.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
        <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-zinc-700 dark:text-zinc-300 font-medium text-sm">All categorized</p>
          <p className="text-zinc-500 text-xs mt-0.5">Nothing left to review</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-zinc-500 text-xs">{pending.length} merchants · {formatCurrency(totalUncatSpend)} uncategorized</span>
          <span className="text-zinc-600 text-xs tabular-nums">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="h-full bg-indigo-500 rounded-full"
          />
        </div>
      </div>

      {/* Run all button */}
      <button
        onClick={runAll}
        disabled={running || !model || pending.length === 0}
        className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 disabled:pointer-events-none text-zinc-600 dark:text-zinc-300 rounded-xl px-4 py-2 text-xs font-medium transition-colors"
      >
        {running
          ? <><span className="w-3 h-3 rounded-full border-2 border-zinc-500 dark:border-zinc-400 border-t-transparent animate-spin" /> Running AI…</>
          : <><SparkleIcon className="w-3 h-3 text-indigo-400" /> Auto-categorize all with AI</>
        }
      </button>

      {/* Merchant cards */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
        <AnimatePresence initial={false}>
          {pending.map((tx) => {
            const ov = overrides[tx.merchantRaw];
            // Count all txs for this merchant
            const merchantTxs = transactions.filter((t) => t.merchantRaw === tx.merchantRaw);
            const totalSpend = merchantTxs.reduce((s, t) => s + Math.abs(t.amount), 0);

            return (
              <motion.div
                key={tx.merchantRaw}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl p-3 space-y-3"
              >
                {/* Merchant info */}
                <div className="flex items-center gap-2.5">
                  {ov?.domain && (
                    <MerchantLogo domain={ov.domain} logo={ov.logo} name={tx.merchant} size={28} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-800 dark:text-zinc-100 text-sm font-medium truncate">{ov?.displayName ?? tx.merchant}</p>
                    <p className="text-zinc-500 text-xs">
                      {merchantTxs.length} transaction{merchantTxs.length !== 1 ? 's' : ''} · {formatCurrency(totalSpend)}
                    </p>
                  </div>
                </div>

                {/* Category icon grid */}
                <div className="grid grid-cols-5 gap-1.5">
                  {allCategories.map((cat) => {
                    const color = CATEGORY_COLORS[cat] ?? '#94a3b8';
                    const isActive = tx.category === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => handlePick(tx.merchantRaw, cat)}
                        title={cat}
                        className="flex flex-col items-center gap-1 group"
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                            isActive
                              ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-zinc-50 dark:ring-offset-zinc-900 scale-110'
                              : 'opacity-60 hover:opacity-100 hover:scale-105'
                          }`}
                          style={{ backgroundColor: color + '25', color }}
                        >
                          <div className="w-4 h-4">
                            {getCategoryIcon(cat)}
                          </div>
                        </div>
                        <span className="text-zinc-500 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-400 text-[9px] leading-none text-center transition-colors max-w-[36px] truncate">{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main AIFloater ─────────────────────────────────────────────────────────────
export default function AIFloater({
  transactions,
  overrides,
  settings,
  currentPage,
  dark,
  onOverride,
  onAddCategory,
  onUpdateSettings,
  onUpdateUsage,
}) {
  const [mode, setMode] = useState('chat');
  const [aiState, setAiState] = useState('idle');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const doneTimer = useRef(null);

  const model = settings?.geminiModel;
  const tier = settings?.geminiTier ?? 'free';
  const aiUsage = settings?.aiUsage ?? {};

  const uncategorizedCount = [...new Set(
    transactions
      .filter((tx) => tx.categorySource === 'uncategorized' && overrides[tx.merchantRaw]?.source !== 'user')
      .map((tx) => tx.merchantRaw)
  )].length;

  function handleStateChange(state) {
    clearTimeout(doneTimer.current);
    setAiState(state);
    if (state === 'done') {
      doneTimer.current = setTimeout(() => setAiState('idle'), 2500);
    }
  }

  function handleTrackUsage(type, tokens) {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const currentDate = now.toISOString().slice(0, 10);
    const blank = { chat: 0, insights: 0, identifications: 0, categorizations: 0 };
    const base = aiUsage.month === currentMonth
      ? aiUsage
      : { ...aiUsage, tokens: { ...blank }, requests: { ...blank }, month: currentMonth };
    const prevToday = base.today?.date === currentDate ? base.today : { date: currentDate, count: 0 };
    onUpdateUsage?.({
      ...base,
      tokens: { ...base.tokens, [type]: (base.tokens?.[type] || 0) + (tokens?.total ?? 0) },
      requests: { ...base.requests, [type]: (base.requests?.[type] || 0) + 1 },
      today: { date: currentDate, count: prevToday.count + 1 },
      month: currentMonth,
    });
  }

  const MODES = [
    { id: 'chat',       label: 'Chat',       Icon: ChatIcon },
    { id: 'insights',   label: 'Insights',   Icon: InsightsIcon },
    { id: 'categorize', label: 'Categorize', Icon: CategorizeIcon },
  ];

  return (
    <AIBlobWidget
      aiState={aiState}
      darkMode={dark}
      panelWidth={400}
      panelHeight={560}
      bottom={isMobile ? 80 : 24}
    >
      {/* Wrapper fills the panelInner flex column, owns all internal scrolling */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      {/* Sub-header: model picker + usage */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        {model && <UsageDot aiUsage={aiUsage} model={model} tier={tier} />}
        <div className="ml-auto">
          <ModelPicker
            model={model}
            tier={tier}
            onChangeModel={(m) => onUpdateSettings?.({ geminiModel: m })}
            onChangeTier={(t) => onUpdateSettings?.({ geminiTier: t })}
          />
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex shrink-0 px-1 pt-1 border-b border-zinc-200 dark:border-zinc-800">
        {MODES.map(({ id, label, Icon }) => {
          const isActive = mode === id;
          const badge = id === 'categorize' && uncategorizedCount > 0 ? uncategorizedCount : null;
          return (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge && (
                <span className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full px-1.5 leading-4 tabular-nums">
                  {badge}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="floater-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                  transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* No model state */}
      {!model && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center">
          <SparkleIcon className="w-6 h-6 text-zinc-400 dark:text-zinc-600" />
          <p className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">No model selected</p>
          <p className="text-zinc-400 dark:text-zinc-600 text-xs">Pick a Gemini model using the selector above.</p>
        </div>
      )}

      {/* Mode content */}
      {model && (
        <div className="flex-1 overflow-hidden flex flex-col p-3.5 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex-1 flex flex-col overflow-hidden"
              style={{ height: '100%' }}
            >
              {mode === 'chat' && (
                <ChatMode
                  transactions={transactions}
                  model={model}
                  currentPage={currentPage}
                  onTrackUsage={handleTrackUsage}
                  onStateChange={handleStateChange}
                />
              )}
              {mode === 'insights' && (
                <InsightsMode
                  transactions={transactions}
                  model={model}
                  onTrackUsage={handleTrackUsage}
                  onStateChange={handleStateChange}
                />
              )}
              {mode === 'categorize' && (
                <CategorizeMode
                  transactions={transactions}
                  overrides={overrides}
                  model={model}
                  settings={settings}
                  onOverride={onOverride}
                  onAddCategory={onAddCategory}
                  onTrackUsage={handleTrackUsage}
                  onStateChange={handleStateChange}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      </div>{/* end height-filling wrapper */}
    </AIBlobWidget>
  );
}
