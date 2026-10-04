// Synthetic builders shared by the coach tests. No personal data.
import { defaultState, makeSet, makeCell, addDays } from '../src/helpers.js';

export const ASOF = '2026-10-04'; // a Sunday; Mon=fullA, Wed=fullB, Fri=fullC
export const NOW_MS = new Date(`${ASOF}T12:00:00`).getTime();

export function baseState(extra = {}) {
  const s = defaultState();
  s.settings = { ...s.settings, programStartDate: '2026-08-01' };
  return Object.assign(s, extra);
}

const blanks = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? '' : v]));
const setOf = (o = {}) => ({ ...makeSet(), ...blanks(o) });
const cellOf = (o = {}) => ({ ...makeCell(), ...blanks(o) });

// single / dropset entry. sets: [{weight,reps,rpe,pain,isWarmup,isDrop,seconds}]
export const singleEntry = (name, sets, extra = {}) => ({
  blockType: 'single', name, exName: name, skipped: false, skipReason: '', replacedWith: '', completed: false,
  sets: sets.map(setOf), ...extra,
});

// round-based entry. rounds: [{ [exName]: cellFields }]
export const roundsEntry = (blockType, name, rounds, extra = {}) => ({
  blockType, name, exNames: Object.keys(rounds[0]), plannedRounds: rounds.length, completed: false,
  rounds: rounds.map((r) => ({ done: false, byExercise: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cellOf(v)])) })), ...extra,
});

export function session(date, entries, extra = {}) {
  const map = {};
  entries.forEach((e, i) => { map[`blk#${i}`] = e; });
  return { date, dayKey: 'x', title: 'Test', completed: false, notes: '', entries: map, ...extra };
}

export const withSessions = (state, list) => {
  list.forEach((s) => { state.workoutSessions[s.date] = s; });
  return state;
};

export const work = (name, n, weight, reps, rpe = 8, extra = {}) =>
  singleEntry(name, Array.from({ length: n }, () => ({ weight, reps, rpe, ...extra })));

export const setWatch = (state, date, fields) => { state.watchLogs[date] = { ...(state.watchLogs[date] || {}), ...fields }; };

// Steady, ordinary training so only the signal under test varies.
export function steadyHistory(state, { weeks = 4, setsPerWeek = 6, endDate = ASOF } = {}) {
  for (let w = 0; w < weeks; w++) {
    const date = addDays(endDate, -(w * 7 + 1));
    withSessions(state, [session(date, [work('Seated Cable Row', setsPerWeek, 100, 10, 8)])]);
  }
  return state;
}
