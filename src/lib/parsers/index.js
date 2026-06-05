import Papa from 'papaparse';
import { parseChase } from './chase.js';
import { parseCapitalOne } from './capitalOne.js';
import { parseDiscover } from './discover.js';
import { parseBankOfAmerica } from './bankofamerica.js';
import { parseWellsFargo } from './wellsfargo.js';
import { parseAmex } from './amex.js';

const SIGNATURES = {
  chase: ['transaction date', 'post date', 'description', 'category', 'type', 'amount'],
  chaseChecking: ['details', 'posting date', 'description', 'amount', 'type', 'balance'],
  capitalOne: ['transaction date', 'posted date', 'card no.', 'description', 'category', 'debit', 'credit'],
  discover: ['trans. date', 'post date', 'description', 'amount', 'category'],
  bankOfAmerica: ['date', 'description', 'amount', 'running bal.'],
  amex: ['date', 'description', 'amount'],
  // Wells Fargo has no header row — detected by row structure after BofA/Amex checked
};

function normalizeHeader(h) {
  return h.trim().toLowerCase();
}

function detectBank(headers) {
  const hs = new Set(headers.map(normalizeHeader));
  if (SIGNATURES.capitalOne.every((s) => hs.has(s))) return 'capitalOne';
  if (SIGNATURES.discover.every((s) => hs.has(s))) return 'discover';
  if (SIGNATURES.chase.every((s) => hs.has(s))) return 'chase';
  if (SIGNATURES.chaseChecking.every((s) => hs.has(s))) return 'chaseChecking';
  if (SIGNATURES.bankOfAmerica.every((s) => hs.has(s))) return 'bankOfAmerica';
  // Amex check: after BofA (which also has date/description/amount + running bal.)
  if (SIGNATURES.amex.every((s) => hs.has(s))) return 'amex';
  // Wells Fargo: headerless CSV — first "header" field is a date-like string
  if (headers.length >= 5 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(headers[0]?.trim())) return 'wellsFargo';
  return null;
}

const PARSERS = {
  chase: parseChase,
  chaseChecking: (rows) => parseChase(rows, true),
  capitalOne: parseCapitalOne,
  discover: parseDiscover,
  bankOfAmerica: parseBankOfAmerica,
  wellsFargo: parseWellsFargo,
  amex: parseAmex,
};

export function parseCSV(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.data.length === 0 && result.errors.length > 0) {
    throw new Error(`CSV parse failed: ${result.errors[0].message}`);
  }

  const headers = result.meta.fields ?? [];
  const bank = detectBank(headers);

  if (!bank) {
    throw new Error(
      `Unrecognized CSV format. Found headers: ${headers.join(', ')}\n` +
      `Expected one of: Chase, Capital One, or Discover export format.`
    );
  }

  const raw = PARSERS[bank](result.data);

  // BofA and Chase Checking return { transactions, balances }
  // Other parsers return a flat transactions array
  const transactions = Array.isArray(raw) ? raw : raw.transactions;
  const balances = Array.isArray(raw) ? null : (raw.balances ?? null);

  return { bank, transactions, balances };
}
