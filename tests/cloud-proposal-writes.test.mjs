// The core of the apply-proposal Edge Function, run end to end against the
// real SQL: records in the database -> server-side revalidation -> push_ops.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addDays } from '../src/helpers.js';
import { generateProposals } from '../src/coach/proposals.js';
import { explodeState, assembleState } from '../src/store/records.js';
import { planProposalWrites, isCoachRecord } from '../src/cloud/proposalWrites.js';
import { makeDb, newUser, push, asUser } from './cloud-pg.mjs';
import { ASOF, NOW_MS, baseState, session, withSessions, work, setWatch } from './coach-fixtures.mjs';

function scenario() {
  const s = baseState();
  for (let i = 0; i < 7; i++) setWatch(s, addDays(ASOF, -i), { sleepH: 5 });
  withSessions(s, [session(addDays(ASOF, -1), [work('Seated Cable Row', 3, 100, 10)])]);
  s.exerciseNotes = { 'Back Squat': 'keep the heels down' };
  return s;
}

async function seed() {
  const db = await makeDb();
  const uid = await newUser(db);
  const state = scenario();
  const ops = explodeState(state).map((r) => ({
    op_id: randomUUID(), collection: r.collection, key: r.key, expected_version: null, data: r.data, delete: false,
  }));
  for (let i = 0; i < ops.length; i += 200) await push(db, uid, ops.slice(i, i + 200));
  const read = () => asUser(db, uid, async () => (await db.query('select collection, key, data, version, deleted_at from public.records')).rows);
  return { db, uid, state, read };
}

test('server rebuilds state from records, revalidates, and writes only coach records atomically', async () => {
  const { db, uid, state, read } = await seed();
  const proposal = generateProposals(state, ASOF, NOW_MS).proposals.find((p) => p.rules.includes('low-recovery'));
  assert.ok(proposal);

  const before = await read();
  const plan = planProposalWrites({ rows: before, proposal, todayKey: ASOF, nowMs: NOW_MS, newOpId: randomUUID });
  assert.equal(plan.ok, true, plan.errors?.join());
  assert.ok(plan.ops.length > 0);
  assert.ok(plan.ops.every((o) => isCoachRecord(o) && o.atomic_group.startsWith('apply-')));
  assert.ok(plan.ops.some((o) => o.collection === 'planOverrides'));

  const res = await push(db, uid, plan.ops);
  assert.equal(res.conflicts.length, 0);
  assert.equal(res.applied.length, plan.ops.length);

  const after = await read();
  const changed = after.filter((r) => {
    const b = before.find((x) => x.collection === r.collection && x.key === r.key);
    return !b || b.version !== r.version;
  });
  assert.ok(changed.every(isCoachRecord), 'nothing but coach records changed');
  const rebuilt = assembleState(after.map((r) => ({ ...r, deleted: !!r.deleted_at })));
  assert.equal(rebuilt.coach.proposals[proposal.id].status, 'applied');
  assert.deepEqual(rebuilt.exerciseNotes, state.exerciseNotes);
  assert.deepEqual(rebuilt.workoutSessions, state.workoutSessions);
});

test('the server refuses what the coach rules refuse: stale, past, duplicate, malformed', async () => {
  const { db, uid, state, read } = await seed();
  const proposal = generateProposals(state, ASOF, NOW_MS).proposals.find((p) => p.rules.includes('low-recovery'));
  const rows = await read();
  const plan = (p, today = ASOF) => planProposalWrites({ rows, proposal: p, todayKey: today, nowMs: NOW_MS, newOpId: randomUUID });

  assert.equal(plan({ ...proposal, sourceVersion: 'forged' }).ok, false);
  assert.match(plan({ ...proposal, sourceVersion: 'forged' }).errors.join(), /stale/);
  assert.equal(plan(proposal, '2027-01-01').ok, false, 'dates in the past');
  assert.equal(plan(null).ok, false);
  assert.equal(plan({ id: 'x' }).ok, false);

  // applied once, the same proposal cannot be applied twice
  const first = plan(proposal);
  await push(db, uid, first.ops);
  const again = planProposalWrites({ rows: await read(), proposal, todayKey: ASOF, nowMs: NOW_MS, newOpId: randomUUID });
  assert.equal(again.ok, false);
  assert.match(again.errors.join(), /already applied/);
});

test('a forged proposal that passes the op validators is still refused', async () => {
  const { state, read } = await seed();
  const proposal = generateProposals(state, ASOF, NOW_MS).proposals.find((p) => p.rules.includes('low-recovery'));
  const rows = await read();
  const forged = structuredClone(proposal);
  forged.changes[0] = { ...forged.changes[0], minSets: 2 };
  const r = planProposalWrites({ rows, proposal: forged, todayKey: ASOF, nowMs: NOW_MS, newOpId: randomUUID });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /does not match/);
});

test('concurrent change between read and write is a conflict, nothing applied', async () => {
  const { db, uid, state, read } = await seed();
  const proposal = generateProposals(state, ASOF, NOW_MS).proposals.find((p) => p.rules.includes('low-recovery'));
  const rows = await read();
  const plan = planProposalWrites({ rows, proposal, todayKey: ASOF, nowMs: NOW_MS, newOpId: randomUUID });
  const target = plan.ops.find((o) => o.expected_version !== null) || plan.ops[0];
  // another device touches one of the keys first
  await push(db, uid, [{ op_id: randomUUID(), collection: target.collection, key: target.key, expected_version: target.expected_version, data: { other: 1 }, delete: false }]);
  const res = await push(db, uid, plan.ops);
  assert.ok(res.conflicts.length >= 1);
  assert.equal(res.applied.length, 0, 'the atomic group was dropped as a whole');
});

test('isCoachRecord is an allow-list', () => {
  for (const c of ['planOverrides', 'workoutSwaps', 'coachProposals', 'coachAudit']) assert.ok(isCoachRecord({ collection: c, key: 'k' }));
  assert.ok(isCoachRecord({ collection: 'meta', key: 'coach' }));
  for (const c of ['workoutSessions', 'bodyScans', 'profile', 'uploads', 'settings']) assert.equal(isCoachRecord({ collection: c, key: 'k' }), false);
  assert.equal(isCoachRecord({ collection: 'meta', key: 'something-else' }), false);
});
