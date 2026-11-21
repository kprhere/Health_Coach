import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultInsertAfter } from '../src/helpers.js';

const plan = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const done = { sets: [{ weight: '100', reps: '8' }] };
const open = { sets: [{ weight: '', reps: '' }] };

test('nothing finished: goes at the start', () => {
  assert.equal(defaultInsertAfter(plan, { a: open, b: open, c: open }), '__start__');
  assert.equal(defaultInsertAfter([], {}), '__start__');
});

test('after the last finished planned block', () => {
  assert.equal(defaultInsertAfter(plan, { a: done, b: open, c: open }), 'a');
  assert.equal(defaultInsertAfter(plan, { a: done, b: done, c: open }), 'b');
  assert.equal(defaultInsertAfter(plan, { a: done, b: open, c: done }), 'c'); // done out of order
  assert.equal(defaultInsertAfter(plan, { a: done, b: done, c: done }), 'c');
});

test('skipped and missed-set blocks count as finished', () => {
  assert.equal(defaultInsertAfter(plan, { a: { ...open, skipped: true }, b: open, c: open }), 'a');
  assert.equal(defaultInsertAfter(plan, { a: { sets: [{ weight: '100', reps: '8' }, { weight: '', reps: '', missed: true }] }, b: open, c: open }), 'a');
});

test('finished added exercises move the spot with them', () => {
  const x1 = { ...done, afterBlockId: '__start__' };
  assert.equal(defaultInsertAfter(plan, { x1, a: open, b: open, c: open }), '__start__');
  const x2 = { ...done, afterBlockId: 'b' };
  assert.equal(defaultInsertAfter(plan, { a: done, b: open, x2, c: open }), 'b');
  const x3 = { ...done, afterBlockId: null };
  assert.equal(defaultInsertAfter(plan, { a: done, b: open, c: open, x3 }), null);
  const x4 = { ...done, afterBlockId: 'gone' }; // its block left the plan: shown at the end
  assert.equal(defaultInsertAfter(plan, { a: done, b: open, c: open, x4 }), null);
  assert.equal(defaultInsertAfter(plan, { a: done, x5: { ...open, afterBlockId: 'c' }, b: open, c: open }), 'a');
});
