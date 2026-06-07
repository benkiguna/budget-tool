const DEFAULT_SETTINGS = {
  salary: 0,
  payday: 15,
  categories: [],
  geminiTier: 'free',
  aiUsage: {
    tokens: { chat: 0, insights: 0, identifications: 0, categorizations: 0 },
    requests: { chat: 0, insights: 0, identifications: 0, categorizations: 0 },
    today: { date: '', count: 0 },
    month: '',
  },
};

async function apiFetch(path, options = {}) {
  const token = import.meta.env.VITE_API_TOKEN;
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-api-token': token } : {}),
    },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${options.method ?? 'GET'} ${path} failed: ${res.status}`);
  return res.json();
}

export const storage = {
  getTransactions: () => apiFetch('/transactions'),

  setTransactions: (txs) =>
    apiFetch('/transactions', { method: 'PUT', body: JSON.stringify(txs) }),

  // Incremental import — INSERT OR IGNORE, skips existing IDs
  batchImport: (importId, transactions) =>
    apiFetch('/transactions/batch', {
      method: 'POST',
      body: JSON.stringify({ importId, transactions }),
    }),

  getOverrides: () => apiFetch('/overrides'),

  setOverrides: (overrides) =>
    apiFetch('/overrides', { method: 'PUT', body: JSON.stringify(overrides) }),

  getSettings: async () => {
    const data = await apiFetch('/settings');
    return { ...DEFAULT_SETTINGS, ...data };
  },

  setSettings: (settings) =>
    apiFetch('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // Import audit log
  getImports: () => apiFetch('/imports'),

  addImport: (metadata) =>
    apiFetch('/imports', { method: 'POST', body: JSON.stringify(metadata) }),

  deleteImport: (id) => apiFetch(`/imports/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  clearAll: () => apiFetch('/data', { method: 'DELETE' }),

  // ── Plaid ─────────────────────────────────────────────────────────────────

  plaid: {
    createLinkToken: () => apiFetch('/plaid/create-link-token', { method: 'POST' }),

    exchangeToken: (public_token, institution) =>
      apiFetch('/plaid/exchange-token', {
        method: 'POST',
        body: JSON.stringify({ public_token, institution }),
      }),

    getItems: () => apiFetch('/plaid/items'),

    sync: (itemId, { reset = false } = {}) =>
      apiFetch('/plaid/sync', {
        method: 'POST',
        body: JSON.stringify({ ...(itemId ? { itemId } : {}), ...(reset ? { reset: true } : {}) }),
      }),

    removeItem: (itemId) => apiFetch(`/plaid/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),

    toggleAccount: (accountId, enabled) =>
      apiFetch(`/plaid/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
  },
};
