// apply-proposal: server-side re-validation of a coach proposal.
// Never trust the client's verdict. This function:
//   1. verifies the JWT,
//   2. reads the caller's live records (RLS-scoped),
//   3. hands them to planProposalWrites (src/cloud/proposalWrites.js), which
//      rebuilds app state with src/store/records.js, requires the proposal to
//      be one the coach rules (src/coach/proposals.js) really produce, re-runs
//      validateProposal/applyProposal, and refuses any change outside the
//      coach-owned records,
//   4. writes the result in ONE atomic push_ops group with expected versions.
// Thin on purpose: all rules live in src/coach and are unit-tested in
// tests/cloud-proposal-writes.test.mjs against the real SQL.
//
// NOT RUN LIVE (Deno runtime). Assumes the bundler can resolve the ../../../src
// imports and that src/helpers.js loads without a browser; verify on deploy.
import { authenticate, cors, json } from '../_shared.ts';
import { planProposalWrites } from '../../../src/cloud/proposalWrites.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { db } = auth;

  let body: { proposal?: { id: string }; todayKey?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (!body.proposal || !body.todayKey) return json({ error: 'proposal and todayKey are required' }, 400);

  const rows: Array<{ collection: string; key: string; data: unknown; version: number; deleted_at: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const page = await db.from('records').select('collection,key,data,version,deleted_at')
      .order('collection').order('key').range(from, from + 999);
    if (page.error) return json({ error: 'could not read records' }, 500);
    rows.push(...page.data);
    if (page.data.length < 1000) break;
  }

  const plan = planProposalWrites({
    rows, proposal: body.proposal, todayKey: body.todayKey, nowMs: Date.now(), newOpId: () => crypto.randomUUID(),
  });
  if (!plan.ok) return json({ ok: false, errors: plan.errors }, 422);
  if (!plan.ops.length) return json({ ok: true, applied: 0 });

  const push = await db.rpc('push_ops', { ops: plan.ops });
  if (push.error) return json({ error: push.error.message }, 500);
  if (push.data.conflicts?.length) return json({ ok: false, errors: ['your data changed while applying; reload and retry'] }, 409);
  return json({ ok: true, applied: push.data.applied.length });
});
