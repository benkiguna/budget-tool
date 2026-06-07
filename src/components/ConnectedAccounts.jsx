import { useState, useCallback } from 'react';
import { storage } from '../lib/storage.js';
import PlaidLinkButton from './PlaidLinkButton.jsx';

function timeAgo(isoString) {
  if (!isoString) return 'Never synced';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function canSync(lastSynced) {
  if (!lastSynced) return true;
  return Date.now() - new Date(lastSynced).getTime() > 5 * 60 * 1000; // 5 min throttle
}

export default function ConnectedAccounts({ items, onRefresh }) {
  const [syncing, setSyncing] = useState({});
  const [removing, setRemoving] = useState({});
  const [errors, setErrors] = useState({});

  const handleSync = useCallback(async (itemId) => {
    setSyncing((s) => ({ ...s, [itemId]: true }));
    setErrors((e) => ({ ...e, [itemId]: null }));
    try {
      const result = await storage.plaid.sync(itemId);
      const summary = result.results?.[0];
      if (summary?.error) throw new Error(summary.error);
      onRefresh?.();
    } catch (e) {
      setErrors((err) => ({ ...err, [itemId]: e.message }));
    } finally {
      setSyncing((s) => ({ ...s, [itemId]: false }));
    }
  }, [onRefresh]);

  const handleRemove = useCallback(async (itemId, institutionName) => {
    if (!confirm(`Disconnect ${institutionName}? All transactions imported from this bank will be removed.`)) return;
    setRemoving((r) => ({ ...r, [itemId]: true }));
    try {
      await storage.plaid.removeItem(itemId);
      onRefresh?.();
    } catch (e) {
      setErrors((err) => ({ ...err, [itemId]: e.message }));
      setRemoving((r) => ({ ...r, [itemId]: false }));
    }
  }, [onRefresh]);

  const handleToggleAccount = useCallback(async (accountId, enabled) => {
    await storage.plaid.toggleAccount(accountId, enabled);
    onRefresh?.();
  }, [onRefresh]);

  if (!items.length) {
    return (
      <div className="text-center py-10">
        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-1">No banks connected</p>
        <p className="text-zinc-500 dark:text-zinc-600 text-xs mb-4">Connect your bank to automatically import transactions.</p>
        <PlaidLinkButton itemCount={0} onConnected={onRefresh} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">{items.length}/10 banks connected</p>
        <PlaidLinkButton itemCount={items.length} onConnected={onRefresh} />
      </div>

      {items.map((item) => (
        <div key={item.item_id} className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm">{item.institution_name}</p>
              <p className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">
                {timeAgo(item.last_synced)}
                {item.earliest_date && (
                  <span className="ml-2 text-zinc-400 dark:text-zinc-700">· history from {item.earliest_date}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSync(item.item_id)}
                disabled={syncing[item.item_id] || !canSync(item.last_synced)}
                title={!canSync(item.last_synced) ? 'Synced recently — wait 5 min' : 'Sync now'}
                className="text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40"
              >
                {syncing[item.item_id] ? 'Syncing…' : 'Sync'}
              </button>
              <button
                onClick={() => handleRemove(item.item_id, item.institution_name)}
                disabled={removing[item.item_id]}
                className="text-xs border border-red-900/60 text-red-500 hover:bg-red-900/20 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40"
              >
                {removing[item.item_id] ? 'Removing…' : 'Disconnect'}
              </button>
            </div>
          </div>

          {/* Error badge */}
          {(item.error_code || errors[item.item_id]) && (
            <div className="mb-3 px-3 py-2 bg-red-100/60 dark:bg-red-950/40 border border-red-300/60 dark:border-red-800/40 rounded-lg text-xs text-red-600 dark:text-red-400">
              {item.error_code === 'ITEM_LOGIN_REQUIRED'
                ? 'Bank login expired — reconnect to resume syncing.'
                : (errors[item.item_id] || item.error_code)}
            </div>
          )}

          {/* Accounts */}
          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-700/40">
            {item.accounts.map((acct) => (
              <div key={acct.account_id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${acct.enabled ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                  <span className="text-zinc-800 dark:text-zinc-200 text-xs font-medium">{acct.name}</span>
                  {acct.mask && <span className="text-zinc-500 dark:text-zinc-600 text-xs">···{acct.mask}</span>}
                  <span className="text-zinc-500 dark:text-zinc-600 text-xs capitalize">{acct.subtype}</span>
                </div>
                <button
                  onClick={() => handleToggleAccount(acct.account_id, !acct.enabled)}
                  className={`text-xs rounded px-2 py-0.5 transition-colors ${
                    acct.enabled
                      ? 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
                  }`}
                >
                  {acct.enabled ? 'Included' : 'Excluded'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
