// ============================================================
// planCompare.js - side-by-side comparison of two programs.
// Pure. Reads muscleGroupOf from helpers.js (read-only).
// ============================================================
import { muscleGroupOf } from '../helpers.js';

const DOWS = [0, 1, 2, 3, 4, 5, 6];

const dayOf = (program, dow) => (program && program.days && program.days[dow]) || null;
const isTraining = (day) => !!day && day.dayType === 'training';

// Planned sets for one block, per exercise. Supersets, circuits and finishers
// count rounds per exercise; single and dropset blocks count `sets`.
export function blockSets(block) {
  const out = [];
  if (!block || !Array.isArray(block.exercises)) return out;
  const roundBased = block.blockType === 'superset' || block.blockType === 'circuit' || block.blockType === 'finisher';
  block.exercises.forEach((ex) => {
    if (!ex || !ex.name) return;
    const n = roundBased ? Number(block.rounds) || 0 : Number(ex.sets) || 0;
    out.push({ name: ex.name, sets: n });
  });
  return out;
}

export function weeklySetsByMuscle(program, state) {
  const out = {};
  DOWS.forEach((dow) => {
    const day = dayOf(program, dow);
    if (!isTraining(day)) return;
    (day.blocks || []).forEach((b) => blockSets(b).forEach(({ name, sets }) => {
      if (!sets) return;
      const g = muscleGroupOf(name, state);
      if (g === 'Other' || g === 'Conditioning') return;
      out[g] = (out[g] || 0) + sets;
    }));
  });
  return out;
}

export function exerciseNamesOf(program) {
  const names = new Set();
  DOWS.forEach((dow) => {
    const day = dayOf(program, dow);
    if (!day) return;
    (day.blocks || []).forEach((b) => (b.exercises || []).forEach((e) => e && e.name && names.add(e.name)));
  });
  return names;
}

export function comparePlans(programA, programB, state) {
  const days = {};
  let ta = 0;
  let tb = 0;
  DOWS.forEach((dow) => {
    const a = dayOf(programA, dow);
    const b = dayOf(programB, dow);
    if (isTraining(a)) ta += 1;
    if (isTraining(b)) tb += 1;
    days[dow] = { a: a ? a.title : 'Rest', b: b ? b.title : 'Rest' };
  });

  const sa = weeklySetsByMuscle(programA, state);
  const sb = weeklySetsByMuscle(programB, state);
  const weekly = {};
  new Set([...Object.keys(sa), ...Object.keys(sb)]).forEach((m) => {
    const a = sa[m] || 0;
    const b = sb[m] || 0;
    weekly[m] = { a, b, delta: b - a };
  });

  const na = exerciseNamesOf(programA);
  const nb = exerciseNamesOf(programB);
  const added = [...nb].filter((n) => !na.has(n)).sort();
  const removed = [...na].filter((n) => !nb.has(n)).sort();

  const notes = [];
  if (ta !== tb) notes.push(`Training days change from ${ta} to ${tb} per week.`);
  Object.entries(weekly).forEach(([m, v]) => {
    if (v.delta >= 4) notes.push(`${m} weekly sets rise by ${v.delta} (${v.a} to ${v.b}).`);
    else if (v.delta <= -4) notes.push(`${m} weekly sets drop by ${-v.delta} (${v.a} to ${v.b}).`);
  });
  if (added.length) notes.push(`${added.length} exercise(s) added.`);
  if (removed.length) notes.push(`${removed.length} exercise(s) removed.`);
  if (!notes.length) notes.push('No material difference in structure or volume.');

  return { days, trainingDays: { a: ta, b: tb }, weeklySetsByMuscle: weekly, added, removed, notes };
}
