// store-records: explode/assemble is lossless, diff is exact.
import test from 'node:test';
import assert from 'node:assert/strict';

const { explodeState, assembleState, diffStates, recordHash, stableStringify } = await import('../src/store/records.js');
const { defaultState, clone } = await import('../src/helpers.js');

const richState = () => {
  const s = defaultState();
  s.workoutSessions['2026-03-02'] = { completed: true, notes: 'good', entries: { bench: { sets: [{ weight: '135', reps: '8', rpe: '8', pain: 0 }, { weight: '', reps: '', isWarmup: true }] } } };
  s.mealLogs['2026-03-02'] = { eaten: { b: true }, extras: [], water: 0, flags: {} };
  s.bodyScans = [
    { id: 'scan-b', date: '2026-03-10', weight: 190.2, bodyFatPct: 22.1 },
    { id: 'scan-a', date: '2026-02-01', weight: 195, bodyFatPct: 24, waist: null },
  ];
  s.exerciseNotes = { 'Leg Press': 'seat 6, feet high' };
  s.customExercises = { 'Hammer Curl': { muscle: 'biceps', equipment: 'dumbbell' } };
  s.restartWeights = { Squat: { old: '225', pct: 70 } };
  s.workoutSwaps = { '2026-03-03': '2026-03-05', '2026-03-05': '2026-03-03' };
  s.planOverrides = { '2026-03-04': { day: 'legs' } };
  s.planVersions = [{ id: 'pv2', at: 2 }, { id: 'pv1', at: 1 }];
  s.coach = {
    mode: 'suggest',
    proposals: [{ id: 'p2', text: 'b' }, { id: 'p1', text: 'a' }],
    audit: [{ ts: 5, what: 'x' }, { ts: 3, what: 'y' }],
  };
  s.futureFeature = { nested: [1, 2, { three: 3 }], flag: false };
  s.anotherFuture = null;
  s.emptyString = '';
  s.zero = 0;
  return s;
};

test('assemble(explode(s)) deep-equals s, including unknown fields and tricky values', () => {
  const s = richState();
  assert.deepEqual(assembleState(explodeState(s)), s);
});

test('round trip preserves array order, empty containers and null/empty values', () => {
  const s = {
    version: 5, bodyScans: [], workoutSessions: {}, mealLogs: null, profile: null, settings: {},
    planVersions: {}, coach: {}, weird: [], str: '', n: 0, f: false, nul: null,
  };
  assert.deepEqual(assembleState(explodeState(s)), s);
  const order = { bodyScans: [{ id: 'z' }, { id: 'a' }, { id: 'm' }] };
  assert.deepEqual(assembleState(explodeState(order)).bodyScans.map((x) => x.id), ['z', 'a', 'm']);
});

test('arrays that cannot be keyed by id are kept verbatim, not dropped', () => {
  const s = { bodyScans: [{ date: 'x' }, { date: 'y' }], planVersions: [{ id: 'dup' }, { id: 'dup' }], coach: { proposals: [{ nope: 1 }], audit: [{ a: 1 }, { a: 2 }] } };
  assert.deepEqual(assembleState(explodeState(s)), s);
});

test('keys that look like prototype pollution round-trip as plain data', () => {
  const s = JSON.parse('{"workoutSessions":{"__proto__":{"x":1},"constructor":{"y":2}}}');
  const out = assembleState(explodeState(s));
  assert.equal(Object.getPrototypeOf(out.workoutSessions), Object.prototype);
  assert.deepEqual(Object.keys(out.workoutSessions).sort(), ['__proto__', 'constructor']);
  assert.equal(({}).x, undefined);
});

test('record shape: one record per date, scan keyed by id, meta for the rest', () => {
  const recs = explodeState(richState());
  const has = (c, k) => recs.some((r) => r.collection === c && r.key === k);
  assert.ok(has('workoutSessions', '2026-03-02'));
  assert.ok(has('bodyScans', 'scan-a') && has('bodyScans', 'scan-b'));
  assert.ok(has('workoutSwaps', '2026-03-03'));
  assert.ok(has('restartWeights', 'Squat'));
  assert.ok(has('coachProposals', 'p1'));
  assert.ok(has('coachAudit', '3'));
  assert.ok(has('profile', 'singleton') && has('settings', 'singleton') && has('program', 'singleton'));
  assert.ok(has('meta', 'futureFeature') && has('meta', 'version') && has('meta', 'lastBackup') && has('meta', 'lastHealthSync'));
});

test('diff: only the changed day produces an upsert', () => {
  const prev = richState();
  const next = clone(prev);
  next.mealLogs['2026-03-02'].water = 3;
  const d = diffStates(prev, next);
  assert.deepEqual(d.map((c) => [c.collection, c.key, c.deleted]), [['mealLogs', '2026-03-02', false]]);
  assert.equal(d[0].data.water, 3);
});

test('diff: no-op (equal but distinct objects) produces nothing', () => {
  const prev = richState();
  assert.deepEqual(diffStates(prev, clone(prev)), []);
  assert.deepEqual(diffStates(prev, prev), []);
});

test('diff: deletes, inserts and edits across collections', () => {
  const prev = richState();
  const next = clone(prev);
  delete next.workoutSwaps['2026-03-05'];
  next.workoutSwaps['2026-03-03'] = '2026-03-06';
  next.bodyScans = next.bodyScans.filter((x) => x.id !== 'scan-a');
  next.exerciseNotes['Row'] = 'new';
  delete next.futureFeature;
  const got = diffStates(prev, next).map((c) => `${c.collection}/${c.key}/${c.deleted ? 'del' : 'up'}`);
  assert.deepEqual(got, [
    'bodyScans/scan-a/del',
    'exerciseNotes/Row/up',
    'meta/futureFeature/del',
    'meta/order:bodyScans/up',
    'workoutSwaps/2026-03-03/up',
    'workoutSwaps/2026-03-05/del',
  ]);
  const del = diffStates(prev, next).find((c) => c.deleted);
  assert.equal(del.data, null);
});

test('diff: applying the changes to the exploded prev yields exactly next', () => {
  const prev = richState();
  const next = clone(prev);
  next.workoutSessions['2026-03-09'] = { entries: {}, completed: false };
  delete next.mealLogs['2026-03-02'];
  next.coach.proposals.push({ id: 'p3' });
  next.bodyScans.reverse();
  next.newThing = { a: 1 };
  const rows = new Map(explodeState(prev).map((r) => [`${r.collection}|${r.key}`, r]));
  diffStates(prev, next).forEach((c) => {
    if (c.deleted) rows.delete(`${c.collection}|${c.key}`);
    else rows.set(`${c.collection}|${c.key}`, c);
  });
  assert.deepEqual(assembleState([...rows.values()]), next);
});

test('diff: from nothing, everything is an upsert; to nothing, everything is a delete', () => {
  const s = richState();
  const up = diffStates(null, s);
  assert.ok(up.length > 20 && up.every((c) => !c.deleted));
  const down = diffStates(s, {});
  assert.ok(down.length > 20 && down.every((c) => c.deleted));
});

test('assemble ignores tombstones and tolerates remote records without a shape record', () => {
  const recs = [
    { collection: 'workoutSessions', key: '2026-01-01', data: { a: 1 }, deleted: false, version: 3 },
    { collection: 'workoutSessions', key: '2026-01-02', data: null, deleted: true, version: 4 },
    { collection: 'bodyScans', key: 'b', data: { id: 'b', date: '2026-02-01' }, version: 1 },
    { collection: 'bodyScans', key: 'a', data: { id: 'a', date: '2026-01-01' }, version: 1 },
  ];
  const s = assembleState(recs);
  assert.deepEqual(Object.keys(s.workoutSessions), ['2026-01-01']);
  assert.deepEqual(s.bodyScans.map((x) => x.id), ['a', 'b']);
});

test('recordHash and stableStringify ignore key order and distinguish values', () => {
  assert.equal(recordHash({ a: 1, b: [1, 2] }), recordHash({ b: [1, 2], a: 1 }));
  assert.notEqual(recordHash({ a: 1 }), recordHash({ a: '1' }));
  assert.notEqual(recordHash({ a: [1, 2] }), recordHash({ a: [2, 1] }));
  assert.equal(stableStringify({ x: undefined, y: 1 }), '{"y":1}');
});
