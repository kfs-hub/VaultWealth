/**
 * VaultWealth Assistant — POST /api/chat
 *
 * Works as a Vercel Node serverless function and as an Express handler (server.js).
 *
 * Request:  Authorization: Bearer <supabase access token>
 *           { messages: [{ role: 'user'|'assistant', text }], clientDate?: 'YYYY-MM-DD', timezone?, page? }
 * Response: { reply: string, actions: [{ kind: 'confirm_transaction', draft }] }
 *
 * Env vars: GEMINI_API_KEY (required), GEMINI_MODEL (optional), SUPABASE_URL / SUPABASE_ANON_KEY (optional)
 */
const { getUser } = require('./_lib/supabase');
const { declarations, runTool } = require('./_lib/tools');
const { buildSystemPrompt } = require('./_lib/prompt');

const FALLBACK_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest'
].filter(Boolean);
const MODELS = [...new Set(FALLBACK_MODELS)];

const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 1500;
const MAX_TOOL_ROUNDS = 6;
const RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

// Best-effort in-memory rate limit (per warm instance)
const usage = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const hits = (usage.get(userId) || []).filter(t => now - t < RATE_LIMIT.windowMs);
  if (hits.length >= RATE_LIMIT.max) { usage.set(userId, hits); return true; }
  hits.push(now);
  usage.set(userId, hits);
  return false;
}

function send(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function callGemini(apiKey, payload) {
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(18000)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;

      const msg = data?.error?.message || `HTTP ${res.status}`;
      const err = new Error(`Gemini error (${model}): ${msg}`);
      err.status = res.status;
      lastErr = err;

      // If overloaded (503) or rate-limited (429), try next fallback model
      if (res.status === 503 || res.status === 429) {
        console.warn(`[chat] ${model} unavailable (${res.status}), trying next fallback...`);
        continue;
      }
      throw err;
    } catch (err) {
      lastErr = err;
      if (err.name === 'TimeoutError' || err.status === 503 || err.status === 429) {
        console.warn(`[chat] ${model} timed out or unavailable, trying next fallback...`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('All Gemini models unavailable.');
}

function todayIn(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return send(res, 500, { error: 'The assistant is not configured yet (missing GEMINI_API_KEY).' });

  // ── Auth ──
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const user = await getUser(token);
  if (!user) return send(res, 401, { error: 'Please sign in to use the assistant.' });
  if (rateLimited(user.id)) return send(res, 429, { error: "You've reached the hourly message limit. Please try again a bit later." });

  // ── Input validation ──
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const incoming = Array.isArray(body?.messages) ? body.messages : [];
  const history = incoming
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text.slice(0, MAX_MESSAGE_CHARS) }] }));

  // Gemini requires the conversation to start with a user turn and end with one
  while (history.length && history[0].role !== 'user') history.shift();
  if (!history.length || history[history.length - 1].role !== 'user') {
    return send(res, 400, { error: 'Send a message to start the conversation.' });
  }

  const timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : 'Asia/Kolkata';
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.clientDate || '') ? body.clientDate : todayIn(timezone);
  const fullName = user.user_metadata?.full_name || (user.email || '').split('@')[0];
  const systemText = buildSystemPrompt({
    today, timezone,
    firstName: String(fullName).split(' ')[0],
    page: typeof body.page === 'string' ? body.page.slice(0, 30) : undefined
  });

  const ctx = { token, today, actions: [] };
  const contents = [...history];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const data = await callGemini(apiKey, {
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        tools: [{ functionDeclarations: declarations }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 }
      });

      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const calls = parts.filter(p => p.functionCall);

      if (!calls.length || round === MAX_TOOL_ROUNDS) {
        const reply = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
        if (!reply) {
          const blocked = candidate?.finishReason === 'SAFETY' || data?.promptFeedback?.blockReason;
          return send(res, 200, {
            reply: blocked ? "Sorry, I can't help with that one. Try asking about your spending, budget or savings."
                           : "Sorry, I couldn't come up with an answer. Could you rephrase that?",
            actions: ctx.actions
          });
        }
        return send(res, 200, { reply, actions: ctx.actions });
      }

      // Keep the model turn verbatim (preserves any thought signatures), then answer each call
      contents.push(candidate.content);
      const responses = [];
      for (const p of calls) {
        const { name, args } = p.functionCall;
        let result;
        try {
          result = await runTool(name, args || {}, ctx);
        } catch (err) {
          console.error(`[chat] tool ${name} failed:`, err);
          result = { error: 'Could not load data right now.' };
        }
        const funcResp = { name, response: { result } };
        if (p.functionCall.id) funcResp.id = p.functionCall.id;
        responses.push({ functionResponse: funcResp });
      }
      contents.push({ role: 'user', parts: responses });
    }
  } catch (err) {
    console.error('[chat] error:', err);
    const status = err.status === 429 ? 503 : 502;
    return send(res, status, {
      error: err.status === 429
        ? 'The assistant is busy right now. Please try again in a minute.'
        : 'The assistant ran into a problem. Please try again.'
    });
  }
};
