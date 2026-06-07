// ── ID generation ────────────────────────────────────────────────────────────
// Stable 12-char hex ID from date + merchantRaw + amount. Used for deduplication.
export function transactionId(date, merchantRaw, amount) {
  const str = `${date}|${merchantRaw}|${amount}`;
  let h1 = 0, h2 = 5381;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = (Math.imul(h1, 31) + c) | 0;
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (hex1 + hex2).slice(0, 12);
}

// ── Merchant name cleaning ────────────────────────────────────────────────────
// Produces a human-readable display name from the raw CSV merchant string.
// Handles the messy patterns banks produce: Apple Pay suffixes, ACH descriptors,
// star-prefix payment codes, store numbers, state/city fragments, etc.
export function cleanMerchantName(raw) {
  let s = raw.trim();

  // 1. Apple Pay / bank transfer suffixes that get concatenated with no space
  //    e.g. "SAFEWAY #0464 REDMOND WAAPPLE PAY ENDING IN 6590"
  s = s.replace(/APPLE\s+PAY\s+ENDING\s+IN\s*.*/gi, '');
  s = s.replace(/ITEM\s+TRANSFERRED\s+FROM\s+PREV\s+ACCOUNT.*/gi, '');

  // 2. ACH/EFT identifiers: "PPD ID: 1234567", "WEB ID: 9039430511"
  s = s.replace(/\b(PPD|WEB|CCD|TEL|CTX|ARC)\s+ID:\s*\S+/gi, '');

  // 3. Star-code suffixes: "UBER   *TRIP" → "UBER", "PhiCom*DUFRY" → "PhiCom"
  //    Strip everything from the first * onwards (keeps merchant, drops descriptor)
  s = s.replace(/\s*\*.+$/, '');

  // 4. Store/location numbers: " #0464", "#1225"
  s = s.replace(/\s*#\w+/g, '');

  // 5. Long numeric sequences (reference / account numbers, 4+ digits)
  s = s.replace(/\s+\d{4,}/g, '');

  // 6. Collapse whitespace before location stripping
  s = s.replace(/\s+/g, ' ').trim();

  // 7. Trailing two-letter state abbreviation: " WA", " CA"
  //    Only strip city in step 8 if we actually found a state here
  const beforeState = s;
  s = s.replace(/\s+[A-Z]{2}\s*$/, '');
  const stateStripped = s !== beforeState;

  // 8. Strip city only when we confirmed a state preceded it.
  //    This avoids over-stripping merchant names like "CAPITAL ONE MOBILE PYMT".
  if (stateStripped) {
    // Deduplicate repeated trailing city: "REDMOND REDMOND" → "REDMOND"
    s = s.replace(/\s+(\S+)\s+\1\s*$/i, ' $1');
    // Strip one trailing all-caps word (the city)
    s = s.replace(/\s+[A-Z]{2,}$/, '');
  }

  // 9. Collapse again after stripping
  s = s.replace(/\s+/g, ' ').trim();

  // 10. Deduplicate consecutive repeated tokens: "TEMU.COM TEMU.COM" → "TEMU.COM"
  s = s.replace(/\b(\S+)\s+\1\b/gi, '$1');

  // 11. Known abbreviation expansions
  s = s.replace(/\bMKTPLACE\b|\bMKTPMTS\b/gi, 'Marketplace');
  s = s.replace(/\bWHSE\b/gi, 'Warehouse');
  s = s.replace(/\b(PYMT|PMTS)\b/gi, 'Payment');

  // 12. Title case
  s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  // 13. Lowercase domain extensions so "Claude.Ai" → "Claude.ai", "Temu.Com" → "Temu.com"
  s = s.replace(/\.[A-Z][a-z]{0,4}\b/g, (m) => m.toLowerCase());

  return s || raw.trim(); // fallback to raw if we stripped everything
}

// ── Keyword matching normalization ───────────────────────────────────────────
// Per spec: uppercase, strip digits and special chars, collapse whitespace.
export function normalizeForKeyword(merchantRaw) {
  return merchantRaw
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Currency formatting ───────────────────────────────────────────────────────
export function formatCurrency(amount) {
  return Math.abs(amount).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

// ── Date display formatting ───────────────────────────────────────────────────
// Formats a YYYY-MM-DD string as "1 Jun 2026"
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Formats an ISO datetime string (from DB) as "1 Jun 2026, 3:45 pm"
export function fmtDatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.includes('T') ? '' : 'Z'));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── CSV export ───────────────────────────────────────────────────────────────
// Converts an array of transactions to a CSV string and triggers a download.
export function exportTransactionsCSV(transactions, filename = 'transactions.csv') {
  const COLS = ['date', 'merchant', 'merchantRaw', 'amount', 'category', 'categorySource', 'confidence', 'transactionType', 'notes'];
  const header = COLS.join(',');
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = transactions.map((tx) => COLS.map((c) => escape(tx[c])).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Date parsing helpers ─────────────────────────────────────────────────────
// Attempts to parse M/D/YYYY or YYYY-MM-DD → ISO YYYY-MM-DD
export function parseDate(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // M/D/YYYY
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}
