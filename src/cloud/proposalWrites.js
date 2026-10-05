// Pure core of the apply-proposal Edge Function: live records in, validated
// push_ops out. Re-runs the real coach validation (never trusts the client).
import { assembleState, diffStates, stableStringify } from '../store/records.js';
import { applyProposal, ensureCoach, generateProposals } from '../coach/proposals.js';

// Only coach-owned records may change as a result of applying a proposal.
const ALLOWED = new Set(['planOverrides', 'workoutSwaps', 'coachProposals', 'coachAudit']);
const ALLOWED_META = new Set(['coach', 'order:coach.proposals', 'order:coach.audit']);
export const isCoachRecord = (c) => ALLOWED.has(c.collection) || (c.collection === 'meta' && ALLOWED_META.has(c.key));

// rows: [{collection,key,data,version,deleted_at}]  (the caller's records)
// -> {ok:true, ops} | {ok:false, errors}
export function planProposalWrites({ rows, proposal, todayKey, nowMs, newOpId }) {
  if (!proposal || typeof proposal.id !== 'string' || typeof proposal.asOf !== 'string' || !Array.isArray(proposal.changes)) return { ok: false, errors: ['malformed proposal'] };
  const versions = new Map(rows.map((r) => [`${r.collection}\u0000${r.key}`, r.version]));
  const state = assembleState(rows.map((r) => ({
    collection: r.collection, key: r.key, data: r.data, deleted: !!r.deleted_at,
  })));
  // The client may only ask for a proposal the server itself would make (or one
  // it already stored as pending, unchanged). A forged proposal that merely
  // passes the op validators is refused, and so is applying one twice.
  const stored = ensureCoach(state).proposals[proposal.id];
  if (stored && stored.status !== 'pending') return { ok: false, errors: [`proposal is already ${stored.status}`] };
  const same = (a, b) => a && b && a.fingerprint === b.fingerprint && stableStringify(a.changes) === stableStringify(b.changes);
  const known = same(stored, proposal)
    || generateProposals(state, proposal.asOf, nowMs).proposals.some((p) => p.id === proposal.id && same(p, proposal));
  if (!known) return { ok: false, errors: ['proposal does not match anything the coach rules produce for this data'] };
  const result = applyProposal(state, proposal, { todayKey, nowMs, mode: 'manual' });
  if (!result.ok) return { ok: false, errors: result.errors };
  const changes = diffStates(state, result.state);
  if (changes.some((c) => !isCoachRecord(c))) return { ok: false, errors: ['proposal would modify protected records'] };
  const group = `apply-${proposal.id}`;
  return {
    ok: true,
    ops: changes.map((c) => ({
      op_id: newOpId(),
      collection: c.collection,
      key: c.key,
      expected_version: versions.get(`${c.collection}\u0000${c.key}`) ?? null,
      data: c.deleted ? {} : c.data,
      delete: c.deleted,
      atomic_group: group,
    })),
  };
}
