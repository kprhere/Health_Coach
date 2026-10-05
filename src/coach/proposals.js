// ============================================================
// coach/proposals.js - findings -> proposals -> validated, atomic, undoable
// changes to state.
//
// Every function here is pure: state is never mutated, a new state comes
// back, and the clock is only ever passed in (todayKey, nowMs).
//
// Only three state keys are ever written: planOverrides, workoutSwaps and
// coach. Logged sessions, notes, custom exercises, nutrition and the
// program itself are carried through untouched.
//
// state.coach = { proposals:{id:proposal}, audit:[], settings:{mode, config} }
// Cooldown: an applied proposal blocks another over an overlapping date
// range for cooldownDays after it was applied; maxAppliedPer7Days caps the
// rate overall. Declined/rejected fingerprints are not re-proposed inside
// the cooldown either.
// ============================================================
import { dayFlags, daysBetween, resolveWorkout, toKey, exerciseLibrary, workoutSessionHasData } from '../helpers.js';
import { AUTO_OPS, KINDS, OPS, RULE_VERSION, WINDOWS, mergeConfig } from './constants.js';
import { assess, hashOf, inputsHash } from './metrics.js';
import { evaluate } from './rules.js';
import { applyOverrides, isDroppableBlock, totalSets } from './overrides.js';

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isKey = (v) => typeof v === 'string' && KEY_RE.test(v) && toKey(new Date(`${v}T12:00:00`)) === v;
const keyOfMs = (ms) => toKey(new Date(ms));
const CONFIDENCE = ['low', 'medium', 'high'];

export function ensureCoach(state) {
  const c = (state && state.coach) || {};
  return {
    ...c,
    proposals: c.proposals || {},
    audit: c.audit || [],
    settings: { mode: 'recommend', config: {}, ...(c.settings || {}) },
  };
}
const coachConfig = (state, config) => mergeConfig(ensureCoach(state).settings.config, config);

// ---------- building ----------
// Ops without a date are expanded to one op per target date, so everything
// downstream (validation, overrides, undo) works with dated ops only.
function normalizeOps(changes, targetDates) {
  const out = [];
  (changes || []).forEach((op) => {
    if (op.op === 'move' || op.date) out.push({ ...op });
    else (targetDates || []).forEach((date) => out.push({ ...op, date }));
  });
  return out;
}

export function proposalDates(changes) {
  const set = new Set();
  (changes || []).forEach((op) => {
    if (op.op === 'move') { if (op.from) set.add(op.from); if (op.to) set.add(op.to); } else if (op.date) set.add(op.date);
  });
  return [...set].sort();
}

export function buildProposal(findings, state, asOf, nowMs) {
  const list = [].concat(findings).filter(Boolean);
  const changes = list.flatMap((f) => normalizeOps(f.changes, f.targetDates));
  const dates = changes.length ? proposalDates(changes) : [...new Set(list.flatMap((f) => f.targetDates || []))].sort();
  const kinds = [...new Set(list.map((f) => f.kind))];
  const kind = kinds.length === 1 ? kinds[0] : 'combined';
  const rules = list.map((f) => f.rule);
  const fingerprint = hashOf({ rules, kind, dates, changes });
  const evidence = list.flatMap((f) => f.evidence || []);
  const windows = [...new Set(evidence.map((e) => e.window).filter((w) => WINDOWS.includes(w)))].sort((a, b) => a - b);
  return {
    id: `${asOf}-${fingerprint}`, fingerprint, createdAtMs: nowMs, asOf, ruleVersion: RULE_VERSION,
    kind, rules, dates, changes, evidence,
    missing: [...new Set(list.flatMap((f) => f.missing || []))],
    rationale: list.map((f) => f.rationale).join(' '),
    confidence: CONFIDENCE[Math.min(...list.map((f) => Math.max(0, CONFIDENCE.indexOf(f.confidence))))] || 'low',
    windows: windows.length ? windows : [...WINDOWS],
    sourceVersion: inputsHash(state, asOf),
    requiresAcceptance: list.some((f) => f.requiresAcceptance) || changes.some((o) => o.op === 'increase'),
    // Safety wording a finding wants shown with the proposal (e.g. the pain note).
    notes: [...new Set(list.map((f) => f.note).filter(Boolean))],
    status: 'pending',
  };
}

// Assess, evaluate and build one proposal per actionable finding. Findings
// that only inform or ask a question come back separately. Anything already
// pending or applied (same fingerprint) is not offered again.
export function generateProposals(state, asOf, nowMs, { config } = {}) {
  const cfg = coachConfig(state, config);
  const assessment = assess(state, asOf, { config: cfg });
  const findings = evaluate(assessment, state, asOf, cfg);
  const existing = Object.values(ensureCoach(state).proposals);
  const proposals = [];
  const notes = [];
  findings.forEach((f) => {
    if (!f.changes.length) { notes.push(f); return; }
    const p = buildProposal(f, state, asOf, nowMs);
    const recentlyDeclined = (e) => (e.status === 'declined' || e.status === 'rejected')
      && e.resolvedAtMs != null && nowMs != null && (nowMs - e.resolvedAtMs) < cfg.cooldownDays * 86400000;
    if (existing.some((e) => e.fingerprint === p.fingerprint && (e.status === 'pending' || e.status === 'applied' || recentlyDeclined(e)))) return;
    proposals.push(p);
  });
  return { assessment, findings, proposals, notes };
}

export function recordProposals(state, proposals) {
  const next = structuredClone(state);
  const coach = ensureCoach(next);
  [].concat(proposals).forEach((p) => { if (!coach.proposals[p.id]) coach.proposals[p.id] = p; });
  next.coach = coach;
  return next;
}

// ---------- validation ----------
const planBlock = (state, date, blockId) => resolveWorkout(date, state).blocks.find((b) => b.id === blockId);
const sessionInProgress = (s) => !!s && (s.inProgress === true || (!!s.startedAt && !s.completed));

function validateOp(op, state, errors) {
  if (!op || typeof op !== 'object' || !OPS.includes(op.op)) { errors.push(`unknown op: ${op && op.op}`); return; }
  const at = (m) => errors.push(`${op.op}: ${m}`);
  if (op.op === 'move') {
    if (!isKey(op.from) || !isKey(op.to) || op.from === op.to) at('needs two different valid dates');
    return;
  }
  if (!isKey(op.date)) { at('needs a valid date'); return; }
  const lib = exerciseLibrary(state);
  const block = op.blockId ? planBlock(state, op.date, op.blockId) : null;
  if (op.op === 'scale-sets') {
    if (typeof op.factor !== 'number' || !(op.factor >= 0.5 && op.factor <= 1)) at('factor must be between 0.5 and 1 (volume is never added)');
    if (op.minSets !== undefined && !(Number.isInteger(op.minSets) && op.minSets >= 1)) at('minSets must be an integer >= 1');
    if (op.blockId && !block) at(`block ${op.blockId} not in the plan on ${op.date}`);
  } else if (op.op === 'drop-block') {
    if (!block) at(`block ${op.blockId} not in the plan on ${op.date}`);
    else if (!isDroppableBlock(block)) at('only finisher or optional blocks can be dropped');
  } else if (op.op === 'substitute') {
    if (!block) at(`block ${op.blockId} not in the plan on ${op.date}`);
    else if (!block.exercises.some((e) => e.name === op.from)) at(`${op.from} is not in block ${op.blockId}`);
    if (typeof op.to !== 'string' || !lib[op.to] || op.to === op.from) at('replacement must be a different known exercise');
  } else if (op.op === 'recovery-day') {
    if (!resolveWorkout(op.date, state).blocks.length) at('no training session on that date');
  } else if (op.op === 'increase') {
    if (typeof op.exercise !== 'string' || !(typeof op.deltaWeight === 'number' && op.deltaWeight > 0)) at('needs an exercise and a positive deltaWeight');
    else if (!resolveWorkout(op.date, state).blocks.some((b) => b.exercises.some((e) => e.name === op.exercise))) at(`${op.exercise} is not planned on ${op.date}`);
  }
}

// Effective share of the day's planned sets that an override removes,
// counting anything already applied to that date.
function reductionPct(state, date, newOps) {
  const base = resolveWorkout(date, state);
  const before = totalSets(base);
  if (!before) return 0;
  const prior = (state.planOverrides && state.planOverrides[date] && state.planOverrides[date].ops) || [];
  const sim = { ...state, workoutSessions: {}, planOverrides: { [date]: { version: 0, proposalId: 'sim', ops: [...prior, ...newOps] } } };
  return Math.round(((before - totalSets(applyOverrides(base, date, sim))) / before) * 10000) / 100;
}

export function validateProposal(proposal, state, { todayKey, config, mode = 'manual' } = {}) {
  const errors = [];
  const p = proposal;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !Array.isArray(p.changes)) return { ok: false, errors: ['malformed proposal'] };
  if (!KINDS.includes(p.kind) && p.kind !== 'combined') errors.push(`unknown kind: ${p.kind}`);
  if (!isKey(p.asOf) || typeof p.sourceVersion !== 'string' || typeof p.fingerprint !== 'string') errors.push('malformed proposal');
  if (!p.changes.length) errors.push('nothing to apply');
  if (!isKey(todayKey)) errors.push('todayKey is required');
  if (errors.length && !isKey(todayKey)) return { ok: false, errors };

  const cfg = coachConfig(state, config);
  const coach = ensureCoach(state);
  p.changes.forEach((op) => validateOp(op, state, errors));
  if (errors.some((e) => e.startsWith('unknown op'))) return { ok: false, errors };

  if (p.status && p.status !== 'pending') errors.push(`proposal is ${p.status}, not pending`);
  if (isKey(p.asOf) && p.sourceVersion !== inputsHash(state, p.asOf)) errors.push('stale: the logged data it was based on has changed');

  // Protect the past and anything the person has started or finished.
  const dates = proposalDates(p.changes).filter(isKey);
  dates.forEach((date) => {
    const session = state.workoutSessions && state.workoutSessions[date];
    if (date < todayKey) errors.push(`${date} is in the past`);
    if (workoutSessionHasData(session) || sessionInProgress(session)) errors.push(`${date} already has a started or completed session`);
  });

  p.changes.filter((op) => op.op === 'move' && isKey(op.from) && isKey(op.to)).forEach((op) => {
    const swaps = state.workoutSwaps || {};
    [op.from, op.to].forEach((d) => {
      if (swaps[d]) errors.push(`${d} already has a swap`);
      if (state.planOverrides && state.planOverrides[d]) errors.push(`${d} already has an adaptive change`);
    });
    const restricted = state.settings && state.settings.restrictions && state.settings.restrictions.noHardLiftingOnFastDays === true;
    const hard = /^hard$/i.test(resolveWorkout(op.from, state).intensity || '');
    if (restricted && hard && dayFlags(op.to, state).fastDay) {
      errors.push(`a hard session cannot move onto the fasting day ${op.to}`);
    }
  });

  // Reduction caps, measured on the whole day's sets.
  const cap = mode === 'auto' ? cfg.autoMaxReductionPct : cfg.maxReductionPct;
  dates.forEach((date) => {
    const ops = p.changes.filter((o) => o.op !== 'move' && o.date === date);
    if (!ops.length || ops.some((o) => o.op === 'recovery-day')) return; // a recovery day is a deliberate swap, not a trim
    const pct = reductionPct(state, date, ops);
    if (pct > cap + 1e-9) errors.push(`${date}: reduction of ${pct}% exceeds the ${cap}% limit`);
  });

  if (mode === 'auto') {
    p.changes.forEach((op) => { if (!AUTO_OPS.includes(op.op)) errors.push(`${op.op} is never allowed in auto mode`); });
    if (p.requiresAcceptance) errors.push('this proposal needs acceptance');
  }

  // Duplicates, suppression, cooldown, rate limit.
  const others = Object.values(coach.proposals).filter((o) => o && o.id !== p.id);
  if (others.some((o) => o.fingerprint === p.fingerprint && (o.status === 'pending' || o.status === 'applied'))) errors.push('duplicate: the same change is already pending or applied');
  others.forEach((o) => {
    if (o.fingerprint === p.fingerprint && (o.status === 'declined' || o.status === 'rejected')
      && o.resolvedAtMs != null && daysBetween(keyOfMs(o.resolvedAtMs), todayKey) < cfg.cooldownDays) errors.push('recently declined: not proposed again during the cooldown');
  });
  const applied = others.filter((o) => o.status === 'applied' && o.appliedAtMs != null);
  const lo = dates[0], hi = dates[dates.length - 1];
  applied.forEach((o) => {
    const od = o.dates || [];
    if (od.length && lo && od[0] <= hi && lo <= od[od.length - 1] && daysBetween(keyOfMs(o.appliedAtMs), todayKey) < cfg.cooldownDays) {
      errors.push(`cooldown: ${o.id} changed an overlapping date range less than ${cfg.cooldownDays} days ago`);
    }
  });
  const recent = applied.filter((o) => { const d = daysBetween(keyOfMs(o.appliedAtMs), todayKey); return d >= 0 && d < 7; });
  if (recent.length >= cfg.maxAppliedPer7Days) errors.push(`rate limit: ${recent.length} changes already applied in the last 7 days`);

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

// ---------- applying ----------
export function applyProposal(state, proposal, { todayKey, nowMs, mode = 'manual', config } = {}) {
  const check = validateProposal(proposal, state, { todayKey, config, mode });
  if (!check.ok) return { ok: false, state, errors: check.errors };

  const next = structuredClone(state);
  const coach = ensureCoach(next);
  const undo = { overrides: {}, swaps: [] };
  const dates = proposalDates(proposal.changes.filter((o) => o.op !== 'move'));

  dates.forEach((date) => {
    const prev = (next.planOverrides && next.planOverrides[date]) || null;
    const add = proposal.changes.filter((o) => o.op !== 'move' && o.date === date);
    next.planOverrides = next.planOverrides || {};
    undo.overrides[date] = prev ? structuredClone(prev) : null;
    next.planOverrides[date] = {
      version: (prev ? prev.version : 0) + 1,
      proposalId: proposal.id,
      ops: [...(prev ? prev.ops : []), ...structuredClone(add)],
      appliedAtMs: nowMs,
      baseTitle: prev ? prev.baseTitle : resolveWorkout(date, state).title,
    };
  });
  proposal.changes.filter((o) => o.op === 'move').forEach((op) => {
    next.workoutSwaps = next.workoutSwaps || {};
    next.workoutSwaps[op.from] = op.to;
    next.workoutSwaps[op.to] = op.from;
    undo.swaps.push({ from: op.from, to: op.to });
  });

  const allDates = proposalDates(proposal.changes);
  coach.proposals[proposal.id] = {
    ...structuredClone(proposal), status: 'applied', appliedAtMs: nowMs, appliedMode: mode, dates: allDates, undo,
  };
  coach.audit = [...coach.audit, { at: nowMs, proposalId: proposal.id, action: 'applied', dates: allDates, mode, ruleVersion: proposal.ruleVersion }];
  next.coach = coach;
  return { ok: true, state: next, errors: [] };
}

// ---------- declining ----------
function resolve(state, proposalOrId, status, { nowMs } = {}) {
  const id = typeof proposalOrId === 'string' ? proposalOrId : proposalOrId && proposalOrId.id;
  const existing = ensureCoach(state).proposals[id] || (typeof proposalOrId === 'object' ? proposalOrId : null);
  if (!existing) return { ok: false, state, errors: ['unknown proposal'] };
  if (existing.status !== 'pending') return { ok: false, state, errors: [`proposal is ${existing.status}, not pending`] };
  const next = structuredClone(state);
  const coach = ensureCoach(next);
  coach.proposals[id] = { ...structuredClone(existing), status, resolvedAtMs: nowMs };
  coach.audit = [...coach.audit, { at: nowMs, proposalId: id, action: status, dates: existing.dates || [], mode: 'manual', ruleVersion: existing.ruleVersion }];
  next.coach = coach;
  return { ok: true, state: next, errors: [] };
}

export const rejectProposal = (state, proposalOrId, opts) => resolve(state, proposalOrId, 'rejected', opts);
// "Keep current plan": same bookkeeping, a different word for the person.
export const keepCurrent = (state, proposalOrId, opts) => resolve(state, proposalOrId, 'declined', opts);

// ---------- undo ----------
export function undoProposal(state, proposalId, { todayKey, nowMs } = {}) {
  const rec = ensureCoach(state).proposals[proposalId];
  const fail = (m) => ({ ok: false, state, errors: [m] });
  if (!rec || rec.status !== 'applied' || !rec.undo) return fail('only an applied proposal can be undone');
  if (!isKey(todayKey)) return fail('todayKey is required');
  for (const date of rec.dates || []) {
    if (!(date > todayKey)) return fail(`${date} is today or past; it can no longer be undone`);
    if (workoutSessionHasData(state.workoutSessions && state.workoutSessions[date])) return fail(`${date} has been started`);
  }
  for (const date of Object.keys(rec.undo.overrides)) {
    const cur = state.planOverrides && state.planOverrides[date];
    if (!cur || cur.proposalId !== proposalId) return fail(`${date} has since been changed again`);
  }
  for (const { from, to } of rec.undo.swaps) {
    const sw = state.workoutSwaps || {};
    if (sw[from] !== to || sw[to] !== from) return fail(`the swap ${from} <-> ${to} has since changed`);
  }

  const next = structuredClone(state);
  Object.entries(rec.undo.overrides).forEach(([date, prev]) => {
    if (prev) next.planOverrides[date] = structuredClone(prev); else delete next.planOverrides[date];
  });
  rec.undo.swaps.forEach(({ from, to }) => { delete next.workoutSwaps[from]; delete next.workoutSwaps[to]; });
  const coach = ensureCoach(next);
  coach.proposals[proposalId] = { ...coach.proposals[proposalId], status: 'undone', undoneAtMs: nowMs };
  coach.audit = [...coach.audit, { at: nowMs, proposalId, action: 'undone', dates: rec.dates, mode: rec.appliedMode || 'manual', ruleVersion: rec.ruleVersion }];
  next.coach = coach;
  return { ok: true, state: next, errors: [] };
}
