// Maps bank-supplied category strings to unified app categories.
// Keys are lowercase for case-insensitive matching.

export const bankCategoryMap = {
  // Chase
  'food & drink':         'Food',
  'restaurants':          'Food',
  'dining':               'Food',
  'groceries':            'Groceries',
  'supermarkets':         'Groceries',
  'gas':                  'Transport',
  'gas stations':         'Transport',
  'automotive':           'Transport',
  'travel':               'Travel',
  'hotels & motels':      'Travel',
  'airlines':             'Travel',
  'entertainment':        'Entertainment',
  'movies & music':       'Entertainment',
  'shopping':             'Shopping',
  'merchandise':          'Shopping',
  'department stores':    'Shopping',
  'health & wellness':    'Health',
  'healthcare':           'Health',
  'medical services':     'Health',
  'pharmacy':             'Health',
  'bills & utilities':    'Bills',
  'utilities':            'Bills',
  'utilities/phone':      'Bills',
  'phone':                'Bills',
  'home':                 'Bills',
  'home improvement':     'Shopping',
  'personal':             'Other',
  'fees & adjustments':   'Other',
  'payment':              'Credit Card Payment',
  // 'transfer' intentionally omitted — too broad (could be savings, loans, external ACH).
  // Specific savings patterns are handled by keywordRules (e.g. "TO SAVINGS", "TRANSFER TO SAV").

  // Capital One
  'fuel/automotive':      'Transport',
  'travel/entertainment': 'Travel',
  // Discover uses same 'restaurants' key as Chase — already mapped above

  // Plaid personal_finance_category.primary values (lowercase)
  'food_and_drink':              'Food',
  'groceries':                   'Groceries',
  'transportation':              'Transport',
  'travel':                      'Travel',
  'entertainment':               'Entertainment',
  'general_merchandise':         'Shopping',
  'home_improvement':            'Shopping',
  'medical':                     'Health',
  'personal_care':               'Health',
  'rent_and_utilities':          'Bills',
  'loan_payments':               'Bills',
  'bank_fees':                   'Other',
  'income':                      'Income',
  'government_and_non_profit':   'Other',
  'general_services':            'Other',
};

// Values that convey no useful information and should be ignored
export const IGNORED_BANK_CATEGORIES = new Set([
  '', 'other', 'uncategorized', 'general merchandise', 'misc', 'miscellaneous',
]);

export function mapBankCategory(raw) {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (IGNORED_BANK_CATEGORIES.has(lower)) return null;
  return bankCategoryMap[lower] ?? null;
}
