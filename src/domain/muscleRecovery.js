// ============================================================
// domain/muscleRecovery.js - per-muscle "days since trained" and a rough
// recovery percentage. A planning heuristic from logged sets only: it knows
// nothing about sleep, pain or injury and is NOT clearance to train or rest.
// Muscles with no logged work in the lookback are null ("not logged").
// ============================================================
import { addDays, daysBetween } from './dates.js';
import { allSetRecords, muscleGroupOf } from '../helpers.js';

const LARGE = new Set(['Quads', 'Hamstrings', 'Glutes', 'Back', 'Chest']);
export const RECOVERY_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'];

export function muscleRecovery(state, endKey, lookbackDays = 14) {
  const startKey = addDays(endKey, -lookbackDays);
  const last = {};
  allSetRecords(state).forEach((r) => {
    if (r.date <= startKey || r.date > endKey) return;
    const g = muscleGroupOf(r.name, state);
    if (!RECOVERY_MUSCLES.includes(g)) return;
    const cur = last[g];
    if (!cur || r.date > cur.date) last[g] = { date: r.date, sets: 1 };
    else if (r.date === cur.date) cur.sets += 1;
  });
  return RECOVERY_MUSCLES.map((muscle) => {
    const l = last[muscle];
    if (!l) return { muscle, lastDate: null, daysSince: null, pct: null, status: 'not-logged' };
    const daysSince = daysBetween(l.date, endKey);
    // Larger muscles and harder sessions (many sets) are assumed to need longer.
    const needed = (LARGE.has(muscle) ? 3 : 2) + (l.sets >= 9 ? 1 : 0);
    const pct = Math.max(0, Math.min(100, Math.round((daysSince / needed) * 100)));
    return { muscle, lastDate: l.date, daysSince, pct, status: pct >= 100 ? 'ready' : pct >= 50 ? 'recovering' : 'fatigued' };
  });
}
