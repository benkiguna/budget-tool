import { db } from './index.js';

export async function initSchema() {
  // Core tables (mirrors server/db.js schema for OPFS SQLite)
  await db.exec(`
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
  `);

  await db.exec(`
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
      notes           TEXT,
      importId        TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS overrides (
      merchantRaw TEXT PRIMARY KEY,
      category    TEXT,
      source      TEXT,
      savedAt     INTEGER,
      displayName TEXT,
      domain      TEXT,
      logo        TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_txn_date     ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_txn_import   ON transactions(importId);
  `);
}
