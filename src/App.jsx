import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from './lib/router.js';
import { storage } from './lib/storage.js';
import { applySync as _applySync } from './lib/categorizer.js';
import { categorizeMerchants, testGeminiKey, fetchModels, identifyMerchant } from './lib/gemini.js';
import { enrichWithTrove, enrichOne } from './lib/trove.js';
import Dashboard from './components/Dashboard.jsx';
import CategoryDrawer from './components/CategoryDrawer.jsx';
import TransactionsPage from './components/TransactionsPage.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import EnrichPage from './components/EnrichPage.jsx';
import AIFloater from './components/AIFloater.jsx';
import ImportSlideOver from './components/ImportSlideOver.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';

const TABS = ['Dashboard', 'Transactions', 'Enrich', 'Settings'];

// Subtab display-name ↔ URL-key mappings
const SETTINGS_SUBTABS = { general: 'General', budgets: 'Budgets', cards: 'Cards', ai: 'AI', rules: 'Rules', imports: 'Imports', banks: 'Banks' };
const SETTINGS_SUBTAB_KEYS = Object.fromEntries(Object.entries(SETTINGS_SUBTABS).map(([k, v]) => [v, k]));

export default function App() {
  const { tab: routeTab, subtab: routeSubtab, navigate } = useRouter();

  // Derive display tab name from route
  const tabMap = { dashboard: 'Dashboard', transactions: 'Transactions', enrich: 'Enrich', settings: 'Settings' };
  const tab = tabMap[routeTab] ?? 'Dashboard';

  // Sub-tab active values (Title-cased for components)
  const settingsActiveTab = SETTINGS_SUBTABS[routeSubtab] ?? 'General';

  const [transactions, setTransactions] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [settings, setSettings] = useState({ salary: 0, payday: 15, categories: [] });
  const [dashboardMonth, setDashboardMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [transactionsMonth, setTransactionsMonth] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFeedback, setImportFeedback] = useState(null);
  const [overrideUndo, setOverrideUndo] = useState(null); // { merchantRaw, label, prevOverride }
  const overrideUndoTimer = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryDrawer, setCategoryDrawer] = useState(null); // category string or null
  const [troveProgress, setTroveProgress] = useState(null); // null | { done, total }
  const [rules, setRules] = useState([]);
  const rulesRef = useRef([]);
  // Keep ref in sync so callbacks never see stale rules
  useEffect(() => { rulesRef.current = rules; }, [rules]);
  // Wrapper around _applySync that always uses latest rules from ref
  const applySync = useCallback((txs, ovrs) => _applySync(txs, ovrs, rulesRef.current), []);

  const [plaidItems, setPlaidItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });
  const initialized = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Cmd+K
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const refreshPlaidItems = useCallback(() => {
    storage.plaid.getItems().then(setPlaidItems).catch(() => {});
  }, []);

  // Load from API on mount — applySync so displayName/domain from overrides are applied
  useEffect(() => {
    Promise.all([storage.getTransactions(), storage.getOverrides(), storage.getSettings(), storage.plaid.getItems().catch(() => []), storage.getRules().catch(() => [])])
      .then(([txs, ovrs, stgs, items, loadedRules]) => {
        // Migrate: old Trove enrichments stored domain: null — set sentinel so they aren't re-queued
        let migratedOvrs = ovrs;
        const needsMigration = Object.values(ovrs).some((v) => v.source === 'trove' && !v.domain);
        if (needsMigration) {
          migratedOvrs = Object.fromEntries(
            Object.entries(ovrs).map(([raw, val]) => [
              raw,
              val.source === 'trove' && !val.domain ? { ...val, domain: 'unknown' } : val,
            ])
          );
          storage.setOverrides(migratedOvrs).catch(() => {});
        }
        rulesRef.current = loadedRules;
        setRules(loadedRules);
        setTransactions(_applySync(txs, migratedOvrs, loadedRules));
        setOverrides(migratedOvrs);
        setSettings(stgs);
        setPlaidItems(items);
        initialized.current = true;
        setLoading(false);

        // Auto-sync Plaid items if any are connected and stale (> 1 hour)
        if (items.length > 0) {
          const stale = items.some((item) => {
            if (!item.last_synced) return true;
            return Date.now() - new Date(item.last_synced).getTime() > 60 * 60 * 1000;
          });
          if (stale) {
            storage.plaid.sync().then(() => {
              storage.getTransactions().then((fresh) => setTransactions(applySync(fresh, migratedOvrs)));
              storage.plaid.getItems().then(setPlaidItems).catch(() => {});
            }).catch(() => {});
          }
        }
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { if (initialized.current) storage.setTransactions(transactions); }, [transactions]);
  useEffect(() => {
    if (initialized.current) {
      const withDomain = Object.values(overrides).filter(v => v.domain && v.domain !== 'unknown').length;
      console.log(`[auto-save effect] writing overrides: ${Object.keys(overrides).length} total, ${withDomain} with domain`);
      storage.setOverrides(overrides);
    }
  }, [overrides]);
  useEffect(() => { if (initialized.current) storage.setSettings(settings); }, [settings]);

  // Trove enrichment — runs automatically after import for any merchant without a domain.
  // Persists overrides incrementally after each merchant so a mid-run refresh loses nothing.
  const runTroveEnrichment = useCallback(async (txs, currentOverrides, { allMerchants = false, onProgress } = {}) => {
    const toEnrich = [...new Set(
      txs
        .filter((tx) => allMerchants
          ? !currentOverrides[tx.merchantRaw]?.domain
          : tx.categorySource === 'uncategorized')
        .map((tx) => tx.merchantRaw)
        .filter((raw) => !currentOverrides[raw]?.domain)
    )];
    if (!toEnrich.length) return currentOverrides;

    const now = Date.now();
    // Mutable object — shared across closures so onEach always sees the latest merged state
    const state = { merged: { ...currentOverrides }, enriched: 0, total: toEnrich.length };
    setTroveProgress({ done: 0, total: toEnrich.length });

    const onEach = (merchantRaw, data) => {
      const existing = state.merged[merchantRaw];
      const keepCategory = existing?.source === 'user';
      state.merged = {
        ...state.merged,
        [merchantRaw]: {
          category:    keepCategory ? existing.category : (data.category ?? existing?.category ?? 'Other'),
          source:      keepCategory ? 'user' : (data.category ? 'trove' : (existing?.source ?? 'trove')),
          savedAt:     existing?.savedAt ?? now,
          displayName: data.displayName ?? existing?.displayName ?? null,
          // Use sentinel 'unknown' when Trove matched but had no domain — prevents re-trying every run
          domain:      data.domain ?? existing?.domain ?? 'unknown',
          logo:        data.logo ?? existing?.logo ?? null,
        },
      };
      state.enriched++;
      // Debug: verify domain/logo before sending to API
      const entry = state.merged[merchantRaw];
      console.log(`[onEach] ${merchantRaw.slice(0, 40)} → domain=${entry.domain}, logo=${entry.logo?.slice(0, 60) ?? 'null'}`);
      const withDomain = Object.values(state.merged).filter(v => v.domain && v.domain !== 'unknown').length;
      console.log(`[onEach] Total overrides with domain: ${withDomain}/${Object.keys(state.merged).length}`);
      // Persist directly to the API — bypasses React re-render cycle so tab/refresh is safe
      storage.setOverrides(state.merged).catch((e) => console.error('[onEach] storage.setOverrides FAILED:', e));
      // Also update React state so UI reflects the new override immediately
      setOverrides(state.merged);
      // Re-apply applySync so tx.domain updates for logo display
      setTransactions((prev) => applySync(prev, state.merged));
    };

    const onTick = (processed, total, enrichedSoFar) => {
      setTroveProgress({ done: processed, total, enriched: enrichedSoFar });
      onProgress?.(`Enriching merchants… (${processed}/${total}, ${enrichedSoFar} matched)`);
    };

    try {
      await enrichWithTrove(toEnrich, { onTick, onEach });
    } catch (e) {
      console.warn('Trove error:', e);
    }

    // Mark all attempted-but-unmatched merchants with 'unknown' so they aren't re-queued next run
    for (const raw of toEnrich) {
      if (!state.merged[raw]?.domain) {
        state.merged = {
          ...state.merged,
          [raw]: {
            ...(state.merged[raw] ?? {}),
            domain: 'unknown',
            source: state.merged[raw]?.source ?? 'trove',
            savedAt: state.merged[raw]?.savedAt ?? now,
          },
        };
      }
    }

    // Final authoritative save of everything collected (successes + 'unknown' sentinels)
    await storage.setOverrides(state.merged).catch(() => {});
    setOverrides(state.merged);
    setTransactions((prev) => applySync(prev, state.merged));
    setTroveProgress(null);
    setAiStatus(state.enriched > 0
      ? `Trove: enriched ${state.enriched} of ${toEnrich.length} merchants`
      : `Trove: no matches found for ${toEnrich.length} merchants`
    );
    setTimeout(() => setAiStatus(''), 6000);
    return state.merged;
  }, []);

  const runGemini = useCallback(async (txs, currentOverrides) => {
    const uncategorized = [...new Set(
      txs.filter((tx) => tx.categorySource === 'uncategorized').map((tx) => tx.merchantRaw)
    )];
    if (!uncategorized.length) return;
    const model = settings.geminiModel;
    if (!model) { setAiStatus('No AI model selected — pick one in Settings'); return; }
    setAiStatus(`Categorizing ${uncategorized.length} merchant${uncategorized.length !== 1 ? 's' : ''} with AI…`);
    try {
      const { overrides: newEntries } = await categorizeMerchants(uncategorized, model);
      if (Object.keys(newEntries).length === 0) { setAiStatus(''); return; }
      // Merge Gemini results — skip user-overridden merchants, preserve Trove enrichment data
      const merged = { ...currentOverrides };
      for (const [raw, entry] of Object.entries(newEntries)) {
        const existing = merged[raw] ?? {};
        if (existing.source === 'user') continue; // never overwrite user choices
        merged[raw] = {
          ...existing,
          ...entry,
          // Trove enrichment data takes priority when present
          ...(existing.displayName ? { displayName: existing.displayName } : {}),
          ...(existing.domain ? { domain: existing.domain } : {}),
          ...(existing.logo ? { logo: existing.logo } : {}),
        };
      }
      setOverrides(merged);
      setTransactions((prev) => applySync(prev, merged));
      setAiStatus('');
    } catch (e) {
      setAiStatus(`AI error: ${e.message}`);
    }
  }, [settings]);

  // Bulk AI enrichment — called from AIPage panel, processes all merchants missing AI data.
  // After Gemini categorization, chains Trove enrichment for domain/logo on merchants that lack it.
  const runBulkAI = useCallback(async (txs, currentOverrides, { allMerchants = false, onProgress } = {}) => {
    const model = settings.geminiModel;
    if (!model) { setAiStatus('No AI model selected — pick one in Settings'); return currentOverrides; }

    const toEnrich = [...new Set(
      txs
        .map((tx) => tx.merchantRaw)
        .filter((raw) => {
          const ov = currentOverrides[raw];
          if (ov?.source === 'user') return false; // always protect user choices
          if (allMerchants) return !ov?.description;
          return !ov?.description && (!ov?.source || ov.source === 'uncategorized' || ov.source === 'bank' || ov.source === 'keyword');
        })
    )];
    if (!toEnrich.length) return currentOverrides;

    // Step 1: Gemini categorization
    onProgress?.(`Categorizing ${toEnrich.length} merchants with AI…`);
    setAiStatus(`AI: categorizing ${toEnrich.length} merchants…`);

    let merged = { ...currentOverrides };
    let aiMatched = 0;
    try {
      const { overrides: newEntries } = await categorizeMerchants(toEnrich, model);
      aiMatched = Object.keys(newEntries).length;
      for (const [raw, entry] of Object.entries(newEntries)) {
        const existing = merged[raw] ?? {};
        merged[raw] = {
          ...existing,
          ...entry,
          ...(existing.displayName ? { displayName: existing.displayName } : {}),
          ...(existing.domain ? { domain: existing.domain } : {}),
          ...(existing.logo ? { logo: existing.logo } : {}),
        };
      }
      setOverrides(merged);
      setTransactions((prev) => applySync(prev, merged));
      storage.setOverrides(merged).catch(() => {});
    } catch (e) {
      const msg = `AI error: ${e.message}`;
      setAiStatus(msg);
      onProgress?.(msg);
      return currentOverrides;
    }

    // Step 2: Chain Trove for domain/logo on merchants that still lack it
    const needTrove = toEnrich.filter((raw) => !merged[raw]?.domain || merged[raw]?.domain === 'unknown');
    if (needTrove.length > 0) {
      onProgress?.(`AI done (${aiMatched} categorized). Fetching logos for ${needTrove.length} merchants…`);
      setAiStatus(`Fetching logos for ${needTrove.length} merchants…`);
      try {
        const troveResult = await enrichWithTrove(needTrove, {
          onTick: (done, total, enriched) => {
            onProgress?.(`Fetching logos… (${done}/${total}, ${enriched} found)`);
          },
          onEach: (merchantRaw, data) => {
            const existing = merged[merchantRaw] ?? {};
            merged = {
              ...merged,
              [merchantRaw]: {
                ...existing,
                domain: data.domain ?? existing.domain ?? 'unknown',
                logo: data.logo ?? existing.logo ?? null,
                ...(data.displayName && !existing.displayName ? { displayName: data.displayName } : {}),
              },
            };
            setOverrides(merged);
            storage.setOverrides(merged).catch(() => {});
          },
        });
      } catch (e) {
        console.warn('Trove chain error:', e);
      }
      setTransactions((prev) => applySync(prev, merged));
    }

    const msg = `AI: enriched ${aiMatched} of ${toEnrich.length} merchants`;
    setAiStatus(msg);
    onProgress?.(msg);
    setTimeout(() => setAiStatus(''), 6000);
    return merged;
  }, [settings.geminiModel]);

  // Single-merchant Trove enrichment — called from transaction row action
  const handleEnrichOne = useCallback(async (merchantRaw) => {
    const apiKey = import.meta.env.VITE_TROVE_API_KEY;
    if (!apiKey) return { ok: false, message: 'VITE_TROVE_API_KEY not set' };
    const result = await enrichOne(merchantRaw, apiKey);
    if (!result) return { ok: false, message: 'No match found' };
    const existing = overrides[merchantRaw] ?? {};
    const keepCategory = existing.source === 'user';
    const newOverrides = {
      ...overrides,
      [merchantRaw]: {
        category: keepCategory ? existing.category : (result.category ?? existing.category ?? 'Other'),
        source: keepCategory ? 'user' : (result.category ? 'trove' : (existing.source ?? 'trove')),
        savedAt: existing.savedAt ?? Date.now(),
        displayName: result.displayName ?? existing.displayName ?? null,
        domain: result.domain ?? existing.domain ?? 'unknown',
        logo: result.logo ?? existing.logo ?? null,
      },
    };
    setOverrides(newOverrides);
    setTransactions((prev) => applySync(prev, newOverrides));
    storage.setOverrides(newOverrides).catch(() => {});
    return { ok: true, data: result };
  }, [overrides]);

  // Single-merchant Gemini categorization — called from transaction row action
  // Also chains a Trove call to fill in domain/logo (Gemini can't provide those).
  const handleCategorizeMerchant = useCallback(async (merchantRaw) => {
    // Run Gemini + Trove in parallel
    const troveApiKey = import.meta.env.VITE_TROVE_API_KEY;
    const [aiResult, troveResult] = await Promise.all([
      identifyMerchant(merchantRaw, settings.geminiModel),
      troveApiKey ? enrichOne(merchantRaw, troveApiKey) : Promise.resolve(null),
    ]);

    if (!aiResult.ok) return aiResult;

    const existing = overrides[merchantRaw] ?? {};
    const newOverrides = {
      ...overrides,
      [merchantRaw]: {
        ...existing,
        // AI data
        ...(aiResult.suggestedCategory ? { category: aiResult.suggestedCategory, source: 'ai' } : {}),
        savedAt: Date.now(),
        ...(aiResult.displayName ? { displayName: aiResult.displayName } : {}),
        ...(aiResult.description ? { description: aiResult.description } : {}),
        // Trove data (domain/logo) — takes priority for display name too
        ...(troveResult?.domain ? { domain: troveResult.domain } : {}),
        ...(troveResult?.logo ? { logo: troveResult.logo } : {}),
        ...(troveResult?.displayName ? { displayName: troveResult.displayName } : {}),
      },
    };
    setOverrides(newOverrides);
    setTransactions((prev) => applySync(prev, newOverrides));
    storage.setOverrides(newOverrides).catch(() => {});
    return aiResult;
  }, [overrides, settings.geminiModel]);

  async function handleNewTransactions(results) {
    let totalAdded = 0;
    let totalSkipped = 0;
    const newlyAdded = [];
    const existingIds = new Set(transactions.map((tx) => tx.id));

    for (const r of results) {
      const importId = r.importId; // assigned by ImportSlideOver (crypto.randomUUID)
      const dates = r.transactions.map((tx) => tx.date).filter(Boolean).sort();

      try {
        // 1. Create import audit record first (batch insert FKs against it)
        await storage.addImport({
          id: importId,
          filename: r.fileName ?? '',
          bank: r.bank,
          dateFrom: dates[0] ?? null,
          dateTo: dates[dates.length - 1] ?? null,
          rowsParsed: r.transactions.length,
          rowsAdded: 0,   // will be recomputed server-side after batch
          rowsSkipped: 0,
          balanceOpening: r.balances?.opening ?? null,
          balanceClosing: r.balances?.closing ?? null,
        });

        // 2. Batch insert — INSERT OR IGNORE, server returns actual counts
        const batchResult = await storage.batchImport(importId, r.transactions);
        totalAdded += batchResult.added;
        totalSkipped += batchResult.skipped;

        // 3. Update import record with real counts + recompute balance verification
        storage.addImport({
          id: importId,
          filename: r.fileName ?? '',
          bank: r.bank,
          dateFrom: dates[0] ?? null,
          dateTo: dates[dates.length - 1] ?? null,
          rowsParsed: r.transactions.length,
          rowsAdded: batchResult.added,
          rowsSkipped: batchResult.skipped,
          balanceOpening: r.balances?.opening ?? null,
          balanceClosing: r.balances?.closing ?? null,
        }).catch(() => {});

        // Tag new transactions with their importId
        const added = r.transactions
          .filter((tx) => !existingIds.has(tx.id))
          .map((tx) => ({ ...tx, importId }));
        newlyAdded.push(...added);
        added.forEach((tx) => existingIds.add(tx.id));
      } catch {
        // Fallback: local dedup if API is unavailable
        const fallback = r.transactions.filter((tx) => !existingIds.has(tx.id));
        totalAdded += fallback.length;
        totalSkipped += r.transactions.length - fallback.length;
        newlyAdded.push(...fallback);
        fallback.forEach((tx) => existingIds.add(tx.id));
      }
    }

    const merged = [...transactions, ...newlyAdded].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const categorized = applySync(merged, overrides);
    setTransactions(categorized);
    setImportFeedback({ imported: totalAdded, skipped: totalSkipped });
    setTimeout(() => setImportFeedback(null), 6000);

    // Run Trove first (canonical names + logos + categories), then Gemini on remaining unknowns.
    // Overrides are persisted incrementally inside runTroveEnrichment — a refresh mid-run loses nothing.
    (async () => {
      const troveOverrides = await runTroveEnrichment(categorized, overrides);
      // Always re-apply to transactions at the end (Trove may have enriched many merchants)
      const reCategorized = applySync(categorized, troveOverrides);
      setTransactions(reCategorized);
      runGemini(reCategorized, troveOverrides);
    })();
  }

  function handleOverride(merchantRaw, category) {
    const prevOverride = overrides[merchantRaw] ?? null;
    const existing = overrides[merchantRaw] ?? {};
    const newOverrides = {
      ...overrides,
      [merchantRaw]: {
        category,
        source: 'user',
        savedAt: Date.now(),
        // Preserve Trove enrichment data even when user changes the category
        ...(existing.displayName ? { displayName: existing.displayName } : {}),
        ...(existing.domain ? { domain: existing.domain } : {}),
        ...(existing.logo ? { logo: existing.logo } : {}),
      },
    };
    setOverrides(newOverrides);
    setTransactions((prev) => applySync(prev, newOverrides));
    // Show undo toast
    clearTimeout(overrideUndoTimer.current);
    setOverrideUndo({ merchantRaw, category, prevOverride });
    overrideUndoTimer.current = setTimeout(() => setOverrideUndo(null), 6000);
  }

  function handleUndoOverride() {
    if (!overrideUndo) return;
    clearTimeout(overrideUndoTimer.current);
    const { merchantRaw, prevOverride } = overrideUndo;
    let newOverrides;
    if (prevOverride) {
      newOverrides = { ...overrides, [merchantRaw]: prevOverride };
    } else {
      const { [merchantRaw]: _, ...rest } = overrides;
      newOverrides = rest;
    }
    setOverrides(newOverrides);
    setTransactions((prev) => applySync(prev, newOverrides));
    setOverrideUndo(null);
  }

  function handleUpdateNote(txId, note) {
    setTransactions((prev) =>
      prev.map((tx) => tx.id === txId ? { ...tx, notes: note } : tx)
    );
  }

  function handleDeleteOverride(merchantRaw) {
    const { [merchantRaw]: _, ...rest } = overrides;
    setOverrides(rest);
    setTransactions((prev) => applySync(prev, rest));
  }

  function handleSaveSettings(newSettings) {
    setSettings((s) => ({ ...s, ...newSettings }));
  }

  function handleAddCategory(name) {
    const current = settings.categories ?? [];
    if (!current.includes(name)) handleSaveSettings({ categories: [...current, name] });
  }

  function handleUpdateAiUsage(aiUsage) {
    handleSaveSettings({ aiUsage });
  }

  async function handleCreateRule(rule) {
    try {
      const { id } = await storage.createRule(rule);
      const newRule = { ...rule, id, hit_count: 0, created_at: new Date().toISOString() };
      const updated = [...rules, newRule];
      setRules(updated);
      setTransactions((prev) => applySync(prev, overrides));
    } catch (e) {
      console.error('createRule failed:', e);
    }
  }

  async function handleDeleteRule(id) {
    await storage.deleteRule(id).catch(() => {});
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    setTransactions((prev) => applySync(prev, overrides));
  }

  function handleClearData() {
    setTransactions([]);
    setOverrides({});
    setImportFeedback(null);
    setOverrideUndo(null);
    setDashboardMonth('');
    setTransactionsMonth('');
    storage.clearAll().then(() => refreshPlaidItems());
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 dark:text-zinc-600 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  const uncategorizedCount = [...new Set(
    transactions.filter((tx) => tx.categorySource === 'uncategorized').map((tx) => tx.merchantRaw)
  )].length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 flex flex-col">
      <GlobalSearch transactions={transactions} open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CategoryDrawer
        category={categoryDrawer}
        month={dashboardMonth}
        transactions={transactions}
        overrides={overrides}
        settings={settings}
        onClose={() => setCategoryDrawer(null)}
        onOverride={handleOverride}
        onMonthChange={setDashboardMonth}
        onAddCategory={handleAddCategory}
      />
      <ImportSlideOver
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onTransactions={handleNewTransactions}
        transactions={transactions}
        plaidItems={plaidItems}
        onPlaidConnected={() => {
          refreshPlaidItems();
          storage.getTransactions().then((txs) => setTransactions(applySync(txs, overrides)));
        }}
      />

      {/* Nav */}
      <header className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-13 flex items-center gap-6" style={{ height: 52 }}>
          {/* Logo */}
          <div className="shrink-0 flex items-center gap-2.5">
            <div className="w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm tracking-tight">Budget</span>
          </div>

          {/* Nav items — hidden on mobile, shown on sm+ */}
          <nav className="hidden sm:flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (t === 'Settings') navigate('settings', SETTINGS_SUBTAB_KEYS[settingsActiveTab] ?? 'general');
                  else navigate(t.toLowerCase());
                }}
                className={`relative px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  tab === t ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {t}
                {tab === t && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 bg-zinc-100 dark:bg-zinc-800 rounded-lg -z-10"
                    transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Trove background progress pill */}
            {troveProgress && (
              <div className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40 rounded-full px-2.5 py-1 text-xs text-violet-600 dark:text-violet-400">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
                Trove {troveProgress.done}/{troveProgress.total}
                {troveProgress.enriched > 0 && (
                  <span className="text-violet-400 dark:text-violet-500">· {troveProgress.enriched} matched</span>
                )}
              </div>
            )}
            {/* Theme toggle */}
            <button
              onClick={() => setDark((d) => !d)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs transition-colors"
              onClick={() => setSearchOpen(true)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
              </svg>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline border border-zinc-300 dark:border-zinc-700 rounded px-1 text-zinc-500 dark:text-zinc-600" style={{ fontSize: 10 }}>⌘K</kbd>
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 pb-24 sm:pb-6">

        {tab === 'Dashboard' && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-5 py-32 text-center">
            <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <p className="text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 font-medium mb-1">No transactions yet</p>
              <p className="text-zinc-500 dark:text-zinc-600 text-sm">Import a CSV from Chase, Capital One, or Discover to get started.</p>
            </div>
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
              onClick={() => setImportOpen(true)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </button>
          </div>
        )}

        {tab === 'Dashboard' && transactions.length > 0 && (
          <Dashboard
            transactions={transactions}
            overrides={overrides}
            settings={settings}
            selectedMonth={dashboardMonth}
            onOverride={handleOverride}
            onMonthChange={setDashboardMonth}
            onIdentifyMerchant={(merchantRaw) => identifyMerchant(merchantRaw, settings.geminiModel)}
            onAddCategory={handleAddCategory}
            onCategoryClick={setCategoryDrawer}
            onCreateRule={handleCreateRule}
          />
        )}

        {tab === 'Transactions' && (
          <TransactionsPage
            transactions={transactions}
            overrides={overrides}
            settings={settings}
            selectedMonth={transactionsMonth}
            onOverride={handleOverride}
            onMonthChange={setTransactionsMonth}
            onIdentifyMerchant={(merchantRaw) => identifyMerchant(merchantRaw, settings.geminiModel)}
            onAddCategory={handleAddCategory}
            onUpdateNote={handleUpdateNote}
            onEnrichOne={handleEnrichOne}
            onCategorizeMerchant={handleCategorizeMerchant}
          />
        )}

        {tab === 'Enrich' && (
          <EnrichPage
            transactions={transactions}
            overrides={overrides}
            settings={settings}
            onRunTrove={async (onProgress) => {
              const merged = await runTroveEnrichment(transactions, overrides, { allMerchants: true, onProgress });
              setTransactions((prev) => applySync(prev, merged ?? overrides));
            }}
            onRunBulkAI={async (onProgress) => {
              const merged = await runBulkAI(transactions, overrides, { allMerchants: true, onProgress });
              setTransactions((prev) => applySync(prev, merged ?? overrides));
            }}
          />
        )}

        {tab === 'Settings' && (
          <SettingsPage
            settings={settings}
            onSave={handleSaveSettings}
            onClearData={handleClearData}
            uncategorizedCount={uncategorizedCount}
            onRunAI={() => runGemini(transactions, overrides)}
            onTestAI={testGeminiKey}
            onFetchModels={fetchModels}
            overrides={overrides}
            onUpdateOverride={handleOverride}
            onDeleteOverride={handleDeleteOverride}
            onIdentify={(merchantRaw) => identifyMerchant(merchantRaw, settings.geminiModel)}
            onAddCategory={handleAddCategory}
            activeTab={settingsActiveTab}
            onTabChange={(t) => navigate('settings', SETTINGS_SUBTAB_KEYS[t] ?? t.toLowerCase())}
            onTransactionsChanged={async () => {
              const txs = await storage.getTransactions();
              setTransactions(txs);
            }}
            plaidItems={plaidItems}
            onPlaidRefresh={() => {
              refreshPlaidItems();
              storage.getTransactions().then((txs) => setTransactions(applySync(txs, overrides)));
            }}
            rules={rules}
            onCreateRule={handleCreateRule}
            onDeleteRule={handleDeleteRule}
          />
        )}
      </main>

      {/* Mobile bottom tab bar — sm+ hidden */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-t border-zinc-200 dark:border-zinc-800 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[
          {
            key: 'dashboard',
            label: 'Dashboard',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5h8.25M3 9h18M3 4.5h18M12 18.75h9" />
                <rect x="3" y="13.5" width="5.25" height="5.25" rx="1" strokeWidth={1.8} />
              </svg>
            ),
          },
          {
            key: 'transactions',
            label: 'Transactions',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            ),
          },
          {
            key: 'enrich',
            label: 'Enrich',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            ),
          },
          {
            key: 'settings',
            label: 'Settings',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
          },
        ].map(({ key, label, icon }) => {
          const isActive = routeTab === key;
          return (
            <button
              key={key}
              onClick={() => {
                if (key === 'settings') navigate('settings', SETTINGS_SUBTAB_KEYS[settingsActiveTab] ?? 'general');
                else navigate(key);
              }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                isActive
                  ? 'text-indigo-500 dark:text-indigo-400'
                  : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
              }`}
            >
              {icon}
              <span className="text-[10px] font-medium leading-none">{label}</span>
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-dot"
                  className="w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400"
                  transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* AI status toast */}
      <AnimatePresence>
        {aiStatus && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-5 right-5 z-50 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 shadow-xl flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            {aiStatus}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Override undo toast */}
      <AnimatePresence>
        {overrideUndo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-zinc-400 shadow-xl flex items-center gap-3"
          >
            <span>Categorized as <span className="text-zinc-900 dark:text-zinc-100 font-medium">{overrideUndo.category}</span></span>
            <button
              onClick={handleUndoOverride}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Undo
            </button>
            <button onClick={() => setOverrideUndo(null)} className="text-zinc-500 hover:text-zinc-400 ml-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating AI assistant */}
      <AIFloater
        transactions={transactions}
        overrides={overrides}
        settings={settings}
        currentPage={routeTab}
        dark={dark}
        onOverride={handleOverride}
        onAddCategory={handleAddCategory}
        onUpdateSettings={handleSaveSettings}
        onUpdateUsage={handleUpdateAiUsage}
      />

      {/* Import feedback toast */}
      <AnimatePresence>
        {importFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-5 py-3 text-sm text-zinc-400 dark:text-zinc-700 dark:text-zinc-300 shadow-xl flex items-center gap-3"
          >
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>
              Imported <span className="text-zinc-900 dark:text-zinc-100 font-medium">{importFeedback.imported}</span> transactions
              {importFeedback.skipped > 0 && <>, skipped <span className="text-zinc-500">{importFeedback.skipped} duplicates</span></>}
            </span>
            <button onClick={() => setImportFeedback(null)} className="text-zinc-500 dark:text-zinc-600 hover:text-zinc-400 ml-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
