import { keywordRules } from '../data/keywordRules.js';
import { mapBankCategory } from '../data/bankCategoryMap.js';
import { normalizeForKeyword } from './utils.js';

export const CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Shopping', 'Subscriptions',
  'Bills', 'Health', 'Travel', 'Entertainment', 'Income',
  'Credit Card Payment', 'Savings', 'Checking', 'Investment', 'House Rent', 'Other',
];

// These are internal money movements — excluded from spend totals in the dashboard.
// Checking  = transfers between checking and savings accounts (both directions).
// Investment = deposits/withdrawals to/from investment accounts (Robinhood, etc.).
export const TRANSFER_CATEGORIES = new Set(['Savings', 'Checking', 'Investment', 'Credit Card Payment']);

// Returns built-in categories merged with any user-defined custom ones.
export function getCategories(customCategories = []) {
  const extras = customCategories.filter((c) => c && !CATEGORIES.includes(c));
  return extras.length ? [...CATEGORIES, ...extras] : CATEGORIES;
}

// Stage 1: check overrides by merchantRaw (covers both "user" and "ai" cached results)
// Stage 2: map bank-supplied category string
// Stage 3: keyword rules against normalized merchantRaw
// Returns { category, categorySource } or null (needs Gemini)
function categorizeOne(tx, overrides) {
  // Stage 1 — user/ai override keyed by merchantRaw
  const override = overrides[tx.merchantRaw];
  if (override) {
    return { category: override.category, categorySource: override.source };
  }

  // Stage 2 — bank category mapping
  const bankCat = mapBankCategory(tx._bankCategoryRaw);
  if (bankCat) {
    return { category: bankCat, categorySource: 'bank' };
  }

  // Stage 3 — keyword rules
  const normalized = normalizeForKeyword(tx.merchantRaw);
  for (const rule of keywordRules) {
    if (normalized.includes(rule.pattern)) {
      return { category: rule.category, categorySource: 'keyword' };
    }
  }

  return null; // needs AI
}

// Apply sync stages (1-3) to all transactions.
// Also applies displayName, domain, logo, and description from overrides.
export function applySync(transactions, overrides) {
  return transactions.map((tx) => {
    const override = overrides[tx.merchantRaw];
    const displayName = override?.displayName ?? null;
    const domain = override?.domain ?? tx.domain ?? null;
    const logo = override?.logo ?? tx.logo ?? null;
    const description = override?.description ?? tx.description ?? null;
    const merchant = displayName || tx.merchant;

    const result = categorizeOne(tx, overrides);
    if (result) {
      return { ...tx, merchant, domain, logo, description, category: result.category, categorySource: result.categorySource };
    }
    return { ...tx, merchant, domain, logo, description, category: 'Other', categorySource: 'uncategorized' };
  });
}
