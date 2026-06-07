import { CATEGORIES } from './categorizer.js';

const LIST_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Fetch all models that support generateContent (text models only).
// Returns { ok, models: [{ id, displayName }], message? }
export async function fetchModels() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return { ok: false, models: [], message: 'VITE_GEMINI_API_KEY is not set in .env' };

  try {
    const res = await fetch(`${LIST_MODELS_URL}?key=${apiKey}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, models: [], message: `API error ${res.status}: ${err?.error?.message ?? res.statusText}` };
    }
    const data = await res.json();
    const models = (data.models ?? [])
      .filter((m) =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        /gemini/i.test(m.name) &&
        !/tts|image|embed|robotics|computer.use|deep.research|antigravity|preview-tts/i.test(m.name)
      )
      .map((m) => ({ id: m.name.replace('models/', ''), displayName: m.displayName }));
    return { ok: true, models };
  } catch (e) {
    return { ok: false, models: [], message: e.message };
  }
}

async function callModel(apiKey, model, body) {
  const res = await fetch(`${BASE_URL}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  const data = await res.json();
  // Extract real token usage from API response
  const usage = data.usageMetadata ?? {};
  data._tokens = {
    prompt: usage.promptTokenCount ?? 0,
    output: usage.candidatesTokenCount ?? 0,
    total: usage.totalTokenCount ?? 0,
  };
  return data;
}

// Quick ping to verify a specific model works. Returns { ok, message }.
export async function testGeminiKey(model) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return { ok: false, message: 'VITE_GEMINI_API_KEY is not set in .env' };
  if (!model) return { ok: false, message: 'No model selected' };

  try {
    await callModel(apiKey, model, {
      contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 5 },
    });
    return { ok: true, message: `✓ ${model} is working` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// Ask AI to identify a single unknown merchant and suggest a category.
// Returns { ok, description, displayName, suggestedCategory, message? }
export async function identifyMerchant(merchantRaw, model) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return { ok: false, message: 'VITE_GEMINI_API_KEY not set' };
  if (!model) return { ok: false, message: 'No model selected' };

  try {
    const data = await callModel(apiKey, model, {
      contents: [{
        parts: [{
          text: `A bank statement has this merchant description: "${merchantRaw}"

What business or service is this likely from? Suggest the best category from: ${CATEGORIES.join(', ')}

Reply ONLY with this JSON (no markdown):
{"displayName": "Clean merchant name (e.g. Starbucks, Netflix, Uber Eats)", "description": "one sentence explaining what this merchant is", "category": "CategoryName"}`
        }]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: 'application/json' },
    });

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, message: `Unexpected AI response: ${text.slice(0, 100)}` };

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return { ok: false, message: `Could not parse AI response: ${text.slice(0, 100)}` };
    }

    const category = CATEGORIES.includes(parsed.category) ? parsed.category : null;
    return {
      ok: true,
      description: parsed.description ?? '',
      displayName: parsed.displayName ?? null,
      suggestedCategory: category,
      tokens: data._tokens,
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// Build a spending summary string to use as context for chat/insights
export function buildSpendingContext(transactions) {
  const byCategory = {};
  const byCatMonth = {}; // { category: { month: total } }
  const byMonth = {};
  let totalSpend = 0, totalIncome = 0;

  for (const tx of transactions) {
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    if (tx.amount < 0) {
      const cat = tx.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
      if (!byCatMonth[cat]) byCatMonth[cat] = {};
      byCatMonth[cat][month] = (byCatMonth[cat][month] || 0) + Math.abs(tx.amount);
      byMonth[month] = (byMonth[month] || 0) + Math.abs(tx.amount);
      totalSpend += Math.abs(tx.amount);
    } else if (tx.category === 'Income') {
      totalIncome += tx.amount;
    }
  }

  const months = Object.keys(byMonth).sort();
  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `  ${c}: $${v.toFixed(2)}`)
    .join('\n');
  const monthLines = months
    .map((m) => `  ${m}: $${byMonth[m].toFixed(2)}`)
    .join('\n');

  // Category × month matrix — lets AI answer trend questions per category
  const catMonthLines = Object.entries(byCatMonth)
    .sort((a, b) => {
      const sumA = Object.values(a[1]).reduce((s, v) => s + v, 0);
      const sumB = Object.values(b[1]).reduce((s, v) => s + v, 0);
      return sumB - sumA;
    })
    .map(([cat, mmap]) => {
      const entries = months.map((m) => mmap[m] ? `${m} $${mmap[m].toFixed(0)}` : null).filter(Boolean);
      return `  ${cat}: ${entries.join(', ')}`;
    })
    .join('\n');

  return `SPENDING SUMMARY (${months[0] ?? 'N/A'} to ${months[months.length - 1] ?? 'N/A'}):
Total Spend: $${totalSpend.toFixed(2)}
Total Income: $${totalIncome.toFixed(2)}
Net: $${(totalIncome - totalSpend).toFixed(2)}
Savings Rate: ${totalIncome > 0 ? (((totalIncome - totalSpend) / totalIncome) * 100).toFixed(1) : 'N/A'}%

By Category (all time):
${catLines}

By Month (total spend):
${monthLines}

Category by Month:
${catMonthLines}

Transaction count: ${transactions.length}`;
}

// Chat with spending context. Returns { ok, text, message? }
export async function chatWithData(message, context, model, history = []) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return { ok: false, text: '', message: 'VITE_GEMINI_API_KEY not set' };
  if (!model) return { ok: false, text: '', message: 'No model selected' };

  try {
    const systemContext = `You are a personal finance assistant. The user has shared their spending data below. Answer questions helpfully and concisely. Use dollar amounts and percentages when relevant. Be honest about patterns you see.

${context}`;

    const contents = [
      { role: 'user', parts: [{ text: systemContext }] },
      { role: 'model', parts: [{ text: 'Got it — I have your spending data loaded. What would you like to know?' }] },
      ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const data = await callModel(apiKey, model, {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
    return { ok: true, text, tokens: data._tokens };
  } catch (e) {
    return { ok: false, text: '', message: e.message };
  }
}

// Generate a proactive financial insights summary. Returns { ok, text, message? }
// focus: optional string directing the analysis (e.g. "focus on food spending this month")
export async function generateInsights(context, model, focus = '') {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return { ok: false, text: '', message: 'VITE_GEMINI_API_KEY not set' };
  if (!model) return { ok: false, text: '', message: 'No model selected' };

  try {
    const focusLine = focus.trim()
      ? `\nThe user has a specific request: "${focus.trim()}"\nAddress this directly before covering general insights.\n`
      : '';

    const prompt = `You are a personal finance advisor. Analyze this spending data and write a short, honest, actionable financial summary.

${context}
${focusLine}
Write 4-6 paragraphs covering:
1. Overall financial health (income vs spend, savings rate)
2. Top spending categories and whether they seem reasonable
3. Notable trends or patterns you spotted
4. 2-3 specific, actionable suggestions to improve

Be direct and specific. Use the actual numbers. Don't be preachy.`;

    const data = await callModel(apiKey, model, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
    });

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
    return { ok: true, text, tokens: data._tokens };
  } catch (e) {
    return { ok: false, text: '', message: e.message };
  }
}

// Categorize uncategorized merchants via Gemini, save results into overrides.
// Returns { overrides, tokens }.
export async function categorizeMerchants(merchantNames, model) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Budget Tool: VITE_GEMINI_API_KEY is not set — AI categorization skipped.');
    return { overrides: {}, tokens: null };
  }
  if (!merchantNames.length) return { overrides: {}, tokens: null };
  if (!model) throw new Error('No Gemini model selected — pick one in Settings');

  const prompt = `You are a transaction categorizer. Given a list of merchant names from bank statements,
identify each merchant and classify into exactly one of these categories:
${CATEGORIES.join(', ')}

Rules:
- "UBER EATS" and "DOORDASH" → Food (not Transport)
- "AMAZON PRIME" → Subscriptions (not Shopping)
- Salary/payroll deposits → Income
- When ambiguous, prefer the more specific category
- Return ONLY a JSON object where each key is EXACTLY the merchant name from the list below
- Each value should be an object with: { "category": "CategoryName", "confidence": 0.0-1.0, "displayName": "Clean Name", "description": "brief description" }
- confidence = how certain you are (0.0–1.0). Use 0.9+ for well-known merchants, 0.7–0.89 for likely matches, 0.5–0.69 for ambiguous
- displayName = the clean, human-readable business name (e.g. "STRBCKS 04821" → "Starbucks")
- No explanation, no markdown, just the JSON object

Merchants to categorize:
${merchantNames.join('\n')}`.trim();

  const data = await callModel(apiKey, model, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  });

  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought).map((p) => p.text ?? '').join('') || '{}';

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    console.error('Gemini parse error:', text);
    return {};
  }

  const now = Date.now();
  const newOverrides = {};
  for (const merchantRaw of merchantNames) {
    const entry = parsed[merchantRaw];
    if (!entry) continue;
    // Support both old format (string category) and new format (object)
    const isObj = typeof entry === 'object';
    const category = isObj ? entry.category : entry;
    if (category && CATEGORIES.includes(category)) {
      // Clamp confidence to 0–1 range; default to 0.75 if not provided
      const rawConf = isObj && typeof entry.confidence === 'number' ? entry.confidence : 0.75;
      const confidence = Math.min(1, Math.max(0, rawConf));
      newOverrides[merchantRaw] = {
        category,
        source: 'ai',
        confidence,
        savedAt: now,
        ...(isObj && entry.displayName ? { displayName: entry.displayName } : {}),
        ...(isObj && entry.description ? { description: entry.description } : {}),
      };
    }
  }
  return { overrides: newOverrides, tokens: data._tokens };
}
