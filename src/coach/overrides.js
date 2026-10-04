// ============================================================
// coach/overrides.js - layers an accepted adaptive change on a day's plan.
//
// Precedence, lowest to highest:
//   base plan  <  workout swap  <  manual edits / unplanned entries
//              <  adaptive override (state.planOverrides[date])
// resolveWorkout() already yields base+swap. Manual edits live in the
// session, so a date whose session has data is NEVER altered: the plan comes
// back unchanged with adjustedBlocked = true.
//
// Block ids ('fullA#2') are assigned by resolveWorkout and must stay stable:
// logged sessions are keyed by them. Nothing here re-indexes; drop-block
// filters and the survivors keep their ids.
//
// Override entry: { version, proposalId, ops:[op], appliedAtMs, baseTitle }
// An op with a `date` that differs from the entry's date is ignored, so one
// proposal's per-date ops can be stored whole.
// ============================================================
import { workoutSessionHasData } from '../helpers.js';

export const EASY_DAY_NOTE = '20 min easy walk or mobility';

const isOptionalBlock = (b) => b.blockType === 'finisher' || /optional/i.test(b.name || '');
export const isDroppableBlock = isOptionalBlock;

const isSetBlock = (b) => b.blockType === 'single' || b.blockType === 'dropset';
const countOf = (b) => (isSetBlock(b) ? (b.exercises[0] && b.exercises[0].sets) : b.rounds) || 0;
const withCount = (b, n) => (isSetBlock(b)
  ? { ...b, exercises: b.exercises.map((e, i) => (i === 0 ? { ...e, sets: n } : e)) }
  : { ...b, rounds: n });

// Planned working sets/rounds in a plan, used to size reductions.
export const totalSets = (plan) => (plan.blocks || []).reduce((s, b) => s + countOf(b), 0);

// A block-targeted scale rounds that block's own count. A session-wide scale
// cuts floor(total * (1 - factor)) sets one at a time from the biggest
// block (later blocks first on ties), so whole-set rounding can never cut
// more than the nominal percentage.
function scaleBlocks(blocks, op) {
  const floor = Math.max(1, Math.floor(op.minSets || 1));
  if (op.blockId) {
    return blocks.map((b) => {
      const n = countOf(b);
      return b.id === op.blockId && n ? withCount(b, Math.min(n, Math.max(floor, Math.round(n * op.factor)))) : b;
    });
  }
  const out = [...blocks];
  let cut = Math.floor(totalSets({ blocks }) * (1 - op.factor) + 1e-9);
  while (cut-- > 0) {
    let pick = -1;
    out.forEach((b, i) => { if (countOf(b) > floor && (pick < 0 || countOf(b) >= countOf(out[pick]))) pick = i; });
    if (pick < 0) break;
    out[pick] = withCount(out[pick], countOf(out[pick]) - 1);
  }
  return out;
}

export function overrideSummary(override) {
  const lines = [];
  ((override && override.ops) || []).forEach((op) => {
    if (op.op === 'scale-sets') lines.push(`Sets x${Math.round(op.factor * 100) / 100}${op.blockId ? ` (${op.blockId})` : ''}`);
    else if (op.op === 'drop-block') lines.push(`Optional block removed (${op.blockId})`);
    else if (op.op === 'substitute') lines.push(`${op.from} -> ${op.to}`);
    else if (op.op === 'recovery-day') lines.push('Recovery day: easy walk or mobility');
    else if (op.op === 'increase') lines.push(`${op.exercise}: +${op.deltaWeight} suggested`);
    else if (op.op === 'move') lines.push(`Moved ${op.from} -> ${op.to}`);
  });
  return lines;
}

export function applyOverrides(plan, date, state) {
  const override = state && state.planOverrides && state.planOverrides[date];
  if (!override || !Array.isArray(override.ops) || !override.ops.length) return { ...plan };
  if (workoutSessionHasData(state.workoutSessions && state.workoutSessions[date])) {
    return { ...plan, adjustedBlocked: true };
  }

  let blocks = plan.blocks.map((b) => ({ ...b, exercises: (b.exercises || []).map((e) => ({ ...e })) }));
  let conditioning = plan.conditioning;
  let intensity = plan.intensity;

  override.ops.forEach((op) => {
    if (op.date && op.date !== date) return;
    if (op.op === 'scale-sets') {
      blocks = scaleBlocks(blocks, op);
    } else if (op.op === 'drop-block') {
      blocks = blocks.filter((b) => !(b.id === op.blockId && isOptionalBlock(b)));
    } else if (op.op === 'substitute') {
      blocks = blocks.map((b) => {
        if (b.id !== op.blockId) return b;
        return {
          ...b,
          name: b.name === op.from ? op.to : b.name,
          exercises: b.exercises.map((e) => (e.name === op.from ? { ...e, name: op.to, substitutedFrom: op.from } : e)),
        };
      });
    } else if (op.op === 'recovery-day') {
      blocks = [];
      conditioning = [EASY_DAY_NOTE];
      intensity = 'Easy';
    } else if (op.op === 'increase') {
      blocks = blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => (e.name === op.exercise ? { ...e, increaseBy: op.deltaWeight } : e)) }));
    }
  });

  return {
    ...plan, blocks, conditioning, intensity,
    adjusted: { proposalId: override.proposalId, version: override.version, summary: overrideSummary(override) },
  };
}
