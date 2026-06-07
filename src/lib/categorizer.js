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

// Maps each category to its financial domain type and P&L impact.
// transactionType follows the plan's enum: EXPENSE, INCOME, TRANSFER, CREDIT_CARD_PAY,
//   INVESTMENT_BUY, INVESTMENT_SELL, REFUND, UNCATEGORIZED
// pnlImpact: true = hits P&L (income/expense), false = balance-sheet only (transfers)
export const CATEGORY_TYPE_MAP = {
  // No P&L impact — balance sheet movements only
  'Credit Card Payment': { transactionType: 'CREDIT_CARD_PAY', pnlImpact: false },
  'Savings':             { transactionType: 'TRANSFER',        pnlImpact: false },
  'Checking':            { transactionType: 'TRANSFER',        pnlImpact: false },
  'Investment':          { transactionType: 'INVESTMENT_BUY',  pnlImpact: false },

  // P&L income
  'Income':              { transactionType: 'INCOME',          pnlImpact: true  },

  // P&L expenses
  'Food':                { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Groceries':           { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Transport':           { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Shopping':            { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Subscriptions':       { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Bills':               { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Health':              { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Travel':              { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Entertainment':       { transactionType: 'EXPENSE',         pnlImpact: true  },
  'House Rent':          { transactionType: 'EXPENSE',         pnlImpact: true  },
  'Other':               { transactionType: 'EXPENSE',         pnlImpact: true  },
};

// Peer-to-peer payment apps: ambiguous between transfer (bill split) and expense (gift/payment).
// We detect them and cap confidence at 0.4 so they surface in the review queue.
// User overrides are exempt — if the user already decided, respect it.
const P2P_PATTERNS = ['VENMO', 'ZELLE', 'CASH APP', 'CASHAPP', 'APPLE CASH', 'GOOGLE PAY SEND'];

function isP2P(merchantRaw) {
  const upper = merchantRaw.toUpperCase();
  return P2P_PATTERNS.some((p) => upper.includes(p));
}

// Returns built-in categories merged with any user-defined custom ones.
export function getCategories(customCategories = []) {
  const extras = customCategories.filter((c) => c && !CATEGORIES.includes(c));
  return extras.length ? [...CATEGORIES, ...extras] : CATEGORIES;
}

// Resolve transactionType + pnlImpact for a given category.
// Custom categories (not in CATEGORY_TYPE_MAP) default to EXPENSE / pnlImpact: true.
export function getTypeForCategory(category) {
  return CATEGORY_TYPE_MAP[category] ?? { transactionType: 'EXPENSE', pnlImpact: true };
}

// Returns true if a transaction matches a user-defined rule.
function matchesRule(tx, rule) {
  const rawUpper = (tx.merchantRaw ?? '').toUpperCase();
  switch (rule.rule_type) {
    case 'MERCHANT_EXACT':
      return rawUpper === (rule.match_value ?? '').toUpperCase();
    case 'MERCHANT_CONTAINS':
      return rawUpper.includes((rule.match_value ?? '').toUpperCase());
    case 'DESCRIPTION_REGEX':
      try { return new RegExp(rule.match_value, 'i').test(tx.merchantRaw); }
      catch { return false; }
    case 'AMOUNT_RANGE': {
      const abs = Math.abs(tx.amount);
      return abs >= (rule.amount_min ?? -Infinity) && abs <= (rule.amount_max ?? Infinity);
    }
    default: return false;
  }
}

// Stage 1: check overrides by merchantRaw (user/ai cached results)
// Stage 2: user-defined pattern rules (categorization_rules, priority-ordered)
// Stage 3: map bank-supplied category string
// Stage 4: keyword rules against normalized merchantRaw
//
// Returns { category, categorySource, confidence, categoryReason, transactionType, pnlImpact }
// or null (needs Gemini/AI)
function categorizeOne(tx, overrides, sortedRules) {
  // Stage 1 — user/ai override keyed by merchantRaw
  const override = overrides[tx.merchantRaw];
  if (override) {
    const { transactionType, pnlImpact } = getTypeForCategory(override.category);
    const isUser = override.source === 'user';
    return {
      category: override.category,
      categorySource: override.source,
      // User overrides are definitive (1.0); AI overrides carry their saved confidence or 0.75
      confidence: isUser ? 1.0 : (override.confidence ?? 0.75),
      categoryReason: isUser
        ? `User manually set to ${override.category}`
        : `AI classified as ${override.category}`,
      transactionType,
      pnlImpact,
    };
  }

  // Stage 2 — user-defined pattern rules (run before bank/keyword so user intent wins)
  for (const rule of sortedRules) {
    if (matchesRule(tx, rule)) {
      const { transactionType, pnlImpact } = getTypeForCategory(rule.category);
      return {
        category: rule.category,
        categorySource: 'rule',
        confidence: 0.95,
        categoryReason: `Matched ${rule.rule_type.toLowerCase().replace('_', ' ')} rule: "${rule.match_value}"`,
        transactionType,
        pnlImpact,
      };
    }
  }

  // Stage 3 — bank category mapping
  const bankCat = mapBankCategory(tx._bankCategoryRaw);
  if (bankCat) {
    const { transactionType, pnlImpact } = getTypeForCategory(bankCat);
    return {
      category: bankCat,
      categorySource: 'bank',
      confidence: 0.9,
      categoryReason: `Bank reported category: ${tx._bankCategoryRaw}`,
      transactionType,
      pnlImpact,
    };
  }

  // Stage 3 — keyword rules
  const normalized = normalizeForKeyword(tx.merchantRaw);
  for (const rule of keywordRules) {
    if (normalized.includes(rule.pattern)) {
      const { transactionType, pnlImpact } = getTypeForCategory(rule.category);
      return {
        category: rule.category,
        categorySource: 'keyword',
        confidence: 0.85,
        categoryReason: `Matched keyword pattern "${rule.pattern}"`,
        transactionType,
        pnlImpact,
      };
    }
  }

  return null; // needs AI
}

// Apply sync stages (1-4) to all transactions.
// rules: array of categorization_rules rows from the DB, sorted by priority ascending.
// Also applies displayName, domain, logo, and description from overrides.
export function applySync(transactions, overrides, rules = []) {
  // Sort once for the whole batch
  const sortedRules = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  return transactions.map((tx) => {
    const override = overrides[tx.merchantRaw];
    const displayName = override?.displayName ?? null;
    const domain = override?.domain ?? tx.domain ?? null;
    const logo = override?.logo ?? tx.logo ?? null;
    const description = override?.description ?? tx.description ?? null;
    const merchant = displayName || tx.merchant;

    const result = categorizeOne(tx, overrides, sortedRules);
    if (result) {
      // P2P cap: Venmo/Zelle/CashApp etc. are ambiguous (transfer vs expense).
      // Downgrade to 0.4 so they surface in the review queue, unless the user already decided.
      const p2pDowngrade = result.categorySource !== 'user' && isP2P(tx.merchantRaw);
      return {
        ...tx,
        merchant,
        domain,
        logo,
        description,
        category: result.category,
        categorySource: result.categorySource,
        confidence: p2pDowngrade ? Math.min(result.confidence, 0.4) : result.confidence,
        categoryReason: p2pDowngrade
          ? `P2P payment app — could be transfer or expense (${result.categoryReason})`
          : result.categoryReason,
        transactionType: result.transactionType,
        pnlImpact: result.pnlImpact,
      };
    }

    // Uncategorized — still derive type from 'Other' default
    const { transactionType, pnlImpact } = getTypeForCategory('Other');
    return {
      ...tx,
      merchant,
      domain,
      logo,
      description,
      category: 'Other',
      categorySource: 'uncategorized',
      confidence: 0.0,
      categoryReason: 'No matching rule, bank category, or AI result',
      transactionType,
      pnlImpact,
    };
  });
}
