// ============================================================
// personal-data.test.mjs - profile and body scans belong to the
// person, not to the app. Nobody inherits anyone else's body.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';

import { PROFILE_DEFAULT, SEED_SCANS } from '../src/data.js';
import {
  defaultState, migrateState, needsOnboarding, applyOnboarding,
  latestScan, monthlyTargetProgress, clone, STATE_VERSION,
} from '../src/helpers.js';
import { nutritionProfile } from '../src/nutritionEngine.js';

const sam = {
  name: 'Sam', gender: 'Female', age: 29, heightIn: 68,
  weightLb: 150, bodyFatPct: 30, waistIn: 32, goalBodyFatPct: 22, goalFatLossLb: 15,
};

test('a fresh install carries nobody elses body', () => {
  const fresh = defaultState();
  assert.deepEqual(fresh.bodyScans, []);
  assert.equal(fresh.profile.name, '');
  assert.equal(needsOnboarding(fresh), true);
});

test('an empty scan list is never refilled from the shipped seed data', () => {
  // This is the actual defect: mergeState treated "no scans" as "reseed", so a
  // second person could not have an empty history - they silently inherited
  // four real scans belonging to someone else.
  const emptied = migrateState({ ...defaultState(), version: 4, bodyScans: [] });
  assert.deepEqual(emptied.bodyScans, []);
  assert.ok(SEED_SCANS.length > 0, 'seed data still exists, it just must not be forced on anyone');

  const deletedTheirOwn = migrateState({ ...defaultState(), version: 5, bodyScans: [] });
  assert.deepEqual(deletedTheirOwn.bodyScans, [], 'deleting your last scan must stay deleted');
});

test('an existing install keeps its scans and profile and skips setup', () => {
  const existing = migrateState({
    version: 4,
    profile: { name: 'Krishnaprasath', startWeightLb: 191.1, startBodyFatPct: 24.3, startFatMassLb: 46.5, goalFatLossLb: 22 },
    bodyScans: [{ id: 'seed-2026-08-13', date: '2026-08-13', weight: 187.8, bodyFatPct: 24.0, fatMass: 45.0 }],
    workoutSessions: { '2026-09-15': {} },
  });

  assert.equal(existing.version, STATE_VERSION);
  assert.equal(existing.profile.name, 'Krishnaprasath');
  assert.equal(existing.bodyScans.length, 1);
  assert.equal(Object.keys(existing.workoutSessions).length, 1);
  assert.equal(needsOnboarding(existing), false, 'an upgrade must never re-prompt someone who already has data');
  assert.equal(monthlyTargetProgress(existing).goal, 22);
});

test('onboarding records only that persons own measurements', () => {
  const them = applyOnboarding(defaultState(), sam);

  assert.equal(needsOnboarding(them), false);
  assert.equal(them.profile.name, 'Sam');
  assert.equal(them.bodyScans.length, 1);

  const scan = latestScan(them);
  assert.equal(scan.weight, 150);
  assert.equal(scan.bodyFatPct, 30);
  assert.equal(scan.fatMass, 45);   // 150 * 0.30
  assert.equal(scan.leanMass, 105);

  // their programme calendar starts when THEY started, not on a shipped date
  assert.ok(them.settings.programStartDate, 'programme start must be set at onboarding');
  assert.ok(them.settings.nextBodyScanDate > them.settings.programStartDate);
  assert.ok(them.settings.onboardedAt);
});

test('onboarding without measurements records no scan at all', () => {
  const partial = applyOnboarding(defaultState(), { name: 'Alex' });
  assert.equal(partial.profile.name, 'Alex');
  assert.deepEqual(partial.bodyScans, [], 'a half-empty row must not become a baseline');
  assert.equal(needsOnboarding(partial), false);
});

test('two people derive completely different targets from their own bodies', () => {
  const them = applyOnboarding(defaultState(), sam);
  const mine = migrateState({
    version: 4,
    profile: { name: 'K', startWeightLb: 191.1, startBodyFatPct: 24.3 },
    bodyScans: [{ id: 's1', date: '2026-08-13', weight: 187.8, bodyFatPct: 24.0, fatMass: 45.0, leanMass: 142.9 }],
  });

  const theirs = nutritionProfile(them);
  const ours = nutritionProfile(mine);

  assert.notEqual(theirs.bw, ours.bw);
  assert.notEqual(theirs.leanMass, ours.leanMass);
  assert.notEqual(theirs.bmr, ours.bmr);
  assert.notEqual(theirs.protein, ours.protein);
  assert.ok(theirs.protein > 0 && ours.protein > 0);
});

test('a blank profile leaves measurements null so the fallbacks still fire', () => {
  // A literal 0 satisfies ?? and || chains and yields lean mass == body weight,
  // which produced a BMR several hundred calories too high.
  for (const [key, value] of Object.entries(PROFILE_DEFAULT)) {
    if (key === 'name' || key === 'gender') continue;
    assert.equal(value, null, `${key} must default to null, not ${JSON.stringify(value)}`);
  }

  const blank = defaultState();
  const p = nutritionProfile(blank);
  assert.ok(p.bfPct > 0, 'a blank profile must fall back to a sane body fat estimate');
  assert.ok(p.leanMass < p.bw, 'lean mass must never equal body weight');
  assert.equal(p.hasScan, false);
});

test('nothing in the shipped defaults identifies a particular person', () => {
  const fresh = clone(defaultState());
  const blob = JSON.stringify({ profile: fresh.profile, settings: fresh.settings, bodyScans: fresh.bodyScans });
  assert.ok(!/Krishnaprasath/i.test(blob), 'a real name must not ship in the defaults');
  assert.equal(fresh.settings.proteinTarget, 0, 'protein target is derived per person, not shipped');
  assert.equal(fresh.settings.activityFactor, 0, 'activity factor is audited per person, not shipped');
});
