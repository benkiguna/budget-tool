import { useState, useMemo } from 'react';
import { formatCurrency } from '../lib/utils.js';
import { pillStyle, CategoryIcon } from './CategoryListPopover.jsx';
import CategorySelect from './CategorySelect.jsx';

// Transactions that need human review:
//   • categorySource === 'uncategorized' (no category at all)
//   • confidence < 0.65 AND source !== 'user' (AI/bank/keyword but uncertain)
function needsReview(tx) {
  if (tx.categorySource === 'user') return false;
  return tx.categorySource === 'uncategorized' || (tx.confidence != null && tx.confidence < 0.65);
}

// Confidence badge: colour + label
function ConfidenceBadge({ confidence, categorySource }) {
  if (categorySource === 'uncategorized' || confidence === 0 || confidence == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        Needs category
      </span>
    );
  }
  if (confidence < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
        {Math.round(confidence * 100)}% sure
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
      {Math.round(confidence * 100)}% sure
    </span>
  );
}

// Extract a short keyword from merchantRaw for a MERCHANT_CONTAINS rule suggestion.
// E.g. "VENMO P2P PAYMENT*12345" → "VENMO"
function extractKeyword(merchantRaw, merchant) {
  // Prefer the clean display name if it differs from raw
  if (merchant && merchant !== merchantRaw && merchant.length < 30) return merchant.toUpperCase();
  // Otherwise use the first meaningful token (alpha chars, no digits)
  const token = merchantRaw.split(/[\s*#@_\-/]/)[0] ?? merchantRaw;
  return token.replace(/\d+/g, '').trim().toUpperCase() || merchantRaw.slice(0, 20).toUpperCase();
}

// Group transactions by merchantRaw, return sorted by abs total (most impactful first)
function buildGroups(transactions) {
  const map = {};
  for (const tx of transactions) {
    if (!needsReview(tx)) continue;
    if (!map[tx.merchantRaw]) {
      map[tx.merchantRaw] = {
        merchantRaw: tx.merchantRaw,
        merchant: tx.merchant,
        count: 0,
        total: 0,
        suggestedCategory: tx.category !== 'Other' ? tx.category : null,
        confidence: tx.confidence ?? 0,
        categorySource: tx.categorySource,
        categoryReason: tx.categoryReason,
      };
    }
    const g = map[tx.merchantRaw];
    g.count++;
    g.total += tx.amount;
    // Use highest-confidence suggestion for the group
    if ((tx.confidence ?? 0) > g.confidence) {
      g.suggestedCategory = tx.category !== 'Other' ? tx.category : null;
      g.confidence = tx.confidence ?? 0;
      g.categorySource = tx.categorySource;
      g.categoryReason = tx.categoryReason;
    }
  }
  return Object.values(map).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export default function ReviewQueue({
  transactions,
  settings,
  onOverride,
  onIdentifyMerchant,
  onAddCategory,
  onCreateRule,
}) {
  const groups = useMemo(() => buildGroups(transactions), [transactions]);
  const [selected, setSelected] = useState({});   // { merchantRaw: category }
  const [dismissed, setDismissed] = useState({}); // { merchantRaw: true }
  // After confirming, track which groups should show the "create rule?" prompt
  const [rulePrompt, setRulePrompt] = useState({}); // { merchantRaw: { keyword, category } }
  const [ruleInput, setRuleInput] = useState({});   // { merchantRaw: keyword string (editable) }

  const pending = groups.filter((g) => !dismissed[g.merchantRaw]);

  if (pending.length === 0) return null;

  function effectiveCategory(g) {
    return selected[g.merchantRaw] ?? g.suggestedCategory ?? '';
  }

  function handleConfirm(merchantRaw) {
    const g = groups.find((g) => g.merchantRaw === merchantRaw);
    const category = effectiveCategory(g);
    if (!category) return;
    onOverride(merchantRaw, category);
    setDismissed((d) => ({ ...d, [merchantRaw]: true }));
    // Offer rule creation — only makes sense if onCreateRule is provided
    if (onCreateRule) {
      const keyword = extractKeyword(merchantRaw, g.merchant);
      setRulePrompt((r) => ({ ...r, [merchantRaw]: { keyword, category } }));
      setRuleInput((r) => ({ ...r, [merchantRaw]: keyword }));
    }
  }

  function handleDismiss(merchantRaw) {
    setDismissed((d) => ({ ...d, [merchantRaw]: true }));
    setRulePrompt((r) => { const { [merchantRaw]: _, ...rest } = r; return rest; });
  }

  function handleCreateRule(merchantRaw) {
    const prompt = rulePrompt[merchantRaw];
    if (!prompt || !onCreateRule) return;
    const keyword = (ruleInput[merchantRaw] ?? prompt.keyword).trim();
    if (!keyword) return;
    onCreateRule({
      rule_type: 'MERCHANT_CONTAINS',
      match_value: keyword,
      category: prompt.category,
      created_from: 'LEARNED_FROM_CORRECTION',
    });
    setRulePrompt((r) => { const { [merchantRaw]: _, ...rest } = r; return rest; });
  }

  function handleSkipRule(merchantRaw) {
    setRulePrompt((r) => { const { [merchantRaw]: _, ...rest } = r; return rest; });
  }

  // Collect active rule prompts for confirmed groups
  const activePrompts = Object.entries(rulePrompt);

  return (
    <div className="space-y-2">
      {/* Rule creation prompts (shown outside the main queue, above it) */}
      {activePrompts.map(([merchantRaw, prompt]) => (
        <div
          key={`rule-${merchantRaw}`}
          className="bg-indigo-950/30 border border-indigo-500/25 rounded-xl px-5 py-3.5 flex items-center gap-3 flex-wrap"
        >
          <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-indigo-300 flex-1 min-w-0">
            Saved as <span className="font-medium">{prompt.category}</span>. Create a rule for future transactions?
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-indigo-400">Contains:</span>
            <input
              className="bg-indigo-900/40 border border-indigo-600/40 rounded px-2 py-0.5 text-xs text-indigo-100 w-32 focus:outline-none focus:border-indigo-400"
              value={ruleInput[merchantRaw] ?? prompt.keyword}
              onChange={(e) => setRuleInput((r) => ({ ...r, [merchantRaw]: e.target.value }))}
            />
            <span className="text-xs text-indigo-400">→ {prompt.category}</span>
            <button
              onClick={() => handleCreateRule(merchantRaw)}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2.5 py-1 font-medium transition-colors"
            >
              Create Rule
            </button>
            <button
              onClick={() => handleSkipRule(merchantRaw)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      ))}

      {/* Main queue */}
      {pending.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-amber-500/30 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm leading-tight">Review Queue</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-600">
                  {pending.length} merchant{pending.length !== 1 ? 's' : ''} need your input
                </p>
              </div>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-medium">
              {pending.length}
            </span>
          </div>

          {/* Groups */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {pending.map((g) => {
              const cat = effectiveCategory(g);
              const isUncategorized = g.categorySource === 'uncategorized';
              const hasAiSuggestion = g.suggestedCategory && !isUncategorized;
              const isP2P = g.categoryReason?.startsWith('P2P');

              return (
                <div key={g.merchantRaw} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    {/* Left: merchant info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-zinc-900 dark:text-zinc-100 text-sm font-medium truncate">
                          {g.merchant}
                        </span>
                        <ConfidenceBadge confidence={g.confidence} categorySource={g.categorySource} />
                      </div>

                      <p className="text-zinc-500 dark:text-zinc-600 text-xs truncate mt-0.5">
                        {g.merchantRaw}
                      </p>

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-zinc-500 dark:text-zinc-500 text-xs">
                          {g.count} transaction{g.count !== 1 ? 's' : ''}
                          {' · '}
                          <span className="text-zinc-900 dark:text-zinc-200 font-medium">
                            {formatCurrency(Math.abs(g.total))}
                          </span>
                        </span>

                        {/* Current AI/keyword suggestion chip */}
                        {hasAiSuggestion && (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            AI suggests:
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-px rounded-full font-medium"
                              style={pillStyle(g.suggestedCategory)}
                            >
                              <CategoryIcon category={g.suggestedCategory} className="w-3 h-3 shrink-0" />
                              {g.suggestedCategory}
                            </span>
                          </span>
                        )}

                        {isP2P && (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                            Transfer or expense?
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: category picker + actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <CategorySelect
                        merchantRaw={g.merchantRaw}
                        value={cat}
                        onChange={(newCat, isNew) => {
                          if (isNew && onAddCategory) onAddCategory(newCat);
                          setSelected((s) => ({ ...s, [g.merchantRaw]: newCat }));
                        }}
                        onIdentify={onIdentifyMerchant}
                        geminiModel={settings?.geminiModel}
                        customCategories={settings?.categories ?? []}
                      />

                      <button
                        onClick={() => handleConfirm(g.merchantRaw)}
                        disabled={!cat}
                        className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
                      >
                        {hasAiSuggestion && !selected[g.merchantRaw] ? 'Confirm' : 'Save'}
                      </button>

                      <button
                        onClick={() => handleDismiss(g.merchantRaw)}
                        className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        title="Dismiss for now"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {g.count > 1 && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-2 pl-0.5">
                      Will apply to all {g.count} transactions from this merchant.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
