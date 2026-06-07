import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:budget.db',
  authToken: process.env.TURSO_AUTH_TOKEN, // undefined in local dev (file mode)
});

// ── Schema + migrations ───────────────────────────────────────────────────────

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS imports (
    id                  TEXT PRIMARY KEY,
    filename            TEXT,
    bank                TEXT,
    date_from           TEXT,
    date_to             TEXT,
    rows_parsed         INTEGER DEFAULT 0,
    rows_added          INTEGER DEFAULT 0,
    rows_skipped        INTEGER DEFAULT 0,
    balance_opening     REAL,
    balance_closing     REAL,
    balance_computed    REAL,
    balance_match       INTEGER,
    balance_discrepancy REAL,
    imported_at         TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY,
    date                TEXT,
    merchant            TEXT,
    merchantRaw         TEXT,
    amount              REAL,
    category            TEXT,
    categorySource      TEXT,
    sourceBank          TEXT,
    bankCategoryRaw     TEXT,
    notes               TEXT,
    importId            TEXT,
    plaid_transaction_id TEXT,
    account_id          TEXT,
    source              TEXT DEFAULT 'csv',
    pending             INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS overrides (
    merchantRaw TEXT PRIMARY KEY,
    category    TEXT,
    source      TEXT,
    savedAt     INTEGER,
    displayName TEXT,
    domain      TEXT,
    logo        TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS plaid_items (
    item_id          TEXT PRIMARY KEY,
    institution_id   TEXT,
    institution_name TEXT,
    access_token     TEXT,
    cursor           TEXT,
    last_synced      TEXT,
    earliest_date    TEXT,
    error_code       TEXT
  );

  CREATE TABLE IF NOT EXISTS plaid_accounts (
    account_id TEXT PRIMARY KEY,
    item_id    TEXT REFERENCES plaid_items(item_id) ON DELETE CASCADE,
    name       TEXT,
    mask       TEXT,
    type       TEXT,
    subtype    TEXT,
    enabled    INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_txn_date     ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
  CREATE INDEX IF NOT EXISTS idx_txn_import   ON transactions(importId);
`);

// Unique index needs separate statement (CREATE INDEX IF NOT EXISTS doesn't support WHERE in all libsql versions)
await db.execute(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_plaid_id ON transactions(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL`
).catch(() => {}); // ignore if already exists

export default db;
