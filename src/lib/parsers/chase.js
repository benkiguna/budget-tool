import { transactionId, cleanMerchantName, parseDate } from '../utils.js';

// Credit card: Transaction Date, Post Date, Description, Category, Type, Amount
// Checking:    Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
// Amount: already signed — negative = spend, positive = payment/refund

export function parseChase(rows, isChecking = false) {
  const transactions = rows.map((row) => {
    const merchantRaw = (row['Description'] ?? '').trim();
    const dateStr = isChecking ? row['Posting Date'] : row['Transaction Date'];
    const date = parseDate(dateStr);
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
      sourceBank: isChecking ? 'chaseChecking' : 'chase',
      _bankCategoryRaw: (row['Category'] ?? '').trim(),
      notes: '',
    };
  }).filter(Boolean);

  // Chase Checking has a Balance column (balance AFTER the transaction, newest-first)
  let balances = null;
  if (isChecking) {
    const validBalRows = rows.filter((r) => {
      const b = parseFloat(r['Balance']);
      const a = parseFloat(r['Amount']);
      return !isNaN(b) && !isNaN(a);
    });
    if (validBalRows.length > 0) {
      const firstRow = validBalRows[0];
      const lastRow = validBalRows[validBalRows.length - 1];
      const closing = parseFloat(firstRow['Balance']);
      const lastBalance = parseFloat(lastRow['Balance']);
      const lastAmount = parseFloat(lastRow['Amount']);
      const opening = Math.round((lastBalance - lastAmount) * 100) / 100;
      balances = { opening, closing, supported: true };
    }
  }

  return { transactions, balances };
}
