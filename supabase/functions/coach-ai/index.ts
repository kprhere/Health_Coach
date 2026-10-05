// coach-ai: optional AI helper. JWT required, per-user daily rate limit, and
// ONLY a minimal payload leaves the project: a fixed system prompt plus the
// short prompt the client sends. Records, tokens and identifiers are never
// forwarded. Returns 503 until AI_BASE_URL / AI_API_KEY / AI_MODEL secrets are
// set (supabase secrets set AI_BASE_URL=... AI_API_KEY=... AI_MODEL=...).
//
// NOT RUN LIVE.
import { authenticate, cors, json } from '../_shared.ts';

const SYSTEM = 'You are a concise fitness and nutrition coaching assistant. Answer briefly and practically. Do not give medical diagnoses.';
const MAX_PROMPT_CHARS = 4000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const baseUrl = Deno.env.get('AI_BASE_URL');
  const apiKey = Deno.env.get('AI_API_KEY');
  const model = Deno.env.get('AI_MODEL');
  if (!baseUrl || !apiKey || !model) return json({ error: 'AI is not configured' }, 503);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { db } = auth;

  let body: { prompt?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > MAX_PROMPT_CHARS) {
    return json({ error: `prompt must be 1-${MAX_PROMPT_CHARS} characters` }, 400);
  }

  const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '30');
  const usage = await db.rpc('bump_ai_usage', { daily_limit: limit });
  if (usage.error) return json({ error: 'rate limit check failed' }, 500);
  if (!usage.data.allowed) return json({ error: 'daily limit reached', limit }, 429);

  const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: body.prompt }],
    }),
  });
  if (!upstream.ok) return json({ error: 'upstream error', status: upstream.status }, 502);
  const out = await upstream.json();
  return json({ reply: out.choices?.[0]?.message?.content ?? '', remaining: Math.max(0, limit - usage.data.calls) });
});
