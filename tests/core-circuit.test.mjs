import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrateState, muscleGroupsOf, isTimedExercise, exerciseMeta } from '../src/helpers.js';
import { EXERCISES } from '../src/data.js';

const circuitOf = (s) => s.program.days[3].blocks.find((b) => b.name === 'Core Circuit');
const names = (b) => b.exercises.map((e) => e.name);

test('default Core Circuit has the video ab moves', () => {
  assert.deepEqual(names(circuitOf(defaultState())), ['Reverse Crunch', 'Toe Touches', 'Russian Twist', 'Scissor Kicks', 'Pallof Press', 'Dead Bug', 'Plank']);
});

test('every new ab move has a library entry that counts toward core', () => {
  ['Toe Touches', 'Russian Twist', 'Scissor Kicks', 'Rainbows', 'Knee Tucks'].forEach((n) => {
    assert.ok(EXERCISES[n], n);
    assert.deepEqual(muscleGroupsOf(n, defaultState()), ['Core'], n);
    assert.ok(EXERCISES[EXERCISES[n].sub], `${n} substitute exists`);
  });
  assert.equal(isTimedExercise('Scissor Kicks', defaultState(), '30s'), true);
});

test('migration 17 rewrites an untouched old circuit and keeps edited ones', () => {
  const old = defaultState();
  circuitOf(old).exercises = [
    { name: 'Reverse Crunch', targetReps: '12-15', targetRpe: 8 },
    { name: 'Pallof Press', targetReps: '10 / side', targetRpe: 7 },
    { name: 'Dead Bug', targetReps: '8-10', targetRpe: 6 },
    { name: 'Plank', targetReps: '30-45s', targetRpe: 6 },
  ];
  old.version = 16;
  assert.deepEqual(names(circuitOf(migrateState(old))), ['Reverse Crunch', 'Toe Touches', 'Russian Twist', 'Scissor Kicks', 'Pallof Press', 'Dead Bug', 'Plank']);

  const edited = defaultState();
  circuitOf(edited).exercises = [{ name: 'Plank', targetReps: '60s', targetRpe: 6 }];
  edited.version = 16;
  assert.deepEqual(names(circuitOf(migrateState(edited))), ['Plank']);
});
