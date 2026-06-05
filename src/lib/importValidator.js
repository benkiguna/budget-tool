// Client-side validation of parsed transactions before user confirms import.
// Runs entirely in the browser — no network calls.

const LARGE_AMOUNT_THRESHOLD = 50_000;

export function validateTransactions(transactions) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = today.toISOString().split('T')[0];

  const warnings = [];
  const errors = [];

  // Future-dated transactions (> today, allowing 1 day for timezone skew)
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const futureDated = transactions.filter((tx) => tx.date > tomorrowStr);
  if (futureDated.length > 0) {
    warnings.push({
      type: 'future_dates',
      label: 'Future-dated transactions',
      count: futureDated.length,
      detail: `${futureDated.length} transaction${futureDated.length !== 1 ? 's' : ''} dated after today`,
      examples: futureDated.slice(0, 3).map((tx) => `${tx.date} ${tx.merchant} ${tx.amount}`),
    });
  }

  // Unusually large amounts
  const large = transactions.filter((tx) => Math.abs(tx.amount) > LARGE_AMOUNT_THRESHOLD);
  if (large.length > 0) {
    warnings.push({
      type: 'large_amounts',
      label: 'Unusually large amounts',
      count: large.length,
      detail: `${large.length} transaction${large.length !== 1 ? 's' : ''} exceed $${LARGE_AMOUNT_THRESHOLD.toLocaleString()} — verify no misplaced decimal`,
      examples: large.slice(0, 3).map((tx) => `${tx.merchant} $${Math.abs(tx.amount).toFixed(2)}`),
    });
  }

  // Blank merchant names (these likely failed to parse cleanly)
  const blankMerchants = transactions.filter((tx) => !tx.merchantRaw || tx.merchantRaw.trim() === '');
  if (blankMerchants.length > 0) {
    errors.push({
      type: 'blank_merchants',
      label: 'Missing merchant description',
      count: blankMerchants.length,
      detail: `${blankMerchants.length} row${blankMerchants.length !== 1 ? 's' : ''} have no merchant name — they will be imported as "Unknown"`,
    });
  }

  // Compute debit/credit summary
  const debits = transactions.filter((tx) => tx.amount < 0);
  const credits = transactions.filter((tx) => tx.amount > 0);
  const debitTotal = debits.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const creditTotal = credits.reduce((s, tx) => s + tx.amount, 0);

  // Date range
  const dates = transactions.map((tx) => tx.date).filter(Boolean).sort();
  const dateRange = dates.length > 0
    ? { from: dates[0], to: dates[dates.length - 1] }
    : null;

  return {
    warnings,
    errors,
    summary: {
      debits: { count: debits.length, total: debitTotal },
      credits: { count: credits.length, total: creditTotal },
      dateRange,
    },
  };
}

// Format a date string YYYY-MM-DD as "1 Jun 2026"
export function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
