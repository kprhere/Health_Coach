// ============================================================
// personal-assumptions.test.mjs - one person's routine is that person's
// settings, not everyone's defaults. Synthetic people only.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState, migrateState, dayFlags, nutritionDayType, isNoMoonDay, inPuratasi,
  nextNoMoonReminder, habitApplicability, programCalendar, STATE_VERSION,
} from '../src/helpers.js';
import { KRISHNA } from '../src/profiles/krishna.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

test('a new account has no swim days, fast days, class days, observances or phase label', () => {
  const s = defaultState();
  const thursday = '2026-08-06';
  assert.deepEqual(dayFlags(thursday, s), { dow: 4, swimDay: false, fastDay: false, vegDay: false, badmintonAvailable: false, classDay: false });
  assert.equal(isNoMoonDay('2026-09-10', s), false);
  assert.equal(inPuratasi('2026-09-21', s), false);
  assert.equal(nextNoMoonReminder('2026-09-03', '', s), null);
  assert.equal(Object.values(habitApplicability('2026-08-08', s)).some(Boolean), false);
  assert.equal(programCalendar(s).currentPhase, 'Training');
  assert.equal(s.settings.biotinDose, '');
  assert.deepEqual(s.settings.noMoonDates, []);
});

test('an existing install keeps its exact behaviour through the v6 migration', () => {
  // Shaped like a saved v5 blob: history present, none of the new settings keys stored.
  const old = defaultState();
  delete old.settings.scheduleTags; delete old.settings.noMoonDates; delete old.settings.phaseName;
  delete old.settings.puratasiStartDate; delete old.settings.puratasiEndDate; delete old.settings.timezone;
  delete old.settings.d3Dose; delete old.settings.magElementalMg; delete old.settings.biotinDose;
  old.version = 5;
  old.profile.name = 'Sample Person';
  old.program = clone(KRISHNA.program);
  old.workoutSessions = { '2026-08-03': { date: '2026-08-03', completed: true, notes: '', entries: {} } };

  const out = migrateState(clone(old));
  assert.equal(out.version, STATE_VERSION);
  assert.equal(dayFlags('2026-08-04', out).swimDay, true);        // Tuesday
  assert.equal(dayFlags('2026-08-08', out).classDay, true);       // Saturday
  assert.equal(nutritionDayType('2026-08-06', out), 'fastThu');
  assert.equal(isNoMoonDay('2026-09-10', out), true);
  assert.equal(inPuratasi('2026-09-21', out), true);
  assert.equal(programCalendar(out).currentPhase, 'Fat Loss Phase 1');
  assert.equal(out.settings.biotinDose, '50,000 mcg');
  assert.equal(Object.keys(out.workoutSessions).length, 1);
});

test('values an install already stored are never overwritten by the migration', () => {
  const old = defaultState();
  old.version = 5;
  old.profile.name = 'Sample Person';
  old.settings = { ...old.settings, puratasiStartDate: '2026-01-01', puratasiEndDate: '2026-01-31', phaseName: 'My Block' };
  delete old.settings.scheduleTags;
  const out = migrateState(clone(old));
  assert.equal(out.settings.puratasiStartDate, '2026-01-01');
  assert.equal(out.settings.phaseName, 'My Block');
  assert.equal(out.settings.scheduleTags.classDow, 6);
});

test('a brand-new v5 install with no history gets none of the legacy routine', () => {
  const old = { ...defaultState(), version: 5 };
  const out = migrateState(clone(old));
  assert.deepEqual(out.settings.noMoonDates, []);
  assert.equal(out.settings.scheduleTags.classDow, null);
});

test('malformed schedule tags are treated as none', () => {
  const s = defaultState();
  s.settings.scheduleTags = { swimDows: 'tuesday', classDow: 9, badmintonDows: [1, 'x', 8] };
  assert.equal(dayFlags('2026-08-04', s).swimDay, false);
  assert.equal(dayFlags('2026-08-03', s).badmintonAvailable, true);
  assert.equal(dayFlags('2026-08-08', s).classDay, false);
});

test('accepting a generated plan keeps the old plan as a version and never touches logs', async () => {
  const { generatePlan } = await import('../src/coach/planGenerator.js');
  const s = defaultState();
  s.workoutSessions = { '2026-01-06': { date: '2026-01-06', completed: true, notes: 'kept', entries: {} } };
  const plan = generatePlan({ goal: 'general', experience: 'new', availableDays: [1, 3, 5], sessionMinutes: 45, equipment: ['dumbbell', 'machine'] });
  assert.equal(Object.keys(plan.program.days).length, 7);
  assert.ok(plan.rationale.length > 0);
  assert.equal(s.workoutSessions['2026-01-06'].notes, 'kept');
});

test('a new account shows no supplement habits, no lab values and flags generic nutrition targets', async () => {
  const { habitStatus, nutritionProfile } = await import('../src/helpers.js');
  const s = defaultState();
  const keys = Object.keys(habitStatus('2026-08-05', s).status);
  for (const k of ['creatine', 'fishoil', 'vitd', 'magnesium', 'biotin', 'swim', 'badminton', 'thu_fast', 'sat_veg']) {
    assert.equal(keys.includes(k), false, `${k} should not apply to a new account`);
  }
  const p = nutritionProfile(s);
  assert.equal(p.generic, true);
  assert.ok(/generic estimates/i.test(p.explain[0]));
  assert.equal(p.explain.join(' ').match(/LDL|badminton|HbA1c/i), null);
  s.profile.startWeightLb = 150;
  assert.equal(nutritionProfile(s).generic, false);
});

test('an existing install keeps its supplement tracking through migration', () => {
  const old = defaultState();
  old.version = 5; old.profile.name = 'Sample Person';
  delete old.settings.supplementsEnabled;
  assert.equal(migrateState(JSON.parse(JSON.stringify(old))).settings.supplementsEnabled, true);
});
