import { transactionId, cleanMerchantName, parseDate } from '../utils.js';

// American Express CSV headers:
//   Date, Description, Amount
// Amount: positive = spend (charges are positive), negative = payment/credit — flip sign.

export function parseAmex(rows) {
  return rows.map((row) => {
    const merchantRaw = (row['Description'] ?? '').trim();
    const date = parseDate(row['Date']);
    const rawAmount = parseFloat(row['Amount']);
    if (isNaN(rawAmount) || !date || !merchantRaw) return null;

    // Amex: positive = charge, negative = payment — flip to unified convention
    const amount = -rawAmount;

    return {
      id: transactionId(date, merchantRaw, amount),
      date,
      merchant: cleanMerchantName(merchantRaw),
      merchantRaw,
      amount,
      category: 'Other',
      categorySource: 'uncategorized',
      sourceBank: 'amex',
      _bankCategoryRaw: (row['Category'] ?? '').trim(),
      notes: '',
    };
  }).filter(Boolean);
}
