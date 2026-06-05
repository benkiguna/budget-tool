// Model limits sourced from modellimit.csv
// Keys are lowercase substrings matched against API model IDs

const LIMITS = [
  {
    name: 'Gemini 2.5 Flash',
    match: 'gemini-2.5-flash',
    exclude: ['lite', 'pro'],
    free:  { rpm: 15,   rpd: 1500,      tpm: 1_000_000, ctx: 1_048_576 },
    paid:  { rpm: 2000, rpd: null,       tpm: 4_000_000, ctx: 1_048_576 },
  },
  {
    name: 'Gemini 2.5 Pro',
    match: 'gemini-2.5-pro',
    exclude: [],
    free:  { rpm: 2,   rpd: 50,         tpm: 32_000,    ctx: 2_097_152 },
    paid:  { rpm: 360, rpd: null,        tpm: 2_000_000, ctx: 2_097_152 },
  },
  {
    name: 'Gemini 2.5 Flash-Lite',
    match: 'gemini-2.5-flash-lite',
    exclude: [],
    free:  { rpm: 30,   rpd: 1500,      tpm: 1_000_000, ctx: 1_048_576 },
    paid:  { rpm: 4000, rpd: null,       tpm: 4_000_000, ctx: 1_048_576 },
  },
];

// Returns { rpm, rpd, tpm, ctx, name } for a given model ID and tier
export function getModelLimits(modelId, tier = 'free') {
  if (!modelId) return null;
  const id = modelId.toLowerCase();

  for (const entry of LIMITS) {
    if (!id.includes(entry.match)) continue;
    if (entry.exclude.some((ex) => id.replace(entry.match, '').includes(ex))) continue;
    const limits = tier === 'paid' ? entry.paid : entry.free;
    return { ...limits, name: entry.name };
  }
  return null;
}

// Format a limit value for display
export function fmtLimit(val) {
  if (val === null) return '∞';
  if (val >= 1_000_000) return `${val / 1_000_000}M`;
  if (val >= 1_000) return `${val / 1_000}K`;
  return String(val);
}
