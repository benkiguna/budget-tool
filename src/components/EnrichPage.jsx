import { useState } from 'react';
import { motion } from 'framer-motion';
import MerchantLogo from './MerchantLogo.jsx';

function SparkleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

// ── Coverage health bar ───────────────────────────────────────────────────────
function CoverageBar({ label, count, total, color = 'bg-indigo-500' }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-zinc-400 text-xs">{label}</span>
        <span className="text-zinc-300 text-xs font-semibold tabular-nums">{count}<span className="text-zinc-600 font-normal">/{total}</span></span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <p className="text-zinc-600 text-xs mt-0.5">{pct}% coverage</p>
    </div>
  );
}

// ── Trove enrichment panel ────────────────────────────────────────────────────
function TrovePanel({ transactions, overrides, onRunTrove }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState('');

  const allMerchants = [...new Set(transactions.map((tx) => tx.merchantRaw))];
  const enriched = allMerchants.filter((raw) => overrides[raw]?.domain && overrides[raw]?.domain !== 'unknown');
  const attempted = allMerchants.filter((raw) => overrides[raw]?.domain === 'unknown');
  const unenriched = allMerchants.filter((raw) => !overrides[raw]?.domain);

  const seenDomains = new Set();
  const sample = enriched
    .map((raw) => ({ raw, ...overrides[raw] }))
    .filter((ov) => ov?.displayName && ov?.domain && !seenDomains.has(ov.domain) && seenDomains.add(ov.domain))
    .slice(0, 8);

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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">Trove</span>
            <span className="text-zinc-500 text-xs">Merchant data enrichment</span>
          </div>
          <p className="text-zinc-600 text-xs">
            {running && progress ? (
              <span className="text-violet-400">{progress}</span>
            ) : (
              <>
                {enriched.length} enriched
                {attempted.length > 0 && <> · {attempted.length} not found</>}
                {unenriched.length > 0 && <> · <span className="text-amber-400">{unenriched.length} pending</span></>}
              </>
            )}
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running || unenriched.length === 0}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl px-4 py-2 text-xs font-medium transition-colors shrink-0"
        >
          {running
            ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Running…</>
            : done ? <>✓ Done</> : <>Re-enrich all</>}
        </button>
      </div>

      <CoverageBar
        label="Logo & name coverage"
        count={enriched.length}
        total={allMerchants.length}
        color="bg-violet-500"
      />

      {sample.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-zinc-200 dark:border-zinc-800">
          {sample.map((ov) => (
            <div key={ov.raw} className="flex items-center gap-1.5" title={ov.displayName}>
              <MerchantLogo domain={ov.domain} logo={ov.logo} name={ov.displayName} size={20} />
              <span className="text-zinc-500 dark:text-zinc-600 text-xs truncate max-w-[80px]">{ov.displayName}</span>
            </div>
          ))}
          {enriched.length > 8 && (
            <span className="text-zinc-500 dark:text-zinc-600 text-xs">+{enriched.length - 8} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI bulk enrichment panel ──────────────────────────────────────────────────
function AIEnrichPanel({ transactions, overrides, onRunBulkAI }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState('');

  const allMerchants = [...new Set(transactions.map((tx) => tx.merchantRaw))];
  // Respect source:user — only show non-user-overridden as pending
  const aiEnriched = allMerchants.filter((raw) => overrides[raw]?.description);
  const aiCategorized = allMerchants.filter((raw) => overrides[raw]?.source === 'ai');
  const unenriched = allMerchants.filter(
    (raw) => !overrides[raw]?.description && overrides[raw]?.source !== 'user'
  );

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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SparkleIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Gemini AI</span>
            <span className="text-zinc-500 text-xs">Bulk categorization</span>
          </div>
          <p className="text-zinc-600 text-xs">
            {running && progress ? (
              <span className="text-emerald-400">{progress}</span>
            ) : (
              <>
                {aiEnriched.length} with AI descriptions
                {aiCategorized.length > 0 && <> · {aiCategorized.length} AI-categorized</>}
                {unenriched.length > 0 && <> · <span className="text-amber-400">{unenriched.length} pending</span></>}
              </>
            )}
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running || unenriched.length === 0}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl px-4 py-2 text-xs font-medium transition-colors shrink-0"
        >
          {running
            ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Running…</>
            : done ? <>✓ Done</> : <>Enrich with AI</>}
        </button>
      </div>

      <CoverageBar
        label="AI categorization coverage"
        count={aiCategorized.length}
        total={allMerchants.length}
        color="bg-emerald-500"
      />

      {aiEnriched.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-zinc-200 dark:border-zinc-800">
          {aiEnriched.slice(0, 5).map((raw) => {
            const ov = overrides[raw];
            return (
              <div key={raw} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate max-w-[120px]">
                  {ov.displayName || raw.slice(0, 22)}
                </span>
                <span className="text-zinc-500 truncate flex-1">{ov.description}</span>
                <span className="text-emerald-400 shrink-0 font-medium">{ov.category}</span>
              </div>
            );
          })}
          {aiEnriched.length > 5 && (
            <span className="text-zinc-500 dark:text-zinc-600 text-xs">+{aiEnriched.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main EnrichPage ───────────────────────────────────────────────────────────
export default function EnrichPage({
  transactions,
  overrides,
  settings,
  onRunTrove,
  onRunBulkAI,
}) {
  const allMerchants = [...new Set(transactions.map((tx) => tx.merchantRaw))];
  const enrichedWithLogo = allMerchants.filter((raw) => overrides[raw]?.domain && overrides[raw]?.domain !== 'unknown').length;
  const aiCategorized = allMerchants.filter((raw) => overrides[raw]?.source === 'ai').length;
  const userCategorized = allMerchants.filter((raw) => overrides[raw]?.source === 'user').length;
  const total = allMerchants.length;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-violet-500/15 border border-violet-500/20 rounded-xl flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-violet-400">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        <div>
          <h1 className="text-zinc-900 dark:text-zinc-100 font-semibold text-base leading-none">Enrich</h1>
          <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">Merchant data quality &amp; bulk categorization</p>
        </div>
      </div>

      {/* Overall coverage summary */}
      {transactions.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-4">Coverage Overview · {total} merchants</p>
          <div className="grid grid-cols-3 gap-5">
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{enrichedWithLogo}</p>
              <p className="text-zinc-500 text-xs mt-0.5">with logos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{aiCategorized}</p>
              <p className="text-zinc-500 text-xs mt-0.5">AI-categorized</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{userCategorized}</p>
              <p className="text-zinc-500 text-xs mt-0.5">user-set <span className="text-indigo-400">(protected)</span></p>
            </div>
          </div>
        </div>
      )}

      {transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-zinc-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <div>
            <p className="text-zinc-400 font-medium text-sm">No transactions yet</p>
            <p className="text-zinc-600 text-xs mt-0.5">Import CSV files to start enriching merchant data</p>
          </div>
        </div>
      )}

      {/* Trove */}
      {onRunTrove && transactions.length > 0 && (
        <TrovePanel transactions={transactions} overrides={overrides} onRunTrove={onRunTrove} />
      )}

      {/* AI bulk */}
      {onRunBulkAI && transactions.length > 0 && (
        <AIEnrichPanel transactions={transactions} overrides={overrides} onRunBulkAI={onRunBulkAI} />
      )}

      {/* Source protection note */}
      {transactions.length > 0 && (
        <p className="text-zinc-600 text-xs flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-indigo-400 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Bulk operations skip merchants you've manually categorized. Individual overrides on the Transactions page always apply.
        </p>
      )}
    </div>
  );
}
