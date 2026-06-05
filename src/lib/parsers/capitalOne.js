import { transactionId, cleanMerchantName, parseDate } from '../utils.js';

// Header signature: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
// Debit: positive float = spend; Credit: positive float = payment/refund
// Normalize: amount = Credit ? +Credit : -Debit

export function parseCapitalOne(rows) {
  return rows.map((row) => {
    const merchantRaw = (row['Description'] ?? '').trim();
    const date = parseDate(row['Transaction Date']);
    const debit = parseFloat(row['Debit']);
    const credit = parseFloat(row['Credit']);
    if (!date || !merchantRaw) return null;

    const hasDebit = !isNaN(debit) && debit > 0;
    const hasCredit = !isNaN(credit) && credit > 0;
    if (!hasDebit && !hasCredit) return null;

    // Per spec: amount = Credit ? +Credit : -Debit
    const amount = hasCredit ? credit : -debit;

    return {
      id: transactionId(date, merchantRaw, amount),
      date,
      merchant: cleanMerchantName(merchantRaw),
      merchantRaw,
      amount,
      category: 'Other',
      categorySource: 'uncategorized',
      sourceBank: 'capitalOne',
      _bankCategoryRaw: (row['Category'] ?? '').trim(),
      notes: '',
    };
  }).filter(Boolean);
}
