// validate-upload: the client uploads a file straight to Storage (private
// bucket, own folder only), then calls this function with {path, kind}.
// We re-read the stored bytes, check magic bytes / size / per-user quota, then
// either record an `uploads` row (status 'verified') or delete the object.
// The client-supplied type is never trusted.
//
// NOT RUN LIVE. The pure checks it relies on are unit-tested in
// tests/cloud-upload-checks.test.mjs.
import { authenticate, cors, json } from '../_shared.ts';
import { pathBelongsTo, sha256Hex, validateUpload } from '../../../src/cloud/uploadChecks.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { user, db } = auth;

  let body: { path?: string; kind?: string; declaredMime?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const { path, kind, declaredMime } = body;
  if (!path || !pathBelongsTo(user.id, path)) return json({ error: 'path must be inside your own folder' }, 403);

  const dl = await db.storage.from('uploads').download(path);
  if (dl.error || !dl.data) return json({ error: 'object not found' }, 404);
  const bytes = new Uint8Array(await dl.data.arrayBuffer());

  // Storage already used by this user, from their verified upload records.
  const id = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  const existing = await db.from('records').select('key,version,data,deleted_at')
    .eq('collection', 'uploads').is('deleted_at', null);
  if (existing.error) return json({ error: 'quota lookup failed' }, 500);
  const used = (existing.data ?? [])
    .filter((r) => r.data?.path !== path)
    .reduce((sum, r) => sum + (Number(r.data?.bytes) || 0), 0);

  const verdict = validateUpload({ bytes, declaredMime, kind, usedBytes: used });
  if (!verdict.ok) {
    await db.storage.from('uploads').remove([path]); // do not keep rejected files
    return json({ ok: false, reasons: verdict.reasons }, 422);
  }

  const prior = (existing.data ?? []).find((r) => r.key === id);
  const record = {
    path, kind, mime: verdict.mime, bytes: bytes.length, sha256: await sha256Hex(bytes), status: 'verified',
  };
  const push = await db.rpc('push_ops', {
    ops: [{
      op_id: crypto.randomUUID(), collection: 'uploads', key: id,
      expected_version: prior ? prior.version : null, data: record, delete: false,
    }],
  });
  if (push.error) return json({ error: push.error.message }, 500);
  if (push.data.conflicts?.length) return json({ error: 'upload record changed concurrently, retry' }, 409);
  return json({ ok: true, upload: { id, ...record } });
});
