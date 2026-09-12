// ============================================================
// program-state.test.mjs - the training program is per-person
// state, not an app constant, so two people syncing under
// different passphrases can run completely different splits.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';

import { PROGRAM, EXERCISES, programDay, REST_DAY } from '../src/data.js';
import { V4_LEGACY_PROGRAM } from '../src/migrations/v4-legacy-program.js';
import { defaultState, migrateState, resolveWorkout, clone, STATE_VERSION } from '../src/helpers.js';
import { deriveSync, encryptJSON, decryptJSON } from '../src/sync.js';

const pplProgram = {
  name: 'Push Pull Legs',
  days: {
    1: {
      key: 'push', title: 'Push Day', focus: 'Chest', intensity: 'Hard', dayType: 'training',
      blocks: [{
        blockType: 'single',
        name: 'Barbell Bench Press',
        exercises: [{ name: 'Barbell Bench Press', sets: 5, repLow: 5, repHigh: 5, rpe: 8, restSec: 180, tempo: '2-1-1' }],
      }],
    },
  },
};

const MONDAY = '2026-09-14';
const SUNDAY = '2026-09-13';

test('upgrading from v3 restores the routine that person was actually training', () => {
  // A v3 install predates state.program, so the upgrade has to hand back the
  // routine the app shipped at v3 - the frozen snapshot - and NOT whatever the
  // current default template happens to be. Getting this wrong silently swaps
  // someone onto a different program.
  const before = { version: 3, workoutSessions: { '2026-09-15': { entries: [] } } };
  const after = migrateState(before);

  assert.equal(after.version, STATE_VERSION);
  assert.equal(after.program.name, V4_LEGACY_PROGRAM.name);
  assert.notEqual(after.program.name, PROGRAM.name, 'v3 must not be handed the new starter template');
  assert.equal(resolveWorkout(MONDAY, after).title, 'Upper Body A');
  // a migration must never drop what the person logged
  assert.deepEqual(Object.keys(after.workoutSessions), ['2026-09-15']);
});

test('the frozen migration snapshot never drifts with the shipped default', () => {
  // If this ever starts reading the live constant, past upgrades change meaning.
  assert.notEqual(V4_LEGACY_PROGRAM.name, PROGRAM.name);
  assert.equal(V4_LEGACY_PROGRAM.days[1].title, 'Upper Body A');
  assert.ok(Object.isFrozen(V4_LEGACY_PROGRAM));
});

test('two people carry different programs without touching each other', () => {
  const mine = defaultState();
  const theirs = { ...defaultState(), program: clone(pplProgram) };

  assert.equal(resolveWorkout(MONDAY, mine).title, 'Full Body A');
  assert.equal(resolveWorkout(MONDAY, theirs).title, 'Push Day');
  assert.equal(resolveWorkout(MONDAY, theirs).blocks[0].exercises[0].name, 'Barbell Bench Press');
  // reading one must not mutate or leak into the other
  assert.equal(resolveWorkout(MONDAY, mine).title, 'Full Body A');
});

test('the shipped default is a neutral template, not one persons routine', () => {
  // It must not name a particular gym's plate-loaded brands, and every exercise
  // it names has to exist in the library or the logger renders an empty block.
  const names = [];
  Object.values(PROGRAM.days).forEach((day) => (day.blocks || []).forEach(
    (block) => (block.exercises || []).forEach((ex) => names.push(ex.name)),
  ));
  assert.ok(names.length > 0);
  names.forEach((name) => {
    assert.ok(EXERCISES[name], `${name} is not in the exercise library`);
    assert.doesNotMatch(
      EXERCISES[name].eq || '',
      /hammer strength|life fitness|arsenal|body builder/i,
      `${name} assumes a specific gym's equipment`,
    );
  });
});

test('a weekday a hand-built program never defined resolves to rest', () => {
  const theirs = { ...defaultState(), program: clone(pplProgram) };
  const sunday = resolveWorkout(SUNDAY, theirs);

  assert.equal(sunday.dayType, 'rest');
  assert.equal(sunday.blocks.length, 0);
  assert.equal(programDay(theirs, 0), REST_DAY);
});

test('re-migrating a customised program does not restore the default', () => {
  // mergeState shallow-merges objects, so a user's program.days must replace
  // the default wholesale rather than being deep-merged back together.
  const theirs = { ...defaultState(), program: clone(pplProgram) };
  const again = migrateState(clone(theirs));

  assert.equal(again.program.name, 'Push Pull Legs');
  assert.deepEqual(Object.keys(again.program.days), ['1']);
  assert.equal(resolveWorkout(MONDAY, again).title, 'Push Day');
});

test('a program with no explicit state falls back to the shipped template', () => {
  assert.equal(programDay(undefined, 1).title, PROGRAM.days[1].title);
  assert.equal(programDay({}, 1).title, PROGRAM.days[1].title);
});

test('each program rides its own encrypted blob and stays unreadable to anyone else', async () => {
  const mine = defaultState();
  const theirs = { ...defaultState(), program: clone(pplProgram) };

  const a = await deriveSync('one passphrase');
  const b = await deriveSync('a completely different passphrase');
  assert.notEqual(a.syncId, b.syncId, 'different passphrases must not collide on one cloud key');

  const cipherA = await encryptJSON(a.key, mine);
  const cipherB = await encryptJSON(b.key, theirs);

  assert.equal((await decryptJSON(a.key, cipherA)).program.name, PROGRAM.name);
  assert.equal((await decryptJSON(b.key, cipherB)).program.name, 'Push Pull Legs');

  // the whole point: one person's key cannot open the other's blob
  await assert.rejects(() => decryptJSON(b.key, cipherA));
});

test('carrying a program per person stays far inside the sync payload limit', () => {
  // the Worker rejects bodies over 2 MB; a full program is a rounding error
  const bytes = JSON.stringify(defaultState()).length;
  assert.ok(bytes < 200_000, `state is ${bytes} bytes, unexpectedly large`);
});
