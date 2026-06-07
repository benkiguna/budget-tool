# Transaction Categorization — Implementation Tracker

> Adapted from `transaction-categorization-plan.md` for the current stack:
> **React + Vite · Express.js · LibSQL/Turso · Gemini AI · Plaid · Trove**

---

## Stack Reality vs Plan

| Plan assumes | Actual stack |
|---|---|
| PostgreSQL | LibSQL (Turso) via Express REST API |
| Plaid as sole source | Plaid + CSV import (Chase, CapOne, Discover, Amex, WellsFargo, BofA) |
| Node.js backend only | Express backend (`server/`) + React frontend (`src/`) |
| `@google/generative-ai` SDK | Raw fetch to Gemini API (`src/lib/gemini.js`) |
| localStorage | SQLite file via libsql client |

---

## Key Files

```
server/
  db.js            — LibSQL schema + migrations
  index.js         — Express REST API routes
  routes/plaid.js  — Plaid webhook + sync
src/
  lib/
    categorizer.js — CATEGORIES + 4-stage waterfall
    gemini.js      — Gemini API calls
    storage.js     — REST API client
  data/
    keywordRules.js
    bankCategoryMap.js
  components/
    Dashboard.jsx
    TransactionsPage.jsx
    SettingsPage.jsx
    EnrichPage.jsx
```

---

## Phase 1 — Financial Domain Model & Pipeline Hardening
**Exit criterion:** Every transaction carries explicit `transactionType`, `pnlImpact`, and `confidence` fields. No transfer ever appears in expense totals.

### Schema
- [x] Add `transactionType TEXT` to transactions table — EXPENSE, INCOME, TRANSFER, INVESTMENT_BUY, INVESTMENT_SELL, CREDIT_CARD_PAY, REFUND, UNCATEGORIZED
- [x] Add `pnlImpact INTEGER` (0/1 boolean) — 1 = hits P&L, 0 = balance-sheet only
- [x] Add `confidence REAL` — 0.0–1.0 per-assignment confidence
- [x] Add `categoryReason TEXT` — human-readable explanation of why this category was assigned

### Categorizer (`src/lib/categorizer.js`)
- [x] Add `CATEGORY_TYPE_MAP` — maps each category to `{ transactionType, pnlImpact }`
- [x] Update `categorizeOne()` to return `{ category, categorySource, confidence, categoryReason, transactionType, pnlImpact }`
- [x] Confidence by source: user=1.0, bank=0.9, keyword=0.85, ai=0.75, uncategorized=0.0
- [x] Update `applySync()` to populate all new fields on each transaction

### API (`server/index.js`)
- [x] Include `transactionType`, `pnlImpact`, `confidence`, `categoryReason` in INSERT statements
- [x] Return all new fields from GET /api/transactions

### Gemini (`src/lib/gemini.js`)
- [x] Update `categorizeMerchants()` prompt to request confidence from AI
- [x] Parse confidence from AI response; store in override as `confidence` field
- [x] Pass AI confidence through to `applySync()` override lookup

---

## Phase 2 — Confidence Scoring & Review Queue
**Exit criterion:** >85% of transactions auto-categorized. Low-confidence transactions surface in a review queue.

### Schema
- [x] Add `categorization_audit` table: `(id, transaction_id, layer, input_snapshot, output, confidence, created_at)`

### Categorizer
- [x] Peer-to-peer detection: Venmo / Zelle / Cash App / Apple Cash / Google Pay Send → cap `confidence = 0.4`, route to review
- [ ] Unusual amount detection: > 3× rolling avg for category → flag for review

### Review Queue UI
- [x] `ReviewQueue.jsx` — list merchants where `confidence < 0.65` or `categorySource = 'uncategorized'`
- [x] Sort by absolute amount descending (most impactful first)
- [x] Group by merchant: "N transactions from Venmo — categorize once, apply to all"
- [x] Pre-fill AI suggestion when source is 'ai' — shows suggestion chip + "Confirm" button
- [x] P2P hint: "Transfer or expense?" label for Venmo/Zelle/CashApp groups
- [x] Dismiss button: skip a merchant without categorizing
- [x] After user picks → calls `onOverride(merchantRaw, category)` → stored as user override
- [x] Wired into Dashboard.jsx, replaces UnresolvedMerchants

### Dashboard
- [x] Review queue shown at top of Dashboard when any merchants need review
- [ ] Count badge on nav tab when review queue is non-empty
- [ ] Unusual amount detection (>3× rolling avg) — deferred to Phase 3

---

## Phase 3 — Rule Learning & Merchant Intelligence
**Exit criterion:** Returning users see <5% of transactions in the review queue.

### Schema
- [x] Add `categorization_rules` table: `(id, priority, rule_type, match_value, amount_min, amount_max, category, created_from, hit_count, created_at)`
  - `rule_type`: MERCHANT_EXACT, MERCHANT_CONTAINS, DESCRIPTION_REGEX, AMOUNT_RANGE
  - `created_from`: USER_MANUAL, LEARNED_FROM_CORRECTION
- [ ] Add `merchant_intelligence` table — deferred (overrides table already covers this use-case)

### Categorizer
- [x] Stage 2: Apply `categorization_rules` before bank/keyword rules (priority-ordered, first match wins)
- [x] Rule source is 'rule', confidence = 0.95
- [x] `applySync(transactions, overrides, rules = [])` — backward compatible third arg

### API
- [x] GET `/api/rules` — fetch all rules sorted by priority
- [x] POST `/api/rules` — create rule, return id
- [x] DELETE `/api/rules/:id` — delete rule
- [x] PATCH `/api/rules/:id/hit` — increment hit count (for future telemetry)
- [x] Rules cleared on DELETE `/api/data`

### App.jsx
- [x] Load rules on startup alongside transactions/overrides
- [x] `rulesRef` keeps rules accessible in all callbacks without stale closures
- [x] `applySync` wrapper uses `rulesRef.current` — all existing call sites updated transparently
- [x] `handleCreateRule` / `handleDeleteRule` — persist to API + update state + re-run applySync
- [x] Pass `onCreateRule` / `onDeleteRule` to Dashboard and SettingsPage

### UI
- [x] `RulesEditor.jsx` — add/delete rules with type selector, match value, category picker, priority
  - Rule types: Contains, Exact, Regex, Amount Range
  - Source badge: Manual vs Learned
  - Hit count display
- [x] Settings Rules tab: CategoryEditor (overrides) + RulesEditor (pattern rules) stacked
- [x] ReviewQueue: after confirming a category, offers "Create Rule" banner
  - Editable keyword (default: extracted from merchant name)
  - Creates MERCHANT_CONTAINS rule with `created_from = LEARNED_FROM_CORRECTION`
- [ ] "Apply to all similar" bulk action in TransactionTable — deferred to Phase 4

---

## Phase 4 — Reporting & Polish
**Exit criterion:** Full P&L with category drill-down; net worth view; budget alerts.

### Reporting
- [x] P&L statement tab — `PLStatement.jsx` filters on `pnlImpact !== false`; income + expense breakdown by category with progress bars
- [x] Monthly income vs expense table with net column; 6-month history; highlighted active period
- [ ] Savings rate calculation excludes transfers

### Net Worth
- [ ] Net worth dashboard tab — assets vs liabilities
- [ ] Plaid account balances displayed per account type (depository, credit, investment)
- [ ] Outstanding loans given tracking

### Budget Alerts
- [x] Per-category budget setting (monthly cap) — already in SettingsPage Budgets tab
- [x] Visual % used indicator per category in Dashboard — `BudgetProgress.jsx` with green/amber/red bars
- [ ] Toast alert when a category hits 80% and 100% of budget in current month

### Export
- [x] Export transactions to CSV (filtered by current view) — `exportTransactionsCSV()` in utils.js, button in TransactionsPage
- [ ] Export P&L summary to CSV

### Investment
- [ ] Investment buy/sell tracking — differentiate `INVESTMENT_BUY` vs `INVESTMENT_SELL`
- [ ] Realized gain/loss calculation

---

## Guiding Principles (from plan, adapted)

1. **pnlImpact is the gate** — All spend charts filter on `pnlImpact = true`. Transfers/investments never appear in expense totals.
2. **Confidence is first-class** — Every assignment carries a 0–1 score. Low confidence surfaces in the review queue.
3. **User rules win** — `source = 'user'` overrides always beat AI, bank, keyword. Never overwrite.
4. **Explainability** — Every transaction has a `categoryReason` explaining the assignment.
5. **Idempotency** — Re-importing the same CSV produces the same outcome (INSERT OR IGNORE on ID).
