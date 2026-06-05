import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '..', 'budget.db'));

db.pragma('journal_mode = WAL');

// Step 1: create tables without new columns (safe for existing DBs)
db.exec(`
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
    id              TEXT PRIMARY KEY,
    date            TEXT,
    merchant        TEXT,
    merchantRaw     TEXT,
    amount          REAL,
    category        TEXT,
    categorySource  TEXT,
    sourceBank      TEXT,
    bankCategoryRaw TEXT,
    notes           TEXT
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

  CREATE INDEX IF NOT EXISTS idx_txn_date     ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
`);

// Step 2: migrations — add columns that may not exist in older DB files
const txColumns = db.prepare('PRAGMA table_info(transactions)').all().map((r) => r.name);
if (!txColumns.includes('importId')) {
  db.exec('ALTER TABLE transactions ADD COLUMN importId TEXT');
}

const ovColumns = db.prepare('PRAGMA table_info(overrides)').all().map((r) => r.name);
if (!ovColumns.includes('displayName')) {
  db.exec('ALTER TABLE overrides ADD COLUMN displayName TEXT');
}
if (!ovColumns.includes('domain')) {
  db.exec('ALTER TABLE overrides ADD COLUMN domain TEXT');
}
if (!ovColumns.includes('logo')) {
  db.exec('ALTER TABLE overrides ADD COLUMN logo TEXT');
}

// Step 3: indexes that depend on migrated columns
db.exec('CREATE INDEX IF NOT EXISTS idx_txn_import ON transactions(importId)');

export default db;
