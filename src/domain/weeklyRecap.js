// ============================================================
// domain/weeklyRecap.js - last-7-days vs the 7 before. Pure; reads state only.
// Missing data is null, never 0, so the UI can say "not logged".
// ============================================================
import { addDays } from './dates.js';
import { trainingActivity, recentPersonalRecords } from '../helpers.js';

function windowTotals(activity) {
  const trained = activity.filter((d) => d.sets > 0);
  return {
    workouts: trained.length,
    sets: trained.reduce((n, d) => n + d.sets, 0),
    volume: trained.reduce((n, d) => n + d.volume, 0),
  };
}

export function weeklyRecap(state, endKey) {
  const activity = trainingActivity(state, 14, endKey);
  const prior = windowTotals(activity.slice(0, 7));
  const current = windowTotals(activity.slice(7));
  const startKey = addDays(endKey, -6);
  const prs = recentPersonalRecords(state, 50).filter((r) => r.date >= startKey && r.date <= endKey);
  const hasData = current.sets > 0 || prior.sets > 0;
  // A % change against nothing is not a trend.
  const volumeChangePct = prior.volume > 0 && current.volume > 0
    ? Math.round(((current.volume - prior.volume) / prior.volume) * 100) : null;
  return {
    hasData, startKey, endKey, current, prior, volumeChangePct,
    prCount: prs.length, topPr: prs[0] || null,
  };
}
