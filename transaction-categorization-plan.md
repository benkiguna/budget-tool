# Transaction Categorization System — Architecture & Financial Design Plan

> **Prepared as:** Software Architect + Financial Domain Expert  
> **Stack:** Node.js · Plaid · PostgreSQL · LLM (AI layer)  
> **Scope:** End-to-end plan covering data model, categorization pipeline, accounting correctness, and operational concerns

---

## Table of Contents

1. [Guiding Principles](#1-guiding-principles)
2. [Financial Domain Model](#2-financial-domain-model)
3. [Database Schema](#3-database-schema)
4. [Plaid Integration Layer](#4-plaid-integration-layer)
5. [Categorization Pipeline](#5-categorization-pipeline)
6. [Transfer Detection — The Hard Gate](#6-transfer-detection--the-hard-gate)
7. [AI Classification Layer](#7-ai-classification-layer)
8. [User Rules Engine](#8-user-rules-engine)
9. [Manual Review Queue](#9-manual-review-queue)
10. [Category Taxonomy](#10-category-taxonomy)
11. [Feedback Loop & Learning](#11-feedback-loop--learning)
12. [Reporting & Accounting Integrity](#12-reporting--accounting-integrity)
13. [Phased Delivery Roadmap](#13-phased-delivery-roadmap)
14. [Open Questions & Risks](#14-open-questions--risks)

---

## 1. Guiding Principles

These inform every decision in this plan.

| Principle | What it means in practice |
|---|---|
| **Accounting correctness first** | Transfers are never income or expense. The pipeline enforces this before any AI or enricher touches the data. |
| **Confidence is a first-class field** | Every category assignment carries a source and a confidence score. Low confidence = route to review, never silently guess. |
| **User rules win** | A user override always beats enricher or AI. The system learns from corrections rather than fighting them. |
| **Explainability** | Every transaction must be able to answer "why was I categorized this way?" — for trust and for debugging. |
| **Idempotency** | Re-processing the same Plaid webhook must produce the same outcome. No duplicate transactions, no double-counting. |

---

## 2. Financial Domain Model

Before writing code, align on what each transaction type _means_ accounting-wise. This determines which pipeline path it takes.

### 2.1 Transaction Types

```
TRANSFER          — movement of value between owned accounts. No P&L impact.
CREDIT_CARD_PAY   — paying down a liability. No new expense (already recorded at purchase).
LOAN_GIVEN        — asset created (receivable). Not an expense.
LOAN_REPAID       — asset consumed. Not income.
EXPENSE           — value leaves and is consumed. Hits P&L.
INCOME            — value enters from an external source. Hits P&L.
INVESTMENT_BUY    — asset swap (cash → investment). No P&L.
INVESTMENT_SELL   — asset swap + realized gain/loss. Gain/loss hits P&L.
DIVIDEND          — income from investment. Hits P&L immediately.
REFUND            — reversal of a prior expense. Reduces expense, not new income.
UNCATEGORIZED     — catch-all. Blocks reporting until resolved.
```

### 2.2 P&L Impact Matrix

| Type | Hits P&L? | Balance Sheet Effect |
|---|---|---|
| Internal transfer | No | Asset ↔ Asset |
| Credit card payment | No | Asset ↓, Liability ↓ |
| Loan given | No | Asset ↑ (receivable), Asset ↓ (cash) |
| Loan repaid (received back) | No | Asset ↓ (receivable), Asset ↑ (cash) |
| Expense | Yes | Asset ↓, Equity ↓ |
| Income / Salary | Yes | Asset ↑, Equity ↑ |
| Investment purchase | No | Asset ↔ Asset |
| Realized gain | Yes | Asset ↑, Equity ↑ |
| Realized loss | Yes | Asset ↓, Equity ↓ |
| Dividend / interest | Yes | Asset ↑, Equity ↑ |
| Refund | Yes (negative expense) | Asset ↑, Equity ↑ |

> **Rule:** Any transaction type with "No" in the P&L column must be caught in Layer 1 or Layer 2 of the pipeline. It must never reach the expense/income classification layers.

---

## 3. Database Schema

### 3.1 Core Tables

```sql
-- Accounts pulled from Plaid
CREATE TABLE accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  plaid_account_id  TEXT UNIQUE NOT NULL,
  institution_name  TEXT,
  account_name      TEXT,
  account_type      TEXT,           -- 'depository', 'credit', 'investment', 'loan'
  account_subtype   TEXT,           -- 'checking', 'savings', 'credit card', etc.
  is_owned          BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Raw transactions as received from Plaid (immutable, append-only)
CREATE TABLE transactions_raw (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_transaction_id  TEXT UNIQUE NOT NULL,
  account_id            UUID NOT NULL REFERENCES accounts(id),
  plaid_payload         JSONB NOT NULL,   -- full Plaid response, never modified
  synced_at             TIMESTAMPTZ DEFAULT now()
);

-- Processed transactions (mutable — categorization updates this)
CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_id                UUID NOT NULL REFERENCES transactions_raw(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  account_id            UUID NOT NULL REFERENCES accounts(id),

  -- Core fields (normalized from Plaid)
  plaid_transaction_id  TEXT UNIQUE NOT NULL,
  amount                NUMERIC(14, 2) NOT NULL,  -- positive = debit, negative = credit
  currency              TEXT DEFAULT 'USD',
  date                  DATE NOT NULL,
  description           TEXT,                      -- original Plaid name
  merchant_name         TEXT,                      -- Plaid-cleaned merchant
  pending               BOOLEAN DEFAULT FALSE,

  -- Plaid enrichment
  plaid_category        TEXT[],                    -- e.g. ['Food and Drink', 'Restaurants']
  plaid_category_id     TEXT,
  plaid_personal_finance_category TEXT,            -- Plaid's newer unified taxonomy
  counterparty_name     TEXT,
  counterparty_type     TEXT,                      -- 'merchant', 'financial_institution', 'individual'

  -- Categorization result
  category_id           UUID REFERENCES categories(id),
  transaction_type      TEXT NOT NULL DEFAULT 'UNCATEGORIZED',
  category_source       TEXT,                      -- 'TRANSFER_RULE','USER_RULE','ENRICHER','AI','MANUAL'
  category_confidence   NUMERIC(4,3),              -- 0.000 – 1.000
  category_reason       TEXT,                      -- human-readable explanation
  pnl_impact            BOOLEAN,                   -- TRUE = hits P&L, FALSE = balance-sheet only

  -- Transfer-specific
  transfer_pair_id      UUID,                      -- links debit + credit side of same transfer
  linked_account_id     UUID REFERENCES accounts(id),  -- other account in a transfer

  -- State
  review_status         TEXT DEFAULT 'PENDING',    -- 'PENDING','REVIEWED','APPROVED','NEEDS_REVIEW'
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           TEXT,                      -- 'USER','SYSTEM'

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_txn_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_txn_review    ON transactions(user_id, review_status) WHERE review_status = 'NEEDS_REVIEW';
CREATE INDEX idx_txn_type      ON transactions(user_id, transaction_type);
```

### 3.2 Categories Table

```sql
CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),   -- NULL = system category (fixed)
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,               -- 'food_dining', 'internal_transfer', etc.
  parent_id     UUID REFERENCES categories(id),
  transaction_type TEXT NOT NULL,            -- maps to transaction_type enum above
  is_system     BOOLEAN DEFAULT FALSE,       -- system categories cannot be deleted or reassigned
  pnl_impact    BOOLEAN NOT NULL,
  icon          TEXT,
  color         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### 3.3 User Rules Table

```sql
CREATE TABLE categorization_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  priority        INTEGER NOT NULL DEFAULT 100,  -- lower = runs first
  rule_type       TEXT NOT NULL,   -- 'MERCHANT_EXACT','MERCHANT_CONTAINS','DESCRIPTION_REGEX','AMOUNT_RANGE'
  match_value     TEXT,            -- merchant name, regex pattern, etc.
  amount_min      NUMERIC(14,2),
  amount_max      NUMERIC(14,2),
  category_id     UUID NOT NULL REFERENCES categories(id),
  transaction_type TEXT NOT NULL,
  created_from    TEXT,            -- 'USER_MANUAL','LEARNED_FROM_CORRECTION'
  hit_count       INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 Categorization Audit Log

```sql
CREATE TABLE categorization_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  layer           TEXT NOT NULL,          -- 'TRANSFER','USER_RULE','ENRICHER','AI','MANUAL'
  input_snapshot  JSONB,                  -- what data was passed to this layer
  output          JSONB,                  -- what this layer returned
  confidence      NUMERIC(4,3),
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. Plaid Integration Layer

### 4.1 Webhook Handler

Plaid pushes updates via webhooks. The handler must be idempotent.

```
POST /webhooks/plaid
  → Verify Plaid signature
  → Identify webhook type:
      TRANSACTIONS.SYNC_UPDATES_AVAILABLE  → trigger sync job
      TRANSACTIONS.DEFAULT_UPDATE          → legacy, same handling
      ITEM.ERROR                           → flag account, notify user
  → Enqueue background job (do not process inline)
  → Return 200 immediately
```

### 4.2 Sync Job

```
syncPlaidTransactions(itemId):
  1. Call /transactions/sync with cursor from last run
  2. For each ADDED transaction:
       a. Upsert into transactions_raw (idempotent on plaid_transaction_id)
       b. If not already in transactions table → enqueue categorizationJob(txnId)
  3. For each MODIFIED transaction:
       a. Update transactions_raw
       b. If category_source is 'ENRICHER' or 'AI' → re-run categorization
       c. If category_source is 'USER_RULE' or 'MANUAL' → preserve, flag for optional review
  4. For each REMOVED transaction:
       a. Soft-delete (set deleted_at) — never hard delete financial records
  5. Persist new cursor
```

### 4.3 Plaid Field Mapping

| Plaid field | Our field | Notes |
|---|---|---|
| `transaction_id` | `plaid_transaction_id` | Unique key |
| `amount` | `amount` | Plaid uses positive = debit. Match this convention. |
| `name` | `description` | Raw bank string |
| `merchant_name` | `merchant_name` | Plaid-cleaned, prefer over `name` |
| `personal_finance_category.primary` | `plaid_personal_finance_category` | Use Plaid's new unified taxonomy |
| `counterparties[0].name` | `counterparty_name` | Available in newer Plaid versions |
| `counterparties[0].type` | `counterparty_type` | 'merchant' / 'financial_institution' / 'individual' |

---

## 5. Categorization Pipeline

Every transaction runs through layers in strict order. A layer either **claims** the transaction (sets a result and stops) or **passes** it to the next layer.

```
Raw transaction
      │
      ▼
┌─────────────────────────────────┐
│  Layer 0 — Pending filter       │  Skip pending transactions entirely.
│                                 │  Re-process when Plaid marks them posted.
└─────────────┬───────────────────┘
              │ (posted only)
              ▼
┌─────────────────────────────────┐
│  Layer 1 — Transfer detection   │  Hard gate. Runs before anything else.
│                                 │  No P&L impact transactions exit here.
└─────────────┬───────────────────┘
              │ (not a transfer)
              ▼
┌─────────────────────────────────┐
│  Layer 2 — User rules           │  Merchant overrides, learned corrections.
│                                 │  User intent always wins.
└─────────────┬───────────────────┘
              │ (no rule matched)
              ▼
┌─────────────────────────────────┐
│  Layer 3 — Plaid enrichment     │  Use personal_finance_category.
│                                 │  Map to our taxonomy. Accept if HIGH confidence.
└─────────────┬───────────────────┘
              │ (low confidence or missing)
              ▼
┌─────────────────────────────────┐
│  Layer 4 — AI classification    │  Call LLM with structured prompt.
│                                 │  Accept if confidence ≥ 0.80.
└─────────────┬───────────────────┘
              │ (confidence < 0.80)
              ▼
┌─────────────────────────────────┐
│  Layer 5 — Manual review queue  │  Surface to user with context.
│                                 │  User choice → stored as rule.
└─────────────────────────────────┘
```

Each layer writes a row to `categorization_audit` before passing or claiming.

---

## 6. Transfer Detection — The Hard Gate

This is the single most important layer. A missed transfer that becomes an expense double-counts spending and corrupts every financial report.

### 6.1 Detection Signals (in priority order)

| Signal | Confidence | How to detect |
|---|---|---|
| Same-user account counterparty | HIGH | Plaid's `counterparty_type = 'financial_institution'` + `account_id` matches another owned account |
| Matching debit/credit pair | HIGH | Within 24h window, same absolute amount, opposite sign, across two owned accounts |
| Credit card payment patterns | HIGH | Regex on description + counterparty is a known credit institution |
| Plaid category = `TRANSFER_IN` / `TRANSFER_OUT` | HIGH | Direct from Plaid's personal finance taxonomy |
| Plaid category = `LOAN_PAYMENTS` | HIGH | Loan repayment — balance sheet only |
| Generic transfer keywords | MEDIUM | "transfer", "xfer", "from savings", "to checking" |
| Peer-to-peer apps (Venmo, Zelle, Cash App) | LOW | Could be expense (gift) or transfer (repayment) — route to review |

### 6.2 Transfer Pairing

When two transactions are identified as the two sides of one transfer, link them:

```sql
-- Generate a shared ID and assign to both legs
UPDATE transactions
SET transfer_pair_id = $pairId, linked_account_id = $otherAccountId
WHERE id IN ($debitTxnId, $creditTxnId);
```

This allows the UI to show "Transfer to Savings Account" rather than two orphaned entries, and prevents either leg from appearing in expense reports.

### 6.3 Peer-to-Peer Ambiguity

Venmo, Zelle, and Cash App transactions require a targeted question to the user:

```
"You sent $45 via Venmo to Alex. Was this:
  (A) Splitting a bill / paying someone back  →  [Transfer]
  (B) A gift or personal payment              →  [Expense: Gifts]"
```

Store the answer as a user rule keyed on `counterparty_name + app` so the same person is never asked again.

---

## 7. AI Classification Layer

### 7.1 When It Runs

Only after Layer 3 (enricher) either returns no result or a confidence below threshold. The AI layer is a fallback, not the primary classifier.

### 7.2 Input Construction

Pass only what the LLM needs. Less noise = better accuracy.

```javascript
const prompt = {
  system: `You are a financial transaction classifier. 
Classify the transaction into exactly one category from the provided list.
Respond ONLY with valid JSON. No explanation text outside the JSON.
Never classify a transfer between owned accounts as an expense.`,

  user: `Transaction details:
- Description: "${txn.description}"
- Merchant: "${txn.merchant_name ?? 'unknown'}"
- Amount: ${txn.amount > 0 ? 'debit' : 'credit'} $${Math.abs(txn.amount)}
- Date: ${txn.date}
- Account type: ${txn.account.account_subtype}
- Plaid hint (may be wrong): "${txn.plaid_personal_finance_category ?? 'none'}"
- Counterparty type: "${txn.counterparty_type ?? 'unknown'}"

User's existing categories:
${JSON.stringify(userCategories, null, 2)}

Respond with:
{
  "category_slug": "<slug from the list above>",
  "transaction_type": "<EXPENSE|INCOME|TRANSFER|INVESTMENT_BUY|...>",
  "confidence": <0.0 to 1.0>,
  "reason": "<one sentence explaining the classification>"
}`
};
```

### 7.3 Confidence Thresholds

| Confidence | Action |
|---|---|
| ≥ 0.85 | Auto-apply, mark `REVIEWED = SYSTEM` |
| 0.65 – 0.84 | Apply as suggestion, surface in review queue |
| < 0.65 | Route to manual review queue, do not pre-fill |

### 7.4 Guardrails

- Always include the known system categories (transfers, credit card payments) in the prompt so the AI can recognize them even if Layer 1 missed them.
- Validate the AI response against the category list — reject hallucinated slugs.
- Cap AI latency at 5s with a timeout. Fall through to manual queue on timeout.
- Log every AI call with input, output, latency, and token count for cost monitoring.

---

## 8. User Rules Engine

### 8.1 Rule Types

| Rule type | Example |
|---|---|
| `MERCHANT_EXACT` | "Whole Foods Market" → Groceries |
| `MERCHANT_CONTAINS` | contains "AMAZON" → Shopping (unless amount > $200 → Electronics) |
| `DESCRIPTION_REGEX` | `/^ZELLE.*LANDLORD/i` → Rent |
| `AMOUNT_RANGE` | $1,200–$1,220 debit, 1st of month → Rent |
| `COUNTERPARTY_NAME` | counterparty = "Alex Johnson" → Gifts |

### 8.2 Rule Priority

Rules are processed in ascending `priority` order. First match wins.

- User-created manual rules: priority 10–50
- Rules learned from corrections: priority 51–100
- System defaults (transfer patterns): priority 1–9 (these are actually Layer 1, not user rules — never overridable)

### 8.3 Learning from Corrections

When a user changes a category:

```
1. Record the correction in categorization_audit
2. Identify what made this transaction unique (merchant, amount range, description pattern)
3. Create a new rule with created_from = 'LEARNED_FROM_CORRECTION'
4. Optionally: prompt user "Apply this rule to future transactions from [Merchant]?"
5. Re-run the rule against historical uncategorized transactions for the same merchant
```

---

## 9. Manual Review Queue

### 9.1 What Enters the Queue

- Transfer confidence = LOW (peer-to-peer ambiguity)
- AI confidence < 0.65
- AI call failed or timed out
- Plaid returned no category
- Transaction amount is unusually large (> 3× rolling average for that category)
- New merchant never seen before (optional, configurable)

### 9.2 Queue UX Principles

- Show the most impactful transactions first (by absolute amount)
- Group by merchant where possible ("You have 5 transactions from Venmo — categorize once, apply to all")
- Provide AI suggestion as pre-fill when confidence is 0.65–0.84
- Always show the counterparty and a plain-English description, not the raw bank string
- After the user picks, immediately confirm and show what rule was learned

### 9.3 Blocking vs Non-Blocking

- `UNCATEGORIZED` transactions are excluded from all P&L reports
- Reports show a warning banner: "X transactions are uncategorized — your totals may be incomplete"
- Do not block the user from viewing reports; just show the caveat

---

## 10. Category Taxonomy

### 10.1 System Categories (fixed, not editable by user)

These map directly to transaction types with known P&L impact.

| Slug | Display name | P&L impact | Transaction type |
|---|---|---|---|
| `internal_transfer` | Internal transfer | No | TRANSFER |
| `credit_card_payment` | Credit card payment | No | CREDIT_CARD_PAY |
| `loan_given` | Loan to friend / family | No | LOAN_GIVEN |
| `loan_repaid` | Loan repaid (received back) | No | LOAN_REPAID |
| `investment_purchase` | Investment purchase | No | INVESTMENT_BUY |
| `investment_withdrawal` | Investment withdrawal | No | INVESTMENT_SELL |
| `realized_gain` | Investment gain | Yes | INVESTMENT_SELL |
| `realized_loss` | Investment loss | Yes | INVESTMENT_SELL |
| `salary_income` | Salary / payroll | Yes | INCOME |
| `dividend_income` | Dividend / interest | Yes | INCOME |
| `uncategorized` | Uncategorized | Blocked | UNCATEGORIZED |

### 10.2 Default Flexible Categories (user can rename, recolor, add children)

```
Income
  ├── Salary / payroll          (system)
  ├── Dividend / interest       (system)
  ├── Freelance income
  ├── Rental income
  └── Other income

Expenses
  ├── Food & dining
  │     ├── Restaurants
  │     ├── Groceries
  │     └── Coffee shops
  ├── Transport
  │     ├── Fuel
  │     ├── Ride share
  │     └── Public transit
  ├── Housing
  │     ├── Rent / mortgage
  │     └── Utilities
  ├── Health
  ├── Shopping
  ├── Entertainment
  ├── Travel
  ├── Subscriptions
  ├── Gifts & personal payments
  └── Other expenses

Transfers (system — no subcategories)
  ├── Internal transfer
  └── Credit card payment

Loans (system)
  ├── Loan given
  └── Loan repaid

Investments (system)
  ├── Investment purchase
  └── Investment withdrawal / gain / loss
```

### 10.3 Plaid → Our Taxonomy Mapping

```javascript
const PLAID_TO_SLUG = {
  'TRANSFER_IN':              'internal_transfer',
  'TRANSFER_OUT':             'internal_transfer',
  'LOAN_PAYMENTS':            'credit_card_payment',   // review: may be loan_given
  'INCOME_WAGES':             'salary_income',
  'INCOME_DIVIDENDS':         'dividend_income',
  'INCOME_OTHER_INCOME':      'other_income',
  'FOOD_AND_DRINK_RESTAURANTS': 'restaurants',
  'FOOD_AND_DRINK_GROCERIES': 'groceries',
  // ... extend as needed
};
```

---

## 11. Feedback Loop & Learning

### 11.1 Signals to Capture

| Event | What to store | How to use |
|---|---|---|
| User changes category | Old + new category, merchant, amount | Create user rule |
| User approves AI suggestion | Merchant, AI confidence | Boost confidence threshold for that merchant |
| User rejects AI suggestion | Full AI input/output | Flag for prompt tuning |
| User answers peer-to-peer question | Counterparty, their choice | Create counterparty rule |

### 11.2 Merchant Intelligence Table

```sql
CREATE TABLE merchant_intelligence (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id),   -- NULL = global
  merchant_name     TEXT NOT NULL,
  category_slug     TEXT NOT NULL,
  transaction_type  TEXT NOT NULL,
  sample_count      INTEGER DEFAULT 1,
  last_confirmed_at TIMESTAMPTZ,
  source            TEXT   -- 'PLAID','AI','USER'
);
```

Over time this becomes a per-user merchant dictionary that short-circuits the pipeline for known merchants, reducing AI costs and latency.

---

## 12. Reporting & Accounting Integrity

### 12.1 Core Report Queries

All reports filter on `pnl_impact = TRUE` for income/expense views, and exclude `review_status = 'PENDING'` pending transactions.

```sql
-- Monthly expense breakdown (excludes transfers, investments, loans)
SELECT
  c.name              AS category,
  SUM(t.amount)       AS total,
  COUNT(*)            AS transaction_count
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.user_id = $userId
  AND t.date BETWEEN $startDate AND $endDate
  AND t.pnl_impact = TRUE
  AND t.amount > 0                -- debits only for expense view
  AND t.review_status != 'PENDING'
  AND t.deleted_at IS NULL
GROUP BY c.name
ORDER BY total DESC;
```

### 12.2 Integrity Checks (run nightly)

These catch bugs before they surface in user reports.

```
1. Orphaned transfers: transactions with type=TRANSFER but no transfer_pair_id
   → Flag for review if amount > $50

2. Duplicate detection: same plaid_transaction_id more than once
   → Alert immediately — Plaid sync bug

3. Unresolved UNCATEGORIZED: transactions older than 7 days still in UNCATEGORIZED
   → Push notification to user

4. P&L leakage: transactions with pnl_impact=FALSE appearing in expense totals
   → Critical alert — categorization pipeline bug

5. Pending transactions older than 5 days
   → Trigger re-sync; Plaid may have missed a webhook
```

### 12.3 Net Worth Calculation

```
Net Worth = Assets − Liabilities

Assets:
  + All depository account balances (Plaid balances, updated on sync)
  + All investment account balances
  + Outstanding loans given (sum of loan_given − loan_repaid transactions)

Liabilities:
  + All credit card balances (Plaid balances)
  + Any recorded debts owed
```

---

## 13. Phased Delivery Roadmap

### Phase 1 — Foundation (Weeks 1–3)

- [ ] Schema migration: `transactions`, `categories`, `categorization_audit`
- [ ] Plaid webhook handler + idempotent sync job
- [ ] Layer 1: Transfer detection (hard gate — patterns + account matching)
- [ ] Layer 3: Plaid enricher mapping to our taxonomy
- [ ] System categories seeded in DB
- [ ] Basic expense report (filtered correctly on `pnl_impact`)

**Exit criterion:** No transfer is ever counted as an expense in reports.

### Phase 2 — Intelligence (Weeks 4–6)

- [ ] Layer 4: AI classification with confidence scoring
- [ ] Layer 5: Manual review queue UI
- [ ] `categorization_rules` table + user rules engine
- [ ] Peer-to-peer ambiguity flow (Venmo/Zelle/Cash App)
- [ ] `categorization_audit` logging for all layers

**Exit criterion:** > 85% of transactions auto-categorized without user input.

### Phase 3 — Learning (Weeks 7–9)

- [ ] Correction → rule learning pipeline
- [ ] `merchant_intelligence` table populated from corrections
- [ ] Layer 2 rule priority engine
- [ ] "Apply to all similar" bulk categorization UX
- [ ] Nightly integrity checks

**Exit criterion:** Returning users see < 5% of transactions in the review queue.

### Phase 4 — Reporting & Polish (Weeks 10–12)

- [ ] Net worth dashboard (assets vs liabilities)
- [ ] Monthly P&L with category drill-down
- [ ] Investment gain/loss tracking
- [ ] Loan tracking (given vs repaid)
- [ ] Export to CSV / PDF
- [ ] Category budget setting + alerts

---

## 14. Open Questions & Risks

| Question | Recommendation |
|---|---|
| **Multi-currency?** | Store raw currency + amount. Convert to base currency using daily FX rates for reporting. Add `amount_base` column. |
| **Joint accounts?** | Design `accounts` for multi-user ownership now. Add `account_owners[]` to avoid a schema migration later. |
| **Investment lot tracking?** | Plaid's investment endpoints provide cost basis per lot. Capture this for accurate realized gain/loss. Out of scope for Phase 1. |
| **Tax categories?** | Many expense categories map to tax deductions. Consider a `tax_deductible` flag on categories in Phase 4. |
| **Plaid enricher reliability** | Plaid's `personal_finance_category` is wrong ~15% of the time for ambiguous merchants. Always run AI as fallback. Never trust Plaid alone for high-stakes categories (transfers, investments). |
| **AI cost** | At ~1,000 tokens per call, budget ~$0.001 per transaction with a mid-tier model. For a user with 500 txns/month, that's $0.50/month in AI costs — acceptable. Cache by merchant to reduce repeat calls. |
| **GDPR / data privacy** | Don't send PII (account numbers, full legal names) to the AI API. Strip or hash before sending. Plaid already cleans most of this but audit the prompt. |

---

*Document version 1.0 — to be updated after Phase 1 retrospective.*
