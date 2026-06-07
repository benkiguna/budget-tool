import express from 'express';
import session from 'express-session';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import authRouter from './routes/auth.js';
import plaidRouter from './routes/plaid.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// ── Google OAuth ───────────────────────────────────────────────────────────────
app.use('/auth', authRouter);

// ── Plaid ─────────────────────────────────────────────────────────────────────
app.use('/api/plaid', plaidRouter);

// ── Auth ──────────────────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  const token = req.headers['x-api-token'];
  if (process.env.API_TOKEN && token !== process.env.API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', async (_req, res) => {
  const { rows } = await db.execute('SELECT * FROM transactions ORDER BY date DESC');
  res.json(rows.map(({ bankCategoryRaw, ...row }) => ({ ...row, _bankCategoryRaw: bankCategoryRaw })));
});

app.put('/api/transactions', async (req, res) => {
  const transactions = req.body;
  const stmts = [{ sql: 'DELETE FROM transactions', args: [] }];
  for (const tx of transactions) {
    stmts.push({
      sql: `INSERT OR REPLACE INTO transactions
              (id, date, merchant, merchantRaw, amount, category, categorySource, sourceBank, bankCategoryRaw, notes, importId, plaid_transaction_id, account_id, source, pending)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        tx.id, tx.date, tx.merchant, tx.merchantRaw, tx.amount,
        tx.category, tx.categorySource, tx.sourceBank,
        tx._bankCategoryRaw ?? '', tx.notes ?? null, tx.importId ?? null,
        tx.plaid_transaction_id ?? null, tx.account_id ?? null,
        tx.source ?? 'csv', tx.pending ?? 0,
      ],
    });
  }
  await db.batch(stmts, 'write');
  res.json({ ok: true });
});

app.post('/api/transactions/batch', async (req, res) => {
  const { importId, transactions } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions must be array' });

  const stmts = transactions.map((tx) => ({
    sql: `INSERT OR IGNORE INTO transactions
            (id, date, merchant, merchantRaw, amount, category, categorySource, sourceBank, bankCategoryRaw, notes, importId, plaid_transaction_id, account_id, source, pending)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tx.id, tx.date, tx.merchant, tx.merchantRaw, tx.amount,
      tx.category, tx.categorySource, tx.sourceBank,
      tx._bankCategoryRaw ?? '', tx.notes ?? null, importId ?? null,
      tx.plaid_transaction_id ?? null, tx.account_id ?? null,
      tx.source ?? 'csv', tx.pending ?? 0,
    ],
  }));

  const results = await db.batch(stmts, 'write');
  const added = results.reduce((n, r) => n + (r.rowsAffected ?? 0), 0);
  const skipped = transactions.length - added;
  res.json({ ok: true, importId, added, skipped });
});

// ── Imports (audit log) ───────────────────────────────────────────────────────

app.get('/api/imports', async (_req, res) => {
  const { rows } = await db.execute('SELECT * FROM imports ORDER BY imported_at DESC');
  res.json(rows);
});

app.post('/api/imports', async (req, res) => {
  const {
    id, filename, bank, dateFrom, dateTo,
    rowsParsed, rowsAdded, rowsSkipped,
    balanceOpening, balanceClosing,
  } = req.body;

  let balanceComputed = null;
  let balanceMatch = null;
  let balanceDiscrepancy = null;

  if (balanceOpening != null && balanceClosing != null && id) {
    const { rows } = await db.execute({
      sql: 'SELECT SUM(amount) AS total FROM transactions WHERE importId = ?',
      args: [id],
    });
    const total = rows[0]?.total ?? 0;
    balanceComputed = Math.round((balanceOpening + total) * 100) / 100;
    balanceDiscrepancy = Math.round((balanceComputed - balanceClosing) * 100) / 100;
    balanceMatch = Math.abs(balanceDiscrepancy) < 0.02 ? 1 : 0;
  }

  await db.execute({
    sql: `INSERT OR REPLACE INTO imports
            (id, filename, bank, date_from, date_to, rows_parsed, rows_added, rows_skipped,
             balance_opening, balance_closing, balance_computed, balance_match, balance_discrepancy)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id, filename, bank, dateFrom, dateTo,
      rowsParsed ?? 0, rowsAdded ?? 0, rowsSkipped ?? 0,
      balanceOpening ?? null, balanceClosing ?? null,
      balanceComputed, balanceMatch, balanceDiscrepancy,
    ],
  });

  res.json({ ok: true, id, balanceMatch, balanceDiscrepancy });
});

app.delete('/api/imports/:id', async (req, res) => {
  const { id } = req.params;
  await db.batch([
    { sql: 'DELETE FROM transactions WHERE importId = ?', args: [id] },
    { sql: 'DELETE FROM imports WHERE id = ?', args: [id] },
  ], 'write');
  res.json({ ok: true });
});

// ── Overrides ─────────────────────────────────────────────────────────────────

app.get('/api/overrides', async (_req, res) => {
  const { rows } = await db.execute('SELECT * FROM overrides');
  const result = {};
  for (const { merchantRaw, category, source, savedAt, displayName, domain, logo } of rows) {
    result[merchantRaw] = {
      category, source, savedAt,
      ...(displayName ? { displayName } : {}),
      ...(domain ? { domain } : {}),
      ...(logo ? { logo } : {}),
    };
  }
  res.json(result);
});

app.put('/api/overrides', async (req, res) => {
  const overrides = req.body;
  const stmts = [{ sql: 'DELETE FROM overrides', args: [] }];
  for (const [merchantRaw, val] of Object.entries(overrides)) {
    stmts.push({
      sql: 'INSERT OR REPLACE INTO overrides (merchantRaw, category, source, savedAt, displayName, domain, logo) VALUES (?,?,?,?,?,?,?)',
      args: [
        merchantRaw, val.category ?? null, val.source ?? null, val.savedAt ?? null,
        val.displayName ?? null, val.domain ?? null, val.logo ?? null,
      ],
    });
  }
  await db.batch(stmts, 'write');
  res.json({ ok: true });
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/settings', async (_req, res) => {
  const { rows } = await db.execute('SELECT key, value FROM settings');
  const settings = {};
  for (const { key, value } of rows) {
    try { settings[key] = JSON.parse(value); } catch { settings[key] = value; }
  }
  res.json(settings);
});

app.put('/api/settings', async (req, res) => {
  const stmts = Object.entries(req.body).map(([key, value]) => ({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)',
    args: [key, JSON.stringify(value)],
  }));
  await db.batch(stmts, 'write');
  res.json({ ok: true });
});

// ── Clear all ─────────────────────────────────────────────────────────────────

app.delete('/api/data', async (_req, res) => {
  await db.batch([
    { sql: 'DELETE FROM transactions', args: [] },
    { sql: 'DELETE FROM overrides', args: [] },
    { sql: 'DELETE FROM settings', args: [] },
    { sql: 'DELETE FROM imports', args: [] },
    { sql: 'UPDATE plaid_items SET cursor = NULL, earliest_date = NULL, last_synced = NULL', args: [] },
  ], 'write');
  res.json({ ok: true });
});

// ── Plaid Link popup page (no COEP — Plaid CDN must load freely) ──────────────

app.get('/plaid-link', (req, res) => {
  const linkToken = req.query.token ?? '';
  const apiToken = process.env.API_TOKEN ?? '';
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Connect Bank</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #09090b; color: #a1a1aa; gap: 12px; }
    p { font-size: 14px; margin: 0; }
    .spinner { width: 20px; height: 20px; border: 2px solid #3f3f46; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner" id="spinner"></div>
  <p id="status">Connecting to your bank…</p>
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
  <script>
    const LINK_TOKEN = ${JSON.stringify(linkToken)};
    const API_TOKEN  = ${JSON.stringify(apiToken)};

    function setStatus(msg) { document.getElementById('status').textContent = msg; }

    async function exchange(public_token, institution) {
      setStatus('Linking account…');
      const headers = { 'Content-Type': 'application/json' };
      if (API_TOKEN) headers['x-api-token'] = API_TOKEN;
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST', headers,
        body: JSON.stringify({ public_token, institution }),
      });
      if (!res.ok) throw new Error(await res.text());
    }

    if (!LINK_TOKEN) {
      document.getElementById('spinner').style.display = 'none';
      setStatus('Error: missing link token.');
    } else {
      const handler = Plaid.create({
        token: LINK_TOKEN,
        onSuccess: async (public_token, metadata) => {
          try {
            await exchange(public_token, metadata.institution);
            setStatus('Connected! Closing…');
          } catch (e) {
            document.getElementById('spinner').style.display = 'none';
            setStatus('Error: ' + e.message);
            return;
          }
          window.close();
        },
        onExit: () => window.close(),
        onEvent: (name) => console.log('[plaid]', name),
      });
      handler.open();
    }
  </script>
</body>
</html>`);
});

// ── Static frontend (production) ──────────────────────────────────────────────

app.use(express.static(join(__dirname, '../dist')));
app.get('/{*path}', (_req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// ── Local dev: listen directly. Vercel: export the app. ───────────────────────

if (process.env.NODE_ENV !== 'production' || process.env.LISTEN) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Budget API → http://localhost:${PORT}`));
}

export default app;
