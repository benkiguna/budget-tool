import express from 'express';
import db from './db.js';

const app = express();
app.use(express.json({ limit: '50mb' }));

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', (_req, res) => {
  const rows = db.prepare('SELECT * FROM transactions ORDER BY date DESC').all();
  res.json(rows.map(({ bankCategoryRaw, ...row }) => ({ ...row, _bankCategoryRaw: bankCategoryRaw })));
});

// Full state sync (overrides, notes, category edits) — preserves importId from request body
app.put('/api/transactions', (req, res) => {
  const transactions = req.body;
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO transactions
      (id, date, merchant, merchantRaw, amount, category, categorySource, sourceBank, bankCategoryRaw, notes, importId)
    VALUES
      (@id, @date, @merchant, @merchantRaw, @amount, @category, @categorySource, @sourceBank, @bankCategoryRaw, @notes, @importId)
  `);
  db.transaction(() => {
    db.prepare('DELETE FROM transactions').run();
    for (const tx of transactions) {
      upsert.run({
        ...tx,
        bankCategoryRaw: tx._bankCategoryRaw ?? '',
        importId: tx.importId ?? null,
      });
    }
  })();
  res.json({ ok: true });
});

// Incremental import — INSERT OR IGNORE, returns counts
app.post('/api/transactions/batch', (req, res) => {
  const { importId, transactions } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions must be array' });

  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (id, date, merchant, merchantRaw, amount, category, categorySource, sourceBank, bankCategoryRaw, notes, importId)
    VALUES
      (@id, @date, @merchant, @merchantRaw, @amount, @category, @categorySource, @sourceBank, @bankCategoryRaw, @notes, @importId)
  `);

  let added = 0;
  let skipped = 0;

  db.transaction(() => {
    for (const tx of transactions) {
      const info = insert.run({
        ...tx,
        bankCategoryRaw: tx._bankCategoryRaw ?? '',
        importId: importId ?? null,
      });
      if (info.changes > 0) added++;
      else skipped++;
    }
  })();

  res.json({ ok: true, importId, added, skipped });
});

// ── Imports (audit log) ───────────────────────────────────────────────────────

app.get('/api/imports', (_req, res) => {
  const rows = db.prepare('SELECT * FROM imports ORDER BY imported_at DESC').all();
  res.json(rows);
});

app.post('/api/imports', (req, res) => {
  const {
    id, filename, bank, dateFrom, dateTo,
    rowsParsed, rowsAdded, rowsSkipped,
    balanceOpening, balanceClosing,
  } = req.body;

  // Compute balance verification if opening/closing were provided
  let balanceComputed = null;
  let balanceMatch = null;
  let balanceDiscrepancy = null;

  if (balanceOpening != null && balanceClosing != null && id) {
    const row = db.prepare('SELECT SUM(amount) AS total FROM transactions WHERE importId = ?').get(id);
    const total = row?.total ?? 0;
    balanceComputed = Math.round((balanceOpening + total) * 100) / 100;
    balanceDiscrepancy = Math.round((balanceComputed - balanceClosing) * 100) / 100;
    balanceMatch = Math.abs(balanceDiscrepancy) < 0.02 ? 1 : 0;
  }

  db.prepare(`
    INSERT OR REPLACE INTO imports
      (id, filename, bank, date_from, date_to, rows_parsed, rows_added, rows_skipped,
       balance_opening, balance_closing, balance_computed, balance_match, balance_discrepancy)
    VALUES
      (@id, @filename, @bank, @dateFrom, @dateTo, @rowsParsed, @rowsAdded, @rowsSkipped,
       @balanceOpening, @balanceClosing, @balanceComputed, @balanceMatch, @balanceDiscrepancy)
  `).run({
    id, filename, bank, dateFrom, dateTo,
    rowsParsed: rowsParsed ?? 0,
    rowsAdded: rowsAdded ?? 0,
    rowsSkipped: rowsSkipped ?? 0,
    balanceOpening: balanceOpening ?? null,
    balanceClosing: balanceClosing ?? null,
    balanceComputed,
    balanceMatch,
    balanceDiscrepancy,
  });

  res.json({ ok: true, id, balanceMatch, balanceDiscrepancy });
});

app.delete('/api/imports/:id', (req, res) => {
  const { id } = req.params;
  db.transaction(() => {
    db.prepare('DELETE FROM transactions WHERE importId = ?').run(id);
    db.prepare('DELETE FROM imports WHERE id = ?').run(id);
  })();
  res.json({ ok: true });
});

// ── Overrides ─────────────────────────────────────────────────────────────────

app.get('/api/overrides', (_req, res) => {
  const rows = db.prepare('SELECT * FROM overrides').all();
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

app.put('/api/overrides', (req, res) => {
  const overrides = req.body;
  const insert = db.prepare(
    'INSERT OR REPLACE INTO overrides (merchantRaw, category, source, savedAt, displayName, domain, logo) VALUES (@merchantRaw, @category, @source, @savedAt, @displayName, @domain, @logo)'
  );
  // Debug: log incoming overrides that have domain/logo
  const withLogo = Object.entries(overrides).filter(([, v]) => v.domain || v.logo);
  if (withLogo.length) {
    console.log(`[overrides PUT] ${Object.keys(overrides).length} total, ${withLogo.length} with domain/logo:`);
    withLogo.slice(0, 5).forEach(([raw, v]) =>
      console.log(`  ${raw.slice(0, 40)} → domain=${v.domain}, logo=${v.logo?.slice(0, 60)}`)
    );
  } else {
    console.log(`[overrides PUT] ${Object.keys(overrides).length} total, 0 with domain/logo`);
  }

  db.transaction(() => {
    db.prepare('DELETE FROM overrides').run();
    for (const [merchantRaw, val] of Object.entries(overrides)) {
      insert.run({
        merchantRaw,
        category: val.category ?? null,
        source: val.source ?? null,
        savedAt: val.savedAt ?? null,
        displayName: val.displayName ?? null,
        domain: val.domain ?? null,
        logo: val.logo ?? null,
      });
    }
  })();

  // Debug: verify what was actually written
  const saved = db.prepare('SELECT count(*) as total FROM overrides WHERE domain IS NOT NULL').get();
  const savedLogo = db.prepare('SELECT count(*) as total FROM overrides WHERE logo IS NOT NULL').get();
  console.log(`[overrides PUT] After write: ${saved.total} with domain, ${savedLogo.total} with logo in DB`);

  res.json({ ok: true });
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const { key, value } of rows) {
    try { settings[key] = JSON.parse(value); } catch { settings[key] = value; }
  }
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)');
  db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run({ key, value: JSON.stringify(value) });
    }
  })();
  res.json({ ok: true });
});

// ── Clear all ─────────────────────────────────────────────────────────────────

app.delete('/api/data', (_req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM overrides').run();
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM imports').run();
  })();
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = 3001;
app.listen(PORT, () => console.log(`Budget API → http://localhost:${PORT}`));
