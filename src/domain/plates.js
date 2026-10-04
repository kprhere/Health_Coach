// ============================================================
// domain/plates.js - barbell plate maths. Pure; no state.
// ============================================================
import { hasEnteredValue } from './util.js';

// ---------- barbell plate math ----------
// The bar carries no plates, so the loadable weight splits evenly across both
// sleeves and every count below is PER SIDE.
//
// Largest-plate-first is the obvious approach and it is wrong at the rack:
// 60 lb a side comes out as 45 + 10 + 5 when 35 + 25 is the same weight in
// two plates instead of three. So every plate size is reduced to a common
// integer step (their GCD) and a small table finds the fewest plates that hit
// the target exactly, falling back to the closest loadable weight under it.
const cents = (value) => Math.round(value * 100);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Safety valve. Real bars never get near this; nonsense input should not
// allocate a huge table, so it drops back to the largest-first pass instead.
const MAX_PLATE_STEPS = 20000;

function largestFirst(perSideCents, denomCents) {
  const result = [];
  let remaining = perSideCents;
  denomCents.forEach((plate) => {
    const count = Math.floor(remaining / plate);
    if (count) {
      result.push({ plate: plate / 100, count });
      remaining -= plate * count;
    }
  });
  return { result, remaining };
}

export function plateBreakdown(totalWeight, barWeight = 45, plates = [45, 35, 25, 10, 5, 2.5]) {
  // `reason` tells the caller WHY there is nothing to load, so the UI can say
  // something true instead of "0 lb per side cannot be loaded".
  const nothing = (reason) => ({ perSide: 0, plates: [], remainder: 0, exact: false, reason });
  if (!hasEnteredValue(totalWeight)) return nothing('empty');
  // A blank bar field is a missing answer, not a 0 lb bar. Treating it as zero
  // silently turns 225 lb into 112.5 a side and reports it as exact.
  if (!hasEnteredValue(barWeight)) return nothing('no-bar');

  const total = Number(totalWeight);
  const bar = Number(barWeight);
  if (!Number.isFinite(total) || !Number.isFinite(bar) || total < 0 || bar < 0) return nothing('invalid');
  if (total < bar) return nothing('below-bar');

  const perSideCents = cents(total - bar) / 2;
  const perSide = Math.round(perSideCents) / 100;
  const denomCents = [...new Set(
    plates.filter((plate) => Number.isFinite(plate) && plate > 0).map(cents),
  )].sort((a, b) => b - a);
  if (!denomCents.length) {
    return { perSide, plates: [], remainder: perSide, exact: perSide === 0, reason: null };
  }

  const step = denomCents.reduce(gcd);
  const targetSteps = Math.floor(perSideCents / step);

  if (targetSteps > MAX_PLATE_STEPS) {
    const { result, remaining } = largestFirst(perSideCents, denomCents);
    const remainder = Math.round(remaining) / 100;
    return { perSide, plates: result, remainder, exact: remainder === 0, reason: null };
  }

  // fewest[n] = fewest plates that weigh exactly n steps, -1 when unreachable.
  const units = denomCents.map((plate) => plate / step);
  const fewest = new Int32Array(targetSteps + 1).fill(-1);
  const chosen = new Int32Array(targetSteps + 1).fill(-1);
  fewest[0] = 0;
  for (let n = 1; n <= targetSteps; n += 1) {
    for (let d = 0; d < units.length; d += 1) {
      const unit = units[d];
      if (unit > n || fewest[n - unit] < 0) continue;
      const cost = fewest[n - unit] + 1;
      if (fewest[n] < 0 || cost < fewest[n]) {
        fewest[n] = cost;
        chosen[n] = d;
      }
    }
  }

  // Walk down to the heaviest loadable weight at or under the target. Step 0
  // is always reachable, so this terminates.
  let loaded = targetSteps;
  while (loaded > 0 && fewest[loaded] < 0) loaded -= 1;

  const counts = new Map();
  for (let n = loaded; n > 0; n -= units[chosen[n]]) {
    const plate = denomCents[chosen[n]];
    counts.set(plate, (counts.get(plate) || 0) + 1);
  }
  const result = [...counts.entries()]
    .sort(([a], [b]) => b - a)
    .map(([plate, count]) => ({ plate: plate / 100, count }));

  const remainderCents = perSideCents - loaded * step;
  return {
    perSide,
    plates: result,
    remainder: Math.round(remainderCents) / 100,
    exact: remainderCents < 0.005,
    reason: null,
  };
}
