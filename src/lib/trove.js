import { CATEGORIES } from './categorizer.js';
import { troveCategoryMap } from '../data/troveCategoryMap.js';

const TROVE_ENRICH_URL = 'https://trove.headline.com/api/v1/transactions/enrich';
const REQUEST_DELAY_MS = 1200; // ~50 req/min, safely under rate limit

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mapTroveCategory(item) {
  if (!item) return null;
  const candidates = [...(item.categories ?? []), item.industry ?? ''];
  for (const c of candidates) {
    const mapped = troveCategoryMap[c];
    if (mapped && CATEGORIES.includes(mapped)) return mapped;
  }
  return null;
}

export async function enrichOne(description, apiKey) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(TROVE_ENRICH_URL, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        amount: 10.00,
        date: today,
        user_id: 'budget-tool-user',
      }),
    });
    if (!res.ok) { console.warn('[Trove] HTTP', res.status, description); return null; }
    const data = await res.json();
    console.debug('[Trove]', description, '→', JSON.stringify({ name: data.name, domain: data.domain, website: data.website, logo: data.logo, url: data.url }));
    const displayName = data.name ?? null;
    const rawDomain = data.domain ?? data.website ?? data.url ?? null;
    // Extract bare hostname — Trove may return full URLs like "https://www.example.com"
    let domain = rawDomain;
    if (rawDomain) {
      try { domain = new URL(rawDomain.includes('://') ? rawDomain : `https://${rawDomain}`).hostname; }
      catch { /* keep as-is */ }
    }
    const logo = data.logo ?? null;
    if (!displayName && !domain) return null;
    return { displayName, domain, logo, category: mapTroveCategory(data) };
  } catch {
    return null;
  }
}

// Enrich merchant descriptions sequentially with a delay between each request.
// callbacks:
//   onTick(processed, total, enrichedSoFar) — fires after every merchant attempt (hit or miss)
//   onEach(merchantRaw, data)               — fires only on successful enrichments
export async function enrichWithTrove(merchantRaws, { onTick, onEach } = {}) {
  const apiKey = import.meta.env.VITE_TROVE_API_KEY;
  if (!apiKey) { console.warn('[Trove] VITE_TROVE_API_KEY not set'); return {}; }
  if (!merchantRaws.length) return {};

  const unique = [...new Set(merchantRaws)].filter((d) => d?.trim().length > 0);
  if (!unique.length) return {};

  const enriched = {};
  let enrichedCount = 0;

  for (let i = 0; i < unique.length; i++) {
    const result = await enrichOne(unique[i], apiKey);
    if (result) {
      enriched[unique[i]] = result;
      enrichedCount++;
      onEach?.(unique[i], result);
    }
    onTick?.(i + 1, unique.length, enrichedCount);
    if (i < unique.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  return enriched;
}
