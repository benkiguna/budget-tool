import { transactionId, cleanMerchantName, parseDate } from '../utils.js';

// Header signature: Trans. Date, Post Date, Description, Amount, Category
// Amount: positive = spend (flip sign on import)
// Note: Discover was acquired by Capital One in May 2025 — watch for header drift

export function parseDiscover(rows) {
  return rows.map((row) => {
    const merchantRaw = (row['Description'] ?? '').trim();
    const date = parseDate(row['Trans. Date'] ?? row['Trans Date'] ?? row['Transaction Date']);
    const rawAmount = parseFloat(row['Amount']);
    if (isNaN(rawAmount) || !date || !merchantRaw) return null;

    // Discover: positive = spend, so negate to match unified convention (negative = spend)
    const amount = -rawAmount;

    return {
      id: transactionId(date, merchantRaw, amount),
      date,
      merchant: cleanMerchantName(merchantRaw),
      merchantRaw,
      amount,
      category: 'Other',
      categorySource: 'uncategorized',
      sourceBank: 'discover',
      _bankCategoryRaw: (row['Category'] ?? '').trim(),
      notes: '',
    };
  }).filter(Boolean);
}
