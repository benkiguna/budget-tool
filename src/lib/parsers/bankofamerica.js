import { transactionId, cleanMerchantName, parseDate } from '../utils.js';

// Bank of America CSV headers:
//   Date, Description, Amount, Running Bal.
// Amount: negative = spend (already signed)
// Running Bal.: balance AFTER the transaction (CSV is newest-first)

export function parseBankOfAmerica(rows) {
  const transactions = rows.map((row) => {
    const merchantRaw = (row['Description'] ?? '').trim();
    const date = parseDate(row['Date']);
    const rawAmount = parseFloat(row['Amount']);
    if (isNaN(rawAmount) || !date || !merchantRaw) return null;

    return {
      id: transactionId(date, merchantRaw, rawAmount),
      date,
      merchant: cleanMerchantName(merchantRaw),
      merchantRaw,
      amount: rawAmount,
      category: 'Other',
      categorySource: 'uncategorized',
      sourceBank: 'bankOfAmerica',
      _bankCategoryRaw: '',
      notes: '',
    };
  }).filter(Boolean);

  // Extract opening/closing balance from Running Bal. column
  // CSV is newest-first: first row = closing, last row used to derive opening
  let balances = null;
  const validBalRows = rows.filter((r) => {
    const b = parseFloat((r['Running Bal.'] ?? '').replace(/,/g, ''));
    const a = parseFloat(r['Amount']);
    return !isNaN(b) && !isNaN(a);
  });
  if (validBalRows.length > 0) {
    const firstRow = validBalRows[0];
    const lastRow = validBalRows[validBalRows.length - 1];
    const closing = parseFloat(firstRow['Running Bal.'].replace(/,/g, ''));
    const lastBalance = parseFloat(lastRow['Running Bal.'].replace(/,/g, ''));
    const lastAmount = parseFloat(lastRow['Amount']);
    const opening = Math.round((lastBalance - lastAmount) * 100) / 100;
    balances = { opening, closing, supported: true };
  }

  return { transactions, balances };
}
