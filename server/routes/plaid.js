import express from 'express';
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from 'plaid';
import db from '../db.js';

const router = express.Router();

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function mapPlaidTx(tx, institutionName) {
  return {
    id: tx.transaction_id,
    plaid_transaction_id: tx.transaction_id,
    date: tx.authorized_date || tx.date,
    merchant: tx.merchant_name ? toTitleCase(tx.merchant_name) : tx.name,
    merchantRaw: tx.name,
    amount: -(tx.amount),
    category: 'Other',
    categorySource: 'uncategorized',
    sourceBank: institutionName,
    bankCategoryRaw: tx.personal_finance_category?.primary?.toLowerCase() || '',
    notes: null,
    importId: null,
    account_id: tx.account_id,
    source: 'plaid',
    pending: tx.pending ? 1 : 0,
  };
}

async function syncItem(itemId) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM plaid_items WHERE item_id = ?', args: [itemId] });
  const item = rows[0];
  if (!item) throw new Error(`Item ${itemId} not found`);

  let cursor = item.cursor || undefined;
  const added = [], modified = [], removed = [];
  let hasMore = true;

  while (hasMore) {
    const resp = await plaidClient.transactionsSync({
      access_token: item.access_token,
      cursor,
      options: { include_personal_finance_category: true },
    });
    const data = resp.data;
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  let earliestDate = item.earliest_date;
  if (!earliestDate && added.length > 0) {
    const dates = added.map((t) => t.authorized_date || t.date).filter(Boolean).sort();
    earliestDate = dates[0] ?? null;
  }

  const stmts = [];

  for (const tx of removed) {
    stmts.push({ sql: 'DELETE FROM transactions WHERE plaid_transaction_id = ?', args: [tx.transaction_id] });
  }

  for (const tx of added) {
    const m = mapPlaidTx(tx, item.institution_name);
    stmts.push({
      sql: `INSERT OR IGNORE INTO transactions
              (id, plaid_transaction_id, date, merchant, merchantRaw, amount,
               category, categorySource, sourceBank, bankCategoryRaw, notes, importId,
               account_id, source, pending)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        m.id, m.plaid_transaction_id, m.date, m.merchant, m.merchantRaw, m.amount,
        m.category, m.categorySource, m.sourceBank, m.bankCategoryRaw, m.notes, m.importId,
        m.account_id, m.source, m.pending,
      ],
    });
  }

  for (const tx of modified) {
    const m = mapPlaidTx(tx, item.institution_name);
    stmts.push({
      sql: `UPDATE transactions SET
              date=?, merchant=?, merchantRaw=?, amount=?, bankCategoryRaw=?, account_id=?, pending=?
            WHERE plaid_transaction_id=?`,
      args: [m.date, m.merchant, m.merchantRaw, m.amount, m.bankCategoryRaw, m.account_id, m.pending, m.plaid_transaction_id],
    });
  }

  stmts.push({
    sql: `UPDATE plaid_items SET cursor=?, last_synced=?, earliest_date=COALESCE(earliest_date,?), error_code=NULL WHERE item_id=?`,
    args: [cursor, new Date().toISOString(), earliestDate, itemId],
  });

  await db.batch(stmts, 'write');
  return { added: added.length, modified: modified.length, removed: removed.length };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/create-link-token', async (req, res) => {
  try {
    const { rows } = await db.execute('SELECT COUNT(*) AS n FROM plaid_items');
    if ((rows[0]?.n ?? 0) >= 10) {
      return res.status(400).json({ error: 'Maximum 10 connected banks reached (Trial plan limit).' });
    }
    const resp = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'budget-tool-user' },
      client_name: 'Budget Tool',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      transactions: { days_requested: 730 },
    });
    res.json({ link_token: resp.data.link_token });
  } catch (e) {
    console.error('[plaid] create-link-token error:', e.response?.data ?? e.message);
    res.status(500).json({ error: e.response?.data?.error_message ?? e.message });
  }
});

router.post('/exchange-token', async (req, res) => {
  const { public_token, institution } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token required' });
  try {
    const exchangeResp = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResp.data;
    const institution_id = institution?.institution_id ?? '';
    const institution_name = institution?.name ?? 'Unknown Bank';

    await db.execute({
      sql: `INSERT OR REPLACE INTO plaid_items (item_id, institution_id, institution_name, access_token)
            VALUES (?,?,?,?)`,
      args: [item_id, institution_id, institution_name, access_token],
    });

    const accountsResp = await plaidClient.accountsGet({ access_token });
    const acctStmts = accountsResp.data.accounts.map((acct) => ({
      sql: `INSERT OR REPLACE INTO plaid_accounts (account_id, item_id, name, mask, type, subtype)
            VALUES (?,?,?,?,?,?)`,
      args: [acct.account_id, item_id, acct.name, acct.mask, acct.type, acct.subtype],
    }));
    if (acctStmts.length) await db.batch(acctStmts, 'write');

    // Initial sync — awaited so Vercel doesn't kill it before completion
    await syncItem(item_id);

    res.json({ ok: true, item_id, institution_name });
  } catch (e) {
    console.error('[plaid] exchange-token error:', e.response?.data ?? e.message);
    res.status(500).json({ error: e.response?.data?.error_message ?? e.message });
  }
});

router.get('/items', async (_req, res) => {
  const { rows: items } = await db.execute(
    'SELECT item_id, institution_id, institution_name, last_synced, earliest_date, error_code FROM plaid_items'
  );
  const { rows: accounts } = await db.execute('SELECT * FROM plaid_accounts');

  const accountsByItem = {};
  for (const acct of accounts) {
    (accountsByItem[acct.item_id] ??= []).push(acct);
  }

  res.json(items.map((item) => ({ ...item, accounts: accountsByItem[item.item_id] ?? [] })));
});

router.post('/sync', async (req, res) => {
  const { itemId, reset } = req.body;
  try {
    const { rows: items } = await db.execute(
      itemId
        ? { sql: 'SELECT item_id FROM plaid_items WHERE item_id = ?', args: [itemId] }
        : { sql: 'SELECT item_id FROM plaid_items', args: [] }
    );

    if (!items.length) return res.json({ ok: true, results: [] });

    if (reset) {
      await db.batch(
        items.map((i) => ({
          sql: 'UPDATE plaid_items SET cursor = NULL, earliest_date = NULL WHERE item_id = ?',
          args: [i.item_id],
        })),
        'write'
      );
    }

    const results = await Promise.allSettled(items.map((i) => syncItem(i.item_id)));
    const summary = results.map((r, idx) => ({
      item_id: items[idx].item_id,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    }));

    res.json({ ok: true, results: summary });
  } catch (e) {
    console.error('[plaid] sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/items/:itemId', async (req, res) => {
  const { itemId } = req.params;
  const { rows } = await db.execute({ sql: 'SELECT access_token FROM plaid_items WHERE item_id = ?', args: [itemId] });
  if (!rows[0]) return res.status(404).json({ error: 'Item not found' });

  try {
    await plaidClient.itemRemove({ access_token: rows[0].access_token });
  } catch (e) {
    console.warn('[plaid] itemRemove error (proceeding):', e.response?.data ?? e.message);
  }

  await db.batch([
    { sql: 'DELETE FROM transactions WHERE account_id IN (SELECT account_id FROM plaid_accounts WHERE item_id = ?)', args: [itemId] },
    { sql: 'DELETE FROM plaid_accounts WHERE item_id = ?', args: [itemId] },
    { sql: 'DELETE FROM plaid_items WHERE item_id = ?', args: [itemId] },
  ], 'write');

  res.json({ ok: true });
});

router.patch('/accounts/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const { enabled } = req.body;
  await db.execute({ sql: 'UPDATE plaid_accounts SET enabled = ? WHERE account_id = ?', args: [enabled ? 1 : 0, accountId] });
  res.json({ ok: true });
});

router.post('/webhook', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;
  res.json({ ok: true });

  if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
    syncItem(item_id).catch((e) => {
      console.error(`[plaid] webhook sync failed for ${item_id}:`, e.message);
      db.execute({ sql: 'UPDATE plaid_items SET error_code = ? WHERE item_id = ?', args: [e.message, item_id] }).catch(() => {});
    });
  }
  if (webhook_type === 'ITEM' && webhook_code === 'ERROR') {
    const errorCode = req.body.error?.error_code ?? 'UNKNOWN';
    await db.execute({ sql: 'UPDATE plaid_items SET error_code = ? WHERE item_id = ?', args: [errorCode, item_id] });
  }
});

export default router;
