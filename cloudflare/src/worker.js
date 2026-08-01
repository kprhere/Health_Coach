// ============================================================
// acp-sync - a tiny Cloudflare Worker that stores ONE encrypted
// blob per sync id in Workers KV. It never sees your passphrase
// or your data: the app encrypts everything client-side, so KV
// only ever holds an opaque ciphertext.
//
//   GET  /sync/:id  -> { updatedAt, cipher }  (or { found:false })
//   PUT  /sync/:id  <- { updatedAt, cipher }  (body, <= 2 MB)
//
// :id is a 160-bit hash the app derives from your passphrase, so
// it is not guessable and reveals nothing about the passphrase.
// ============================================================
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/sync\/([A-Za-z0-9_-]{16,128})$/);
    if (!match) return json({ error: 'not found' }, 404);
    const id = match[1];

    if (request.method === 'GET') {
      const val = await env.ACP_SYNC.get(id);
      if (!val) return json({ found: false });
      return new Response(val, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > 2_000_000) return json({ error: 'payload too large' }, 413);
      // basic shape check without trusting contents
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed.cipher !== 'string') return json({ error: 'bad body' }, 400);
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      await env.ACP_SYNC.put(id, body);
      return json({ ok: true, savedAt: Date.now() });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
