// Transfer pairing: match credit card payment debits (checking outflows) to
// credit card credits (credit card inflows) for the same amount within a date window.
//
// When you pay a credit card from checking, the same money appears twice:
//   Checking:    -$2,400  May 15  (Credit Card Payment)
//   Credit card: +$2,400  May 17  (Credit Card Payment)
//
// Pairing criteria:
//   - Both transactions have category === 'Credit Card Payment'
//   - |debit.amount| ≈ credit.amount  (within $0.02 for rounding)
//   - |date difference| ≤ 7 days  (ACH float is typically 1–3 days)
//
// Unmatched debits  → checking paid a card we don't have imported
// Unmatched credits → credit card received payment from a bank we don't have imported

const AMOUNT_TOLERANCE = 0.02;
const WINDOW_DAYS = 7;

export function pairTransfers(transactions) {
  const ccPayments = transactions.filter((tx) => tx.category === 'Credit Card Payment');

  // Debits: outflows from checking/savings (negative amount)
  const debits = ccPayments
    .filter((tx) => tx.amount < 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Credits: inflows to credit card (positive amount = payment received)
  const credits = ccPayments
    .filter((tx) => tx.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const paired = [];
  const usedCreditIndices = new Set();

  for (const debit of debits) {
    const targetAmount = Math.abs(debit.amount);
    const debitTime = new Date(debit.date).getTime();

    // Find closest-date credit with matching amount within window
    let bestIdx = -1;
    let bestDaysDiff = Infinity;

    for (let i = 0; i < credits.length; i++) {
      if (usedCreditIndices.has(i)) continue;
      const credit = credits[i];

      if (Math.abs(credit.amount - targetAmount) > AMOUNT_TOLERANCE) continue;

      const daysDiff = Math.abs(new Date(credit.date).getTime() - debitTime) / 86_400_000;
      if (daysDiff > WINDOW_DAYS) continue;

      if (daysDiff < bestDaysDiff) {
        bestDaysDiff = daysDiff;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      usedCreditIndices.add(bestIdx);
      paired.push({
        debit,
        credit: credits[bestIdx],
        daysDiff: Math.round(bestDaysDiff),
      });
    }
  }

  const pairedDebitIds = new Set(paired.map((p) => p.debit.id));
  const unmatchedDebits = debits.filter((d) => !pairedDebitIds.has(d.id));
  const unmatchedCredits = credits.filter((_, i) => !usedCreditIndices.has(i));

  const totalAmount = paired.reduce((s, p) => s + Math.abs(p.debit.amount), 0);

  return { paired, unmatchedDebits, unmatchedCredits, totalAmount };
}

// Returns the count of unmatched transfers (for Anomalies badge)
export function unmatchedTransferCount(transactions) {
  const { unmatchedDebits, unmatchedCredits } = pairTransfers(transactions);
  return unmatchedDebits.length + unmatchedCredits.length;
}
