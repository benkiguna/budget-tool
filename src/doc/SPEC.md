# Personal Budget Tool — Technical Spec

## Overview

A fully client-side personal budgeting web app. No backend, no login, no data leaves the browser.
Parses CSV exports from Chase, Capital One, and Discover, normalizes them into a unified transaction
schema, categorizes spending using a 4-stage waterfall, and presents a dashboard with charts and insights.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| UI framework | React (via Vite) | Component model, hooks for state |
| Charts | Recharts | Declarative, works well with React |
| CSV parsing | PapaParse | Handles messy bank CSV formats reliably |
| Styling | Tailwind CSS | Utility-first, no build complexity |
| Storage | localStorage | No server needed, survives refresh |
| AI categorization | Gemini 2.0 Flash | Free tier, great at classification tasks |
| Dev server | Vite | Fast HMR, zero config for React |

---

## Project Structure

```
budget-tool/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── components/
│   │   ├── Dashboard.jsx         # Main view: charts + summary cards
│   │   ├── UploadZone.jsx        # Drag-and-drop CSV upload
│   │   ├── TransactionTable.jsx  # Filterable transaction list
│   │   ├── CategoryEditor.jsx    # Edit/override categories per merchant
│   │   └── SettingsPanel.jsx     # Salary config, Gemini API key, category list
│   ├── lib/
│   │   ├── parsers/
│   │   │   ├── index.js          # Format detector + dispatcher
│   │   │   ├── chase.js          # Chase CSV → unified schema
│   │   │   ├── capitalOne.js     # Capital One CSV → unified schema
│   │   │   └── discover.js       # Discover CSV → unified schema
│   │   ├── categorizer.js        # 4-stage categorization waterfall
│   │   ├── gemini.js             # Gemini API client (batched calls)
│   │   ├── storage.js            # localStorage read/write helpers
│   │   └── utils.js              # Date formatting, currency, dedup
│   └── data/
│       ├── keywordRules.js       # Merchant keyword → category map
│       └── bankCategoryMap.js    # Bank category strings → unified category
├── public/
│   └── sample/                   # Sample CSVs for testing (one per bank)
├── .env.local                    # VITE_GEMINI_API_KEY (gitignored)
├── SPEC.md                       # This file
└── vite.config.js
```

---

## Unified Transaction Schema

Every transaction, regardless of source bank, is normalized to this shape:

```js
{
  id: string,            // hash of date+merchant+amount — used for dedup
  date: string,          // ISO 8601: "2025-03-14"
  merchant: string,      // cleaned merchant name, e.g. "Whole Foods"
  merchantRaw: string,   // original string from CSV, e.g. "WHOLEFDS MKT #10 SEA WA"
  amount: number,        // always negative for spend, positive for income/refunds
  category: string,      // one of the categories defined in CATEGORIES
  categorySource: string, // "user" | "bank" | "keyword" | "ai" | "uncategorized"
  sourceBank: string,    // "chase" | "capitalOne" | "discover"
  notes: string          // optional, user-added
}
```

---

## Bank CSV Formats

### Chase
- Filename hint: contains "Chase" or user names it
- Header signature: `Transaction Date,Post Date,Description,Category,Type,Amount,Memo`
- Amount: negative = spend (already signed correctly)
- Date field: `Transaction Date`
- Category field: `Category` (mapped via `bankCategoryMap.js`)

### Capital One
- Header signature: `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit`
- Amount: separate `Debit` (positive float, spend) and `Credit` (positive float, refund/payment) columns
- Normalize: `amount = Credit ? +Credit : -Debit`
- Date field: `Transaction Date`

### Discover
- Header signature: `Trans. Date,Post Date,Description,Amount,Category`
- Amount: positive = spend (flip sign on import)
- Date field: `Trans. Date`
- Category field: `Category` (mapped via `bankCategoryMap.js`)
- Note: Discover was acquired by Capital One in May 2025 — format may change, watch for header drift

### Format Detection
Auto-detect by inspecting header row of uploaded CSV. Match against known signatures above.
If detection fails, prompt user to select bank manually.

---

## Categorization Waterfall

For each transaction, run through stages in order. Stop at first match.

```
Stage 1 — User override
  Check localStorage key: overrides[merchantRaw]
  If found → use stored category, source = "user"

Stage 2 — Bank category
  If CSV has a category column and value is not blank/generic
  Map via bankCategoryMap.js to unified category
  If maps cleanly → use it, source = "bank"
  Generic/useless values to ignore: "Other", "Uncategorized", ""

Stage 3 — Keyword rules
  Normalize merchantRaw: uppercase, strip digits and special chars
  Match against keywordRules.js patterns (substring match, not exact)
  If match → use mapped category, source = "keyword"

Stage 4 — Gemini AI fallback
  Collect all still-uncategorized merchants from the current upload
  Send as a single batched API call (see Gemini section below)
  Map response to unified categories
  Save each result as a user override in localStorage (so AI is called once per merchant ever)
  source = "ai"
```

---

## Categories

Default set (user can rename but not add/remove in v1):

```
Food            # restaurants, cafes, bars
Groceries       # supermarkets
Transport       # Uber, Lyft, gas, parking, transit
Shopping        # Amazon, retail, clothing
Subscriptions   # Netflix, Spotify, recurring SaaS
Bills           # utilities, rent, insurance, phone
Health          # pharmacy, doctors, gym
Travel          # flights, hotels, Airbnb
Entertainment   # movies, events, concerts
Income          # salary deposits, refunds
Other           # catch-all
```

---

## Keyword Rules (keywordRules.js)

Partial list — expand as needed. All matched as case-insensitive substrings of the raw merchant name.

```js
export const keywordRules = [
  // Groceries
  { pattern: "WHOLEFDS",     category: "Groceries" },
  { pattern: "WHOLE FOODS",  category: "Groceries" },
  { pattern: "TRADER JOE",   category: "Groceries" },
  { pattern: "SAFEWAY",      category: "Groceries" },
  { pattern: "KROGER",       category: "Groceries" },
  { pattern: "COSTCO",       category: "Groceries" },
  { pattern: "FRED MEYER",   category: "Groceries" },

  // Food
  { pattern: "CHIPOTLE",     category: "Food" },
  { pattern: "MCDONALD",     category: "Food" },
  { pattern: "STARBUCKS",    category: "Food" },
  { pattern: "DOORDASH",     category: "Food" },
  { pattern: "UBER EATS",    category: "Food" },
  { pattern: "GRUBHUB",      category: "Food" },

  // Transport
  { pattern: "UBER",         category: "Transport" },  // Note: check UBER EATS first
  { pattern: "LYFT",         category: "Transport" },
  { pattern: "SHELL",        category: "Transport" },
  { pattern: "CHEVRON",      category: "Transport" },
  { pattern: "EXXON",        category: "Transport" },
  { pattern: "PARKING",      category: "Transport" },

  // Subscriptions
  { pattern: "NETFLIX",      category: "Subscriptions" },
  { pattern: "SPOTIFY",      category: "Subscriptions" },
  { pattern: "APPLE.COM",    category: "Subscriptions" },
  { pattern: "AMAZON PRIME", category: "Subscriptions" },
  { pattern: "HULU",         category: "Subscriptions" },
  { pattern: "DISNEY",       category: "Subscriptions" },

  // Shopping
  { pattern: "AMZN",         category: "Shopping" },
  { pattern: "AMAZON",       category: "Shopping" },
  { pattern: "TARGET",       category: "Shopping" },
  { pattern: "WALMART",      category: "Shopping" },
  { pattern: "BEST BUY",     category: "Shopping" },

  // Health
  { pattern: "CVS",          category: "Health" },
  { pattern: "WALGREEN",     category: "Health" },
  { pattern: "PHARMACY",     category: "Health" },

  // Income
  { pattern: "DIRECT DEP",   category: "Income" },
  { pattern: "PAYROLL",      category: "Income" },
  { pattern: "GUSTO",        category: "Income" },
  { pattern: "ADP",          category: "Income" },
];
```

**Important:** run patterns in order. "UBER EATS" must be checked before "UBER" or it will
incorrectly categorize food delivery as transport.

---

## Gemini API Integration (gemini.js)

```js
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

const CATEGORIES = ["Food","Groceries","Transport","Shopping","Subscriptions","Bills","Health","Travel","Entertainment","Income","Other"];

export async function categorizeMerchants(merchantNames, apiKey) {
  // merchantNames: string[] of raw merchant name strings
  // Returns: { [merchantRaw]: category }

  const prompt = `
You are a transaction categorizer. Given a list of merchant names from bank statements,
classify each into exactly one of these categories:
${CATEGORIES.join(", ")}

Rules:
- "UBER EATS" and "DOORDASH" → Food (not Transport)
- "AMAZON PRIME" → Subscriptions (not Shopping)
- Salary/payroll deposits → Income
- When ambiguous, prefer the more specific category
- Return ONLY a JSON object: { "merchantName": "Category", ... }
- No explanation, no markdown, just the JSON object

Merchants to categorize:
${merchantNames.map((m, i) => `${i + 1}. ${m}`).join("\n")}
  `.trim();

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }  // low temp for consistency
    })
  });

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    console.error("Gemini parse error:", text);
    return {};
  }
}
```

**Caching:** after a successful AI call, save each result to localStorage:
```js
overrides[merchantRaw] = { category, source: "ai", savedAt: Date.now() }
```
This means each unique merchant is only ever sent to the API once.

---

## Storage Schema (localStorage)

```js
// Key: "budget_transactions"
// Value: Transaction[] — full normalized history

// Key: "budget_overrides"
// Value: { [merchantRaw]: { category, source, savedAt } }

// Key: "budget_settings"
// Value: {
//   salary: number,          // monthly net take-home
//   payday: number,          // day of month (e.g. 15)
//   geminiApiKey: string,
//   categories: string[]     // ordered list
// }
```

---

## Dashboard Panels (v1)

1. **Monthly summary bar** — current month: income vs total spend vs surplus/deficit
2. **Spend by category** — horizontal bar chart (Recharts), current month
3. **Month-over-month trend** — line chart, last 6 months total spend
4. **Transaction list** — sortable, filterable by category/bank/date range, inline category edit
5. **Top merchants** — ranked by total spend, current month

---

## Splitwise (minimal handling)

User adds Splitwise reimbursements as a manual monthly income entry in settings.
No CSV import needed — given low volume (occasional dinners), this is sufficient for v1.

---

## Deduplication

When uploading overlapping date ranges (e.g. two CSVs covering the same week):
- Generate transaction ID as: `sha256(date + merchantRaw + amount).slice(0,12)`
- On import, skip any transaction whose ID already exists in storage
- Show user a count: "Imported 47 transactions, skipped 12 duplicates"

---

## v1 Scope (build this first)

- [ ] CSV upload (drag-and-drop, multi-file)
- [ ] Auto-detect Chase / Capital One / Discover format
- [ ] Normalize to unified schema
- [ ] 4-stage categorization waterfall
- [ ] Gemini API integration with localStorage caching
- [ ] Dashboard: monthly summary + category chart + transaction list
- [ ] Settings panel: salary, API key, category overrides
- [ ] Export transactions as CSV

## Out of scope for v1

- Multiple user profiles
- Budget limits / alerts (v2)
- Month-over-month trend chart (v2)
- Splitwise CSV import (v2)
- Mobile layout optimization (v2)
