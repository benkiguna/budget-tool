import { transactionId, cleanMerchantName, parseDate } from '../utils.js';

// Wells Fargo CSV headers (no header row — positional columns):
//   "Date","Amount","*","*","Description"
// Amount: negative = spend (already signed)

export function parseWellsFargo(rows) {
  return rows.map((row) => {
    // Wells Fargo CSVs may have no header; PapaParse assigns positional keys
    const merchantRaw = (row['Description'] ?? row['4'] ?? '').trim();
    const dateRaw = row['Date'] ?? row['0'] ?? '';
    const date = parseDate(dateRaw);
    const amountRaw = row['Amount'] ?? row['1'] ?? '';
    const rawAmount = parseFloat(amountRaw);
    if (isNaN(rawAmount) || !date || !merchantRaw) return null;

    return {
      id: transactionId(date, merchantRaw, rawAmount),
      date,
      merchant: cleanMerchantName(merchantRaw),
      merchantRaw,
      amount: rawAmount,
      category: 'Other',
      categorySource: 'uncategorized',
      sourceBank: 'wellsFargo',
      _bankCategoryRaw: '',
      notes: '',
    };
  }).filter(Boolean);
}
