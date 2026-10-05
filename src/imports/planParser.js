// ============================================================
// imports/planParser.js - a training plan (CSV / JSON / text / manual) -> a
// REVIEWABLE parsed plan, and from there a program shaped exactly like PROGRAM.
//
// Uploaded text is untrusted DATA. Parsing here is pure: it never evaluates,
// fetches or executes anything, strips control characters, caps sizes, rejects
// prototype-pollution keys, and carries instruction-like text ("ignore previous
// instructions ...") as an inert note string. Nothing is guessed: unrecognised
// exercise names stay as typed (custom), missing units / ambiguous targets /
// unsupported prescriptions are flagged, and toProgram() only emits days a
// person has confirmed in the review step.
// ============================================================
import { EXERCISES, single, dropset, superset, circuit, finisher, REST_DAY, DAY_NAMES } from '../data.js';

export const PLAN_LIMITS = {
  maxChars: 1024 * 1024, maxRows: 2000, maxCols: 40, maxCell: 500,
  maxDays: 14, maxBlocksPerDay: 40, maxExercises: 600, jsonDepth: 8, jsonNodes: 20000,
};
const BLOCK_TYPES = ['single', 'superset', 'circuit', 'finisher', 'dropset'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MATCH_SUGGEST = 0.6;
const MATCH_AUTO = 0.95;

// ---------------------------------------------------------------- text utils
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const cleanText = (s, max = PLAN_LIMITS.maxCell) => String(s == null ? '' : s).replace(CONTROL, '').replace(/[\r\n]+/g, ' ').replace(/[ \t\u00a0]+/g, ' ').trim().slice(0, max);
const INSTRUCTION_LIKE = /ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)|disregard|system\s+prompt|you\s+are\s+(?:now\s+)?an?\s|override|exfiltrate|delete\s+(?:all|everything)|<\s*script|javascript:|https?:\/\//i;

const DOW_NAMES = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
export const dowFromLabel = (label) => {
  const t = String(label == null ? '' : label).toLowerCase().replace(/[^a-z]/g, '');
  return Object.prototype.hasOwnProperty.call(DOW_NAMES, t) ? DOW_NAMES[t] : null;
};

// ------------------------------------------------------- exercise matching
const SYN = { db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', kb: 'kettlebell', bw: 'bodyweight', ohp: 'overhead press', rdl: 'romanian deadlift', ez: 'ez', dl: 'deadlift' };
const normTokens = (name) => String(name)
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
  .split(/\s+/).filter(Boolean)
  .flatMap((t) => (SYN[t] ? SYN[t].split(' ') : [t]))
  .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

let INDEX = null;
const exerciseIndex = () => {
  if (!INDEX) INDEX = Object.keys(EXERCISES).map((name) => { const t = normTokens(name); return { name, tokens: t, joined: t.join(' ') }; });
  return INDEX;
};

// -> { matched: canonical|null, confidence, ambiguous }
export function matchExerciseName(name) {
  const tokens = normTokens(name);
  if (!tokens.length) return { matched: null, confidence: 0, ambiguous: false };
  const joined = tokens.join(' ');
  const set = new Set(tokens);
  const scored = exerciseIndex().map((e) => {
    if (e.joined === joined) return { name: e.name, score: 1 };
    const inter = e.tokens.filter((t) => set.has(t)).length;
    const dice = (2 * inter) / (tokens.length + e.tokens.length);
    const sim = 1 - lev(joined, e.joined) / Math.max(joined.length, e.joined.length);
    return { name: e.name, score: Math.max(dice, sim) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const next = scored[1];
  const ambiguous = best.score < 1 && next && best.score - next.score < 0.05 && best.score >= MATCH_SUGGEST;
  let confidence = Math.round(best.score * 100) / 100;
  if (ambiguous) confidence = Math.min(confidence, 0.7);
  return { matched: best.score >= MATCH_SUGGEST ? best.name : null, confidence, ambiguous: !!ambiguous };
}

const CARDIO_RE = /\b(run|running|jog|jogging|bike|cycling|cycle|rowing erg|row erg|treadmill|elliptical|stair\s?master|cardio|walk|walking|swim|swimming|jump rope|skipping|sprint)\b/i;

// ------------------------------------------------------------- value parsers
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// -> { sec } | { raw } (a bare number with no unit is never guessed)
export function parseRestValue(value, defaultUnit = null) {
  if (value == null || value === '') return {};
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return {};
    if (defaultUnit === 's') return { sec: value };
    if (defaultUnit === 'm') return { sec: Math.round(value * 60) };
    return { raw: String(value) };
  }
  const s = cleanText(value).toLowerCase();
  let m = /^(\d+):(\d{2})$/.exec(s);
  if (m) return { sec: +m[1] * 60 + +m[2] };
  m = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?)?$/.exec(s);
  if (!m) return { raw: s };
  const n = +m[1];
  const unit = m[2] ? (m[2][0] === 'm' ? 'm' : 's') : defaultUnit;
  if (unit === 's') return { sec: Math.round(n) };
  if (unit === 'm') return { sec: Math.round(n * 60) };
  return { raw: s };
}

// reps cell -> {repLow,repHigh,seconds,toFailure,repsRaw,note}
export function parseRepsValue(value) {
  const out = {};
  if (value == null || value === '') return out;
  if (typeof value === 'number') { if (Number.isFinite(value)) { out.repLow = value; out.repHigh = value; } return out; }
  let s = cleanText(value).toLowerCase();
  if (/amrap|failure|max reps?/.test(s)) { out.toFailure = true; return out; }
  const side = /\s*(?:each|per|\/)\s*(side|leg|arm)\b/.exec(s);
  if (side) { out.note = `each ${side[1]}`; s = s.replace(side[0], '').trim(); }
  let m = /^(\d+)\s*(?:-|–|—|to)\s*(\d+)$/.exec(s);
  if (m) { out.repLow = +m[1]; out.repHigh = +m[2]; if (out.repLow > out.repHigh) out.repsRaw = s; return out; }
  m = /^(\d+)$/.exec(s);
  if (m) { out.repLow = +m[1]; out.repHigh = +m[1]; return out; }
  m = /^(\d+)\s*(s|sec|secs|seconds?)$/.exec(s);
  if (m) { out.seconds = +m[1]; return out; }
  m = /^(\d+)\s*(m|min|mins|minutes?)$/.exec(s);
  if (m) { out.seconds = +m[1] * 60; return out; }
  out.repsRaw = s;
  return out;
}

const newExercise = (name) => ({
  name: cleanText(name, 120), matchedExercise: null, matchConfidence: 0, equipment: '',
  sets: null, repLow: null, repHigh: null, seconds: null, restSec: null, rpe: null, rir: null,
  tempo: '', note: '', unit: null, load: null,
  restRaw: null, repsRaw: null, toFailure: false, percent1RM: null, ambiguousAt: null,
  ambiguousMatch: false, matchConfirmed: false, customConfirmed: false,
});

// Fill matched/equipment from the library (suggestion only).
function finalizeExercise(ex, explicitEquipment) {
  const m = matchExerciseName(ex.name);
  ex.matchedExercise = m.matched;
  ex.matchConfidence = m.confidence;
  ex.ambiguousMatch = m.ambiguous;
  ex.equipment = cleanText(explicitEquipment || '', 60) || (m.matched && m.confidence >= MATCH_SUGGEST ? EXERCISES[m.matched].eq : '');
  ex.cardio = CARDIO_RE.test(ex.name);
  return ex;
}

// ------------------------------------------- prescription inside a text line
const NUM = '(\\d+(?:\\.\\d+)?)';
export function parsePrescription(textIn) {
  let s = ` ${cleanText(textIn, 400)} `;
  const f = {};
  const take = (re, fn) => { const m = re.exec(s); if (m) { fn(m); s = s.replace(m[0], ' '); return true; } return false; };

  take(new RegExp(`\\brest\\s*[:=]?\\s*${NUM}\\s*(seconds?|secs?|s|minutes?|mins?|m)?(?![a-z])`, 'i'),
    (m) => Object.assign(f, parseRestValue(m[1] + (m[2] ? ` ${m[2]}` : ''))));
  if (f.sec === undefined && f.raw === undefined) {
    take(new RegExp(`${NUM}\\s*(seconds?|secs?|s|minutes?|mins?)\\s+rest\\b`, 'i'), (m) => Object.assign(f, parseRestValue(`${m[1]} ${m[2]}`)));
  }
  take(/@\s*rpe\s*(\d+(?:\.\d)?)|\brpe\s*[:@]?\s*(\d+(?:\.\d)?)/i, (m) => { f.rpe = toNum(m[1] || m[2]); });
  take(/\b(\d)\s*rir\b|\brir\s*[:@]?\s*(\d)/i, (m) => { f.rir = toNum(m[1] || m[2]); });
  take(/\b(\d)-(\d|x)-(\d|x)(?:-(\d|x))?\b/i, (m) => { f.tempo = m[0].trim(); });
  take(/(\d{1,3})\s*%/, (m) => { f.percent1RM = +m[1]; });
  take(new RegExp(`${NUM}\\s*(lbs?|kgs?|pounds?)\\b`, 'i'), (m) => {
    f.load = +m[1];
    f.unit = /^k/i.test(m[2]) ? 'kg' : 'lb';
  });
  take(new RegExp(`@\\s*${NUM}(?![\\d.]*\\s*(?:x|rpe))`, 'i'), (m) => {
    const n = +m[1];
    if (n > 10) f.load = n; else f.ambiguousAt = m[1];
  });
  take(/\b(\d+)\s*drops?\b/i, (m) => { f.drops = +m[1]; });
  take(/\bamrap\b|\bto\s+failure\b|\bfailure\b/i, () => { f.toFailure = true; });
  // sets x reps
  if (!take(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+)\\s*(?:(?:-|–|—|to)\\s*(\\d+))?\\s*(seconds?|secs?|s|min|mins|minutes?)?(?![a-z])`, 'i'), (m) => {
    f.sets = +m[1];
    if (m[4]) f.seconds = +m[2] * (/^m/i.test(m[4]) ? 60 : 1);
    else { f.repLow = +m[2]; f.repHigh = m[3] ? +m[3] : +m[2]; }
  })) {
    if (!take(/(\d+)\s*sets?\s*(?:of|x)?\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/i, (m) => { f.sets = +m[1]; f.repLow = +m[2]; f.repHigh = m[3] ? +m[3] : +m[2]; })) {
      take(/(\d+)\s*[x×](?![\w])/i, (m) => { f.sets = +m[1]; });
    }
  }
  take(/\b(\d+)\s*(min|mins|minutes)\b/i, (m) => { f.seconds = +m[1] * 60; });
  take(/\b(\d+)\s*(sec|secs|seconds|s)\b/i, (m) => { f.seconds = +m[1]; });
  take(/\b(\d+)\s*rounds?\b/i, (m) => { f.rounds = +m[1]; });
  let name = s;
  let note = '';
  name = name.replace(/\(([^)]*)\)/g, (_, inner) => { note = note ? `${note}; ${inner}` : inner; return ' '; });
  name = name.replace(/\[[^\]]*\]/g, ' ').replace(/[@,;:]+\s*$/g, ' ').replace(/^\s*[-–—:@,]+/, ' ').replace(/\s+[-–—:@,]+\s*$/, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  return { f, name, note: cleanText(note, 200) };
}

function applyFields(ex, f) {
  ['sets', 'repLow', 'repHigh', 'seconds', 'restSec', 'rpe', 'rir', 'load', 'unit', 'percent1RM', 'drops'].forEach((k) => {
    if (f[k] !== undefined && f[k] !== null) ex[k] = f[k];
  });
  if (f.sec !== undefined) ex.restSec = f.sec;
  if (f.raw !== undefined && ex.restSec === null) ex.restRaw = f.raw;
  if (f.tempo) ex.tempo = f.tempo;
  if (f.toFailure) ex.toFailure = true;
  if (f.repsRaw) ex.repsRaw = f.repsRaw;
  if (f.ambiguousAt) ex.ambiguousAt = f.ambiguousAt;
  if (f.note) ex.note = ex.note ? `${ex.note}; ${f.note}` : f.note;
  return ex;
}

// -------------------------------------------------------- exercise from fields
const ALIAS = {
  day: ['day', 'weekday', 'dow', 'day of week', 'daylabel'],
  title: ['title', 'session', 'workout', 'focus', 'day name', 'dayname'],
  exercise: ['exercise', 'movement', 'name', 'lift', 'exercise name'],
  sets: ['sets', 'set', 'num sets', 'nsets'],
  reps: ['reps', 'rep', 'repetitions', 'rep range', 'reprange', 'reps time', 'reps/time'],
  rest: ['rest', 'rest time', 'rest sec', 'rest seconds', 'rest s', 'rest min', 'restsec', 'rest period'],
  rpe: ['rpe'],
  rir: ['rir'],
  equipment: ['equipment', 'equip'],
  group: ['group', 'superset', 'ss', 'superset id', 'circuit', 'block', 'group id'],
  notes: ['notes', 'note', 'comments', 'cue', 'cues', 'comment'],
  tempo: ['tempo'],
  load: ['weight', 'load'],
  unit: ['unit', 'units'],
  seconds: ['seconds', 'duration', 'time', 'duration sec', 'durationsec'],
  blocktype: ['block type', 'blocktype', 'type'],
};
const ALIAS_LOOKUP = (() => {
  const m = {};
  Object.entries(ALIAS).forEach(([canon, list]) => list.forEach((a) => { m[a.replace(/[^a-z0-9]/g, '')] = canon; }));
  return m;
})();
const canonKey = (h) => ALIAS_LOOKUP[String(h).toLowerCase().replace(/[^a-z0-9]/g, '')] || null;
const headerRestUnit = (h) => {
  const t = String(h).toLowerCase();
  if (/\bmin|\(m\)/.test(t)) return 'm';
  if (/sec|\(s\)|seconds/.test(t)) return 's';
  return null;
};

// fields: { canonicalKey: value }, extras: { restUnit }
function exerciseFromFields(fields, notices, ref) {
  const rawName = fields.exercise;
  let name = cleanText(rawName, 120);
  if (/^[=+@]/.test(name)) { name = name.replace(/^[=+@\s]+/, ''); notices.push(mk('info', 'formula-like-cell', 'A cell started with a formula character; it was kept as plain text.', ref)); }
  if (!name) return null;
  const ex = newExercise(name);
  if (fields.sets !== undefined && fields.sets !== '') {
    const n = toNum(typeof fields.sets === 'string' ? fields.sets.replace(/x$/i, '') : fields.sets);
    if (n !== null && Number.isInteger(n)) ex.sets = n; else ex.repsRaw = ex.repsRaw || `sets: ${cleanText(fields.sets, 40)}`;
  }
  Object.assign(ex, applyRepsFields(ex, fields));
  if (fields.reps !== undefined) {
    // "3x8-10" typed into a reps cell.
    const m = /^(\d+)\s*[x×]\s*(.+)$/i.exec(cleanText(fields.reps));
    if (m && ex.sets === null) { ex.sets = +m[1]; applyFields(ex, parseRepsValue(m[2])); ex.repsRaw = null; }
  }
  if (fields.rest !== undefined && fields.rest !== '') applyFields(ex, parseRestValue(fields.rest, fields.restUnit || null));
  if (fields.rpe !== undefined && fields.rpe !== '') ex.rpe = toNum(fields.rpe);
  if (fields.rir !== undefined && fields.rir !== '') ex.rir = toNum(fields.rir);
  if (fields.tempo) ex.tempo = cleanText(fields.tempo, 20);
  if (fields.notes) ex.note = cleanText(fields.notes, 300);
  if (fields.load !== undefined && fields.load !== '') {
    const m = new RegExp(`^${NUM}\\s*(lbs?|kgs?)?$`, 'i').exec(cleanText(fields.load));
    if (m) { ex.load = +m[1]; if (m[2]) ex.unit = /^k/i.test(m[2]) ? 'kg' : 'lb'; }
  }
  if (fields.unit) { const u = String(fields.unit).toLowerCase(); if (/^lb/.test(u)) ex.unit = 'lb'; else if (/^kg/.test(u)) ex.unit = 'kg'; }
  if (fields.seconds !== undefined && fields.seconds !== '') {
    const r = parseRepsValue(typeof fields.seconds === 'number' ? `${fields.seconds}s` : (/^\d+$/.test(String(fields.seconds)) ? `${fields.seconds}s` : fields.seconds));
    if (r.seconds) ex.seconds = r.seconds;
  }
  return finalizeExercise(ex, fields.equipment);
}

function applyRepsFields(ex, fields) {
  if (fields.repLow !== undefined || fields.repHigh !== undefined) {
    const lo = toNum(fields.repLow);
    const hi = toNum(fields.repHigh);
    return { repLow: lo !== null ? lo : hi, repHigh: hi !== null ? hi : lo };
  }
  if (fields.reps === undefined || fields.reps === '') return {};
  if (/^\d+\s*[x×]/i.test(cleanText(fields.reps))) return {};
  const r = parseRepsValue(fields.reps);
  const out = {};
  ['repLow', 'repHigh', 'seconds'].forEach((k) => { if (r[k] !== undefined) out[k] = r[k]; });
  if (r.toFailure) out.toFailure = true;
  if (r.repsRaw) out.repsRaw = r.repsRaw;
  if (r.note) out.note = r.note;
  return out;
}

const mk = (severity, code, message, ref = null) => ({ severity, code, message, ref });
const newBlock = (blockType, name, exercises) => ({ blockType, name, exercises, rounds: null, restAfterRoundSec: null, durationSec: null, drops: null });
const newDay = (dayLabel, dow, title = '') => ({ dayLabel: cleanText(dayLabel, 60), dow, title: cleanText(title, 80), blocks: [], notes: [], restDay: false, confirmed: false });

function finishGroupBlock(block) {
  const sets = block.exercises.map((e) => e.sets).filter((n) => n !== null);
  if (block.rounds === null && sets.length) block.rounds = Math.max(...sets);
  if (block.blockType === 'finisher' && block.durationSec === null) {
    const secs = block.exercises.map((e) => e.seconds).filter((n) => n);
    if (secs.length === 1 && block.exercises.length === 1) block.durationSec = secs[0];
  }
  return block;
}

// ------------------------------------------------------------------- CSV
export function parseCsvRows(textIn, notices = []) {
  let text = String(textIn).replace(/^﻿/, '');
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] || '';
  const count = (ch) => (firstLine.match(new RegExp(ch === '\t' ? '\\t' : `\\${ch}`, 'g')) || []).length;
  const delim = ['\t', ';', ','].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  const D = delim[1] > 0 ? delim[0] : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else inQ = false; } else cell += c;
    } else if (c === '"' && cell === '') inQ = true;
    else if (c === D) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      if (rows.length > PLAN_LIMITS.maxRows) { notices.push(mk('warn', 'too-many-rows', `Only the first ${PLAN_LIMITS.maxRows} rows were read.`)); return rows; }
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.slice(0, PLAN_LIMITS.maxCols).map((x) => cleanText(x)));
}

function parseCsvPlan(content, ctx) {
  const rows = parseCsvRows(content, ctx.notices);
  if (rows.length < 2) { ctx.errors.push({ code: 'csv-empty', message: 'The CSV needs a header row and at least one exercise row.' }); return; }
  const header = rows[0];
  const cols = header.map(canonKey);
  if (!cols.includes('exercise')) { ctx.errors.push({ code: 'csv-no-exercise-column', message: 'No exercise column was found. Name the column "exercise".' }); return; }
  const restUnit = headerRestUnit(header[cols.indexOf('rest')] || '');
  let prevDay = '';
  let prevTitle = '';
  const groups = new Map();
  let day = null;
  rows.slice(1).forEach((r, ri) => {
    const f = {};
    cols.forEach((c, i) => { if (c && r[i] !== undefined && f[c] === undefined) f[c] = r[i]; });
    const label = f.day || prevDay;
    if (f.day) { prevDay = f.day; prevTitle = f.title || ''; }
    const title = f.title || (f.day ? '' : prevTitle);
    if (!day || day.dayLabel !== cleanText(label || 'Day 1', 60)) {
      const existing = ctx.days.find((d) => d.dayLabel === cleanText(label || 'Day 1', 60));
      if (existing) day = existing; else {
        day = newDay(label || 'Day 1', dowFromLabel(label), title);
        ctx.days.push(day);
      }
      groups.clear();
    }
    if (!day.title && title) day.title = cleanText(title, 80);
    if (/^(rest|off|rest day)$/i.test(f.exercise || '')) { day.restDay = true; if (!day.title) day.title = 'Rest'; return; }
    f.restUnit = restUnit;
    const ref = { row: ri + 2 };
    const ex = exerciseFromFields(f, ctx.notices, ref);
    if (!ex) return;
    const bt = BLOCK_TYPES.includes(String(f.blocktype || '').toLowerCase()) ? String(f.blocktype).toLowerCase() : null;
    const g = f.group && !/^(none|-|n\/a)?$/i.test(f.group) ? f.group : null;
    if (g && groups.has(g)) { groups.get(g).exercises.push(ex); if (bt) groups.get(g).declared = bt; return; }
    const block = newBlock(bt || 'single', ex.name, [ex]);
    if (g) { block.declared = bt; groups.set(g, block); }
    day.blocks.push(block);
  });
  ctx.days.forEach((d) => d.blocks.forEach((b) => {
    if (b.declared !== undefined) { // group block
      const n = b.exercises.length;
      b.blockType = b.declared || (n >= 3 ? 'circuit' : n === 2 ? 'superset' : 'single');
      b.name = b.exercises.map((e) => e.name).join(' + ').slice(0, 120);
      delete b.declared;
    }
    finishGroupBlock(b);
  }));
}

// ------------------------------------------------------------------ JSON
function walkJson(node, depth, state) {
  if (depth > PLAN_LIMITS.jsonDepth) throw new Error('json-too-deep');
  state.nodes += 1;
  if (state.nodes > PLAN_LIMITS.jsonNodes) throw new Error('json-too-large');
  if (Array.isArray(node)) { node.forEach((n) => walkJson(n, depth + 1, state)); return; }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach((k) => {
      if (FORBIDDEN_KEYS.has(k)) throw new Error('json-forbidden-key');
      walkJson(node[k], depth + 1, state);
    });
  }
}

const pick = (obj, keys) => { for (const k of keys) { if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined && obj[k] !== null) return obj[k]; } return undefined; };

function jsonExercise(item, ctx, ref) {
  if (typeof item === 'string') return textExercise(item, ctx, ref);
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const f = {};
  Object.keys(item).forEach((k) => {
    const c = canonKey(k);
    if (c && f[c] === undefined) f[c] = item[k];
  });
  if (f.exercise === undefined && typeof item.name === 'string') f.exercise = item.name;
  ['repLow', 'repHigh'].forEach((k) => { if (item[k] !== undefined) f[k] = item[k]; });
  const restKey = Object.keys(item).find((k) => canonKey(k) === 'rest');
  if (restKey) f.restUnit = /sec$/i.test(restKey) || /seconds?$/i.test(restKey) ? 's' : headerRestUnit(restKey);
  const ex = exerciseFromFields(f, ctx.notices, ref);
  if (ex && item.drops !== undefined && toNum(item.drops) !== null) ex.drops = toNum(item.drops);
  if (ex && item.restSec !== undefined && toNum(item.restSec) !== null) { ex.restSec = toNum(item.restSec); ex.restRaw = null; }
  return ex;
}

function parseJsonPlan(content, ctx) {
  let data;
  try {
    if (content.length > PLAN_LIMITS.maxChars) throw new Error('json-too-large');
    data = JSON.parse(content);
    walkJson(data, 0, { nodes: 0 });
  } catch (e) {
    const code = ['json-too-deep', 'json-too-large', 'json-forbidden-key'].includes(e.message) ? e.message : 'json-invalid';
    const msg = {
      'json-too-deep': 'The JSON is nested too deeply.', 'json-too-large': 'The JSON is too large.',
      'json-forbidden-key': 'The JSON contains a reserved key (__proto__, constructor or prototype) and was rejected.',
      'json-invalid': 'The file is not valid JSON.',
    }[code];
    ctx.errors.push({ code, message: msg });
    return;
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.name === 'string') ctx.planName = cleanText(data.name, 80);
  let entries = [];
  const root = Array.isArray(data) ? data : data && data.days;
  if (Array.isArray(root)) entries = root.map((d, i) => [String(i), d, false]);
  else if (root && typeof root === 'object') entries = Object.keys(root).map((k) => [k, root[k], true]);
  if (!entries.length) { ctx.errors.push({ code: 'json-no-days', message: 'No days were found in the JSON.' }); return; }
  if (data && Array.isArray(data.progression)) data.progression.forEach((p) => { const t = cleanText(typeof p === 'string' ? p : p && p.text, 300); if (t) ctx.progression.push({ text: t }); });
  else if (data && typeof data.progression === 'string') ctx.progression.push({ text: cleanText(data.progression, 300) });

  entries.forEach(([key, d]) => {
    if (!d || typeof d !== 'object') return;
    const keyedDow = /^[0-6]$/.test(key) && !Array.isArray(root) ? +key : null;
    const label = pick(d, ['day', 'dayLabel', 'label']) ?? (keyedDow !== null ? DAY_NAMES[keyedDow] : `Day ${+key + 1}`);
    let dow = Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6 ? d.dow : null;
    if (dow === null) dow = dowFromLabel(label);
    if (dow === null) dow = keyedDow;
    const day = newDay(String(label), dow, String(pick(d, ['title', 'name', 'focus']) ?? ''));
    if (d.dayType === 'rest' || d.restDay === true) day.restDay = true;
    if (typeof d.notes === 'string' && d.notes) day.notes.push(cleanText(d.notes, 300));
    const dref = { day: ctx.days.length };
    if (Array.isArray(d.blocks)) {
      d.blocks.slice(0, PLAN_LIMITS.maxBlocksPerDay).forEach((b) => {
        if (!b || typeof b !== 'object') return;
        const bt = BLOCK_TYPES.includes(b.blockType) ? b.blockType : 'single';
        const exs = (Array.isArray(b.exercises) ? b.exercises : []).map((e) => jsonExercise(e, ctx, dref)).filter(Boolean);
        if (!exs.length) return;
        const block = newBlock(bt, cleanText(b.name || exs[0].name, 120), exs);
        ['rounds', 'restAfterRoundSec', 'durationSec'].forEach((k) => { if (toNum(b[k]) !== null) block[k] = toNum(b[k]); });
        if (toNum(b.drops) !== null) block.drops = toNum(b.drops);
        if (bt === 'single' || bt === 'dropset') exs.forEach((e) => { if (e.sets === null && toNum(b.sets) !== null) e.sets = toNum(b.sets); });
        day.blocks.push(finishGroupBlock(block));
      });
    }
    if (Array.isArray(d.exercises)) {
      const groups = new Map();
      d.exercises.slice(0, 200).forEach((item) => {
        const ex = jsonExercise(item, ctx, dref);
        if (!ex) return;
        const g = item && typeof item === 'object' ? pick(item, ['group', 'superset', 'circuit']) : undefined;
        const bt = item && typeof item === 'object' && BLOCK_TYPES.includes(item.blockType) ? item.blockType : null;
        if (g !== undefined && g !== false && g !== '') {
          const gk = String(g);
          if (groups.has(gk)) { groups.get(gk).exercises.push(ex); return; }
          const block = newBlock(bt || 'single', ex.name, [ex]); block.declared = bt; groups.set(gk, block); day.blocks.push(block); return;
        }
        day.blocks.push(newBlock(bt || 'single', ex.name, [ex]));
      });
      day.blocks.forEach((b) => {
        if (b.declared !== undefined) {
          const n = b.exercises.length;
          b.blockType = b.declared || (n >= 3 ? 'circuit' : n === 2 ? 'superset' : 'single');
          b.name = b.exercises.map((e) => e.name).join(' + ').slice(0, 120);
          delete b.declared;
        }
        finishGroupBlock(b);
      });
    }
    if (!day.blocks.length && !day.restDay && /^(rest|off)$/i.test(day.title)) day.restDay = true;
    ctx.days.push(day);
  });
}

// ------------------------------------------------------------------ text
function textExercise(line, ctx, ref) {
  const { f, name, note } = parsePrescription(line);
  if (!name) return null;
  const ex = newExercise(name);
  if (note) ex.note = note;
  applyFields(ex, f);
  return finalizeExercise(ex);
}

const DAYHEAD = /^(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\b\s*(?:[:\-–—]\s*|$)(.*)$/i;
const DAYNUM = /^day\s*(\d{1,2})\b\s*(?:[:\-–—]\s*|$)(.*)$/i;
const HAS_RX = /\d+\s*[x×]\s*\d|\d+\s*[x×](?![\w])|\bsets?\b|\brpe\b|\brir\b|\d+\s*(?:min|mins|minutes|sec|secs|seconds)\b|\bto\s+failure\b|\bamrap\b/i;

function parseTextPlan(content, ctx) {
  const lines = content.split(/\r\n|\r|\n/).slice(0, 5000);
  let day = null;
  let lastBlock = null;
  const groups = new Map();
  const ensureDay = () => {
    if (!day) { day = newDay(`Day ${ctx.days.length + 1}`, null, ''); ctx.days.push(day); }
    return day;
  };
  const addNote = (text, code, message) => {
    const t = cleanText(text, 300);
    if (!t) return;
    (day ? day.notes : ctx.notes).push(t);
    if (code) ctx.notices.push(mk('info', code, message, { text: t }));
  };
  const closeGroups = () => {
    groups.forEach((g) => {
      const n = g.block.exercises.length;
      g.block.blockType = g.declared || (n >= 3 ? 'circuit' : n === 2 ? 'superset' : 'single');
      g.block.name = g.block.exercises.map((e) => e.name).join(' + ').slice(0, 120);
      finishGroupBlock(g.block);
    });
    groups.clear();
  };

  lines.forEach((raw0) => {
    let line = cleanText(raw0, 400).replace(/^#+\s*/, '').replace(/^\*\*(.*?)\*\*:?/, '$1:').replace(/^\s*(?:[-*•·]|\d+[.)])\s+(?=\S)/, '');
    if (!line) return;
    const ref = { text: line.slice(0, 80) };

    // day headers
    let m = DAYHEAD.exec(line) || DAYNUM.exec(line);
    if (m) {
      const isNum = /^day\s*\d/i.test(line);
      const rest = (m[2] || '').trim();
      const labelTxt = isNum ? `Day ${m[1]}` : m[1];
      const looksRx = rest && HAS_RX.test(rest);
      closeGroups();
      const dowHere = isNum ? null : dowFromLabel(labelTxt);
      if (day && dowHere !== null && day.dow === dowHere && !day.restDay) {
        if (!looksRx && rest && !day.title) day.title = cleanText(rest, 80);
      } else {
        day = newDay(labelTxt, dowHere, looksRx ? '' : rest);
        ctx.days.push(day);
        lastBlock = null;
        if (/^(rest|off|rest day|recovery)$/i.test(rest)) { day.restDay = true; day.title = 'Rest'; return; }
      }
      if (!looksRx) return;
      line = rest;
    }

    // progression / notes
    m = /^(progression|progressive overload|progress)\s*[:\-–]\s*(.+)$/i.exec(line);
    if (m) { ctx.progression.push({ text: cleanText(m[2], 300) }); return; }
    m = /^(?:notes?|cue|tip)\s*[:\-–]\s*(.+)$/i.exec(line);
    if (m) {
      const t = cleanText(m[1], 300);
      if (lastBlock && lastBlock.exercises.length) { const e = lastBlock.exercises[lastBlock.exercises.length - 1]; e.note = e.note ? `${e.note}; ${t}` : t; } else addNote(t);
      if (INSTRUCTION_LIKE.test(t)) ctx.notices.push(mk('info', 'instruction-like-text', 'A note contains instruction-like text. It was kept as plain text and has no effect.', ref));
      return;
    }

    // group declaration "A1/A2 superset"
    m = /^([A-Z])\d(?:\s*[/&+,]\s*[A-Z]?\d)+\s*[:\-–]?\s*(superset|circuit|giant set|tri-?set)?\b\s*(.*)$/.exec(line);
    if (m) {
      const g = groups.get(m[1]) || { declared: null, block: null };
      g.declared = /circuit|giant|tri/i.test(m[2] || '') ? 'circuit' : 'superset';
      groups.set(m[1], g);
      return;
    }
    // finisher
    m = /^finisher\s*[:\-–]\s*(.*)$/i.exec(line);
    if (m) {
      ensureDay();
      const body = m[1];
      const parts = body.split(/\s*[;+]\s*|,(?!\d)/).map((p) => p.trim()).filter(Boolean);
      const exs = parts.map((p) => {
        const { f, name, note } = parsePrescription(p);
        let n = name;
        const tail = /^(.*\S)\s+(\d{1,3})$/.exec(n);
        if (tail && f.repLow === undefined && f.seconds === undefined) { n = tail[1]; f.repLow = +tail[2]; f.repHigh = +tail[2]; }
        if (!n) return null;
        const ex = newExercise(n);
        if (note) ex.note = note;
        applyFields(ex, f);
        return { ex: finalizeExercise(ex), f };
      }).filter(Boolean);
      if (!exs.length) { ctx.notices.push(mk('warn', 'empty-finisher', 'A finisher line had no exercises.', ref)); return; }
      const block = newBlock('finisher', exs.map((e) => e.ex.name).join(' + ').slice(0, 120), exs.map((e) => e.ex));
      const rounds = exs.map((e) => e.f.rounds).find((r) => r);
      if (rounds) block.rounds = rounds;
      if (exs.length === 1 && exs[0].ex.seconds) block.durationSec = exs[0].ex.seconds;
      else if (exs.length > 1) { const d = exs.map((e) => e.f.seconds).find((s) => s); if (d) block.durationSec = d; }
      day.blocks.push(block); lastBlock = block;
      return;
    }
    // inline superset / circuit
    m = /^(superset|circuit|giant set)\s*[:\-–]\s*(.*)$/i.exec(line);
    if (m) {
      ensureDay();
      const exs = m[2].split(/\s+\+\s+|\s*;\s*/).map((p) => textExercise(p, ctx, ref)).filter(Boolean);
      if (!exs.length) return;
      const bt = /circuit|giant/i.test(m[1]) || exs.length >= 3 ? (/superset/i.test(m[1]) ? 'superset' : 'circuit') : 'superset';
      const block = newBlock(bt, exs.map((e) => e.name).join(' + ').slice(0, 120), exs);
      finishGroupBlock(block);
      day.blocks.push(block); lastBlock = block;
      return;
    }
    // dropset
    let dropTag = false;
    const dm = /^(?:drop\s*-?\s*set)\s*[:\-–]\s*(.*)$/i.exec(line);
    if (dm) { line = dm[1]; dropTag = true; } else if (/\(\s*drop\s*-?\s*set\s*\)/i.test(line)) { line = line.replace(/\(\s*drop\s*-?\s*set\s*\)/i, ' '); dropTag = true; }

    // group member "A1 Back Squat 3x6"
    let groupLetter = null;
    const gm = /^([A-Z])(\d)\s*[.):\-]?\s+(\S.*)$/.exec(line);
    if (gm) { groupLetter = gm[1]; line = gm[3]; }

    if (!HAS_RX.test(line) && !dropTag) {
      const words = line.split(/\s+/).length;
      if (INSTRUCTION_LIKE.test(line)) {
        addNote(line, 'instruction-like-text', 'A line contains instruction-like text. It was kept as an inert note and has no effect on the plan.');
        return;
      }
      if (/^(rest|off)\b/i.test(line) && words <= 3) return;
      if (!day) { addNote(line); return; }
      if (words > 6 || !/^[A-Za-z][A-Za-z0-9 '\-&/().]*$/.test(line) || /[.!?]$/.test(line)) {
        addNote(line, 'unparsed-line', 'A line was not understood and was kept as a note.');
        return;
      }
    }
    const ex = textExercise(line, ctx, ref);
    if (!ex) return;
    ensureDay();
    if (groupLetter) {
      let g = groups.get(groupLetter);
      if (!g) { g = { declared: null, block: null }; groups.set(groupLetter, g); }
      if (!g.block) { g.block = newBlock('superset', ex.name, []); day.blocks.push(g.block); }
      g.block.exercises.push(ex); lastBlock = g.block;
      return;
    }
    const block = newBlock(dropTag ? 'dropset' : 'single', ex.name, [ex]);
    if (dropTag) { const d = parsePrescription(line).f.drops; if (d) block.drops = d; }
    day.blocks.push(block); lastBlock = block;
  });
  closeGroups();
}

// ----------------------------------------------------------------- warnings
function exerciseWarnings(ex, block, parsed, ref, out) {
  const w = (severity, code, message) => out.push(mk(severity, code, message, ref));
  if (ex.matchedExercise === null && !ex.customConfirmed) w('warn', 'unrecognised', `"${ex.name}" is not in the exercise library. It will be kept as a custom exercise.`);
  else if (ex.ambiguousMatch && !ex.matchConfirmed) w('warn', 'ambiguous-match', `"${ex.name}" could be several library exercises (best guess: ${ex.matchedExercise}). Confirm which one.`);
  else if (ex.matchedExercise && ex.matchConfidence < MATCH_AUTO && !ex.matchConfirmed && !ex.customConfirmed) w('info', 'fuzzy-match', `"${ex.name}" looks like ${ex.matchedExercise}. Confirm to use the library name.`);
  const groupLike = block.blockType === 'superset' || block.blockType === 'circuit' || block.blockType === 'finisher';
  const setsOptional = groupLike && (block.rounds !== null || block.durationSec !== null);
  const noTarget = ex.repLow === null && ex.seconds === null;
  if (ex.repsRaw) w('warn', 'ambiguous-target', `"${ex.name}": the rep target "${ex.repsRaw}" is unclear.`);
  else if (ex.toFailure && noTarget) w('warn', 'ambiguous-target', `"${ex.name}": "to failure" is not a rep target. Add a number if you want one.`);
  else if ((ex.sets === null && !setsOptional && !ex.cardio) || (noTarget && !ex.toFailure && !(ex.cardio && block.durationSec))) {
    w('warn', 'ambiguous-target', `"${ex.name}": sets or reps are missing.`);
  }
  if (ex.ambiguousAt) w('warn', 'ambiguous-target', `"${ex.name}": "@${ex.ambiguousAt}" could be a weight or an RPE. Spell it out.`);
  if (ex.load !== null && !ex.unit) w('warn', 'missing-unit', `"${ex.name}": a weight of ${ex.load} has no unit (lb or kg).`);
  if (ex.restRaw && ex.restSec === null) w('warn', 'rest-unit-missing', `"${ex.name}": rest "${ex.restRaw}" has no unit (seconds or minutes).`);
  if (ex.percent1RM !== null && !parsed.stated1RM) w('error', 'percent-1rm-no-1rm', `"${ex.name}": ${ex.percent1RM}% of 1RM needs a stated 1RM, which this plan does not give. Enter a weight instead.`);
  if (ex.cardio && ex.seconds === null && block.durationSec === null && ex.repLow === null) w('warn', 'cardio-no-duration', `"${ex.name}" is cardio without a duration.`);
  if ((ex.sets !== null && (ex.sets < 1 || ex.sets > 20)) || (ex.repHigh !== null && ex.repHigh > 100) || (ex.restSec !== null && ex.restSec > 1200)
    || (ex.rpe !== null && (ex.rpe < 1 || ex.rpe > 10)) || (ex.rir !== null && (ex.rir < 0 || ex.rir > 10))) {
    w('warn', 'implausible', `"${ex.name}" has a value outside the usual range. Check the numbers.`);
  }
}

export function computeWarnings(parsed) {
  const out = [...(parsed.notices || [])];
  const dowSeen = new Map();
  parsed.days.forEach((d, di) => {
    const dref = { day: di };
    if (d.dow === null || d.dow === undefined) out.push(mk('warn', 'day-unmapped', `"${d.dayLabel}" is not tied to a weekday. Pick one or it will be left out.`, dref));
    else if (dowSeen.has(d.dow)) out.push(mk('warn', 'duplicate-day', `${DAY_NAMES[d.dow]} appears more than once ("${dowSeen.get(d.dow)}" and "${d.dayLabel}").`, dref));
    else dowSeen.set(d.dow, d.dayLabel);
    if (!d.blocks.length && !d.restDay) out.push(mk('warn', 'empty-day', `"${d.dayLabel}" has no exercises.`, dref));
    d.blocks.forEach((b, bi) => b.exercises.forEach((ex, ei) => exerciseWarnings(ex, b, parsed, { day: di, block: bi, exercise: ei }, out)));
  });
  return out;
}

function deriveUnsupported(parsed, warnings) {
  const out = warnings.filter((w) => ['percent-1rm-no-1rm', 'cardio-no-duration'].includes(w.code)).map((w) => ({ code: w.code, ref: w.ref, text: w.message }));
  (parsed.notices || []).filter((w) => w.code === 'unparsed-line' || w.code === 'instruction-like-text').forEach((w) => out.push({ code: w.code, ref: w.ref, text: w.ref && w.ref.text ? w.ref.text : w.message }));
  return out;
}

function finalize(parsed) {
  parsed.warnings = computeWarnings(parsed);
  parsed.unsupported = deriveUnsupported(parsed, parsed.warnings);
  const ex = parsed.days.reduce((n, d) => n + d.blocks.reduce((m, b) => m + b.exercises.length, 0), 0);
  parsed.history = {
    ...parsed.history,
    dayCount: parsed.days.length, exerciseCount: ex, warningCount: parsed.warnings.length,
  };
  return parsed;
}

// ------------------------------------------------------------------- entry
// input: { kind:'csv'|'json'|'text'|'manual', content }
// meta (injected so parsing stays pure): { sourceSha256, parsedAt, fileName }
export function parsePlanInput(input = {}, meta = {}) {
  const kind = ['csv', 'json', 'text', 'manual'].includes(input.kind) ? input.kind : null;
  const ctx = { days: [], notices: [], errors: [], progression: [], notes: [], planName: null };
  const history = {
    kind, sourceSha256: input.sourceSha256 ?? meta.sourceSha256 ?? null, parsedAt: input.parsedAt ?? meta.parsedAt ?? null,
    fileName: meta.fileName ?? input.fileName ?? null,
  };
  let content = typeof input.content === 'string' ? input.content : '';
  if (!kind) ctx.errors.push({ code: 'unknown-kind', message: 'Unsupported plan type.' });
  else if (typeof input.content !== 'string' || !content.trim()) ctx.errors.push({ code: 'empty', message: 'There is nothing to read.' });
  else if (content.length > PLAN_LIMITS.maxChars) ctx.errors.push({ code: 'too-large', message: 'The plan text is too large.' });
  content = content.replace(/^﻿/, '');
  const parsed = {
    ok: false, kind, days: [], progression: [], warnings: [], unsupported: [], notices: ctx.notices, notes: ctx.notes,
    errors: ctx.errors, stated1RM: /\b1\s*-?\s*RM\b[^\n]{0,25}\d|\bone[- ]rep max\b[^\n]{0,25}\d/i.test(content), planName: null, history,
  };
  if (!ctx.errors.length) {
    try {
      if (kind === 'csv') parseCsvPlan(content, ctx);
      else if (kind === 'json') parseJsonPlan(content, ctx);
      else parseTextPlan(content, ctx);
    } catch {
      ctx.errors.push({ code: 'parse-failed', message: 'The plan could not be read.' });
    }
  }
  if (ctx.days.length > PLAN_LIMITS.maxDays) {
    ctx.notices.push(mk('warn', 'too-many-days', `Only the first ${PLAN_LIMITS.maxDays} days were kept.`));
    ctx.days.length = PLAN_LIMITS.maxDays;
  }
  let total = 0;
  ctx.days.forEach((d) => d.blocks.forEach((b) => { total += b.exercises.length; }));
  if (total > PLAN_LIMITS.maxExercises) ctx.errors.push({ code: 'too-many-exercises', message: 'The plan has too many exercises.' });
  if (!ctx.errors.length && !ctx.days.length) ctx.errors.push({ code: 'no-days', message: 'No training days were found.' });
  parsed.days = ctx.errors.length ? [] : ctx.days;
  parsed.progression = ctx.progression;
  parsed.planName = ctx.planName;
  parsed.ok = ctx.errors.length === 0;
  return finalize(parsed);
}

// ------------------------------------------------------------- corrections
const clone = (o) => JSON.parse(JSON.stringify(o));
const EDITABLE = ['sets', 'repLow', 'repHigh', 'seconds', 'restSec', 'rpe', 'rir', 'tempo', 'note', 'unit', 'load', 'equipment'];

// ops: { op:'renameExercise', day, block, exercise, name }
//      { op:'matchExercise', day, block, exercise, to }   (confirm a library exercise)
//      { op:'keepCustom', day, block, exercise }          (confirm as custom)
//      { op:'editExercise', day, block, exercise, fields:{sets,repLow,...} }
//      { op:'setDow', day, dow } { op:'deleteDay', day } { op:'deleteBlock', day, block }
//      { op:'confirmDay', day } { op:'confirmAll' }
export function applyCorrections(parsed, corrections = []) {
  const next = clone(parsed);
  const deleted = [];
  for (const c of corrections || []) {
    if (!c || typeof c !== 'object') continue;
    const day = next.days[c.day];
    const ex = day && day.blocks[c.block] && day.blocks[c.block].exercises[c.exercise];
    switch (c.op) {
      case 'renameExercise':
        if (ex && cleanText(c.name)) {
          ex.name = cleanText(c.name, 120);
          const m = matchExerciseName(ex.name);
          Object.assign(ex, { matchedExercise: m.matched, matchConfidence: m.confidence, ambiguousMatch: m.ambiguous, matchConfirmed: false, customConfirmed: false });
          if (m.matched && !ex.equipment) ex.equipment = EXERCISES[m.matched].eq;
          ex.cardio = CARDIO_RE.test(ex.name);
        }
        break;
      case 'matchExercise':
        if (ex && Object.prototype.hasOwnProperty.call(EXERCISES, c.to)) {
          Object.assign(ex, { matchedExercise: c.to, matchConfidence: 1, ambiguousMatch: false, matchConfirmed: true, equipment: EXERCISES[c.to].eq });
        }
        break;
      case 'keepCustom':
        if (ex) ex.customConfirmed = true;
        break;
      case 'editExercise':
        if (ex && c.fields && typeof c.fields === 'object') {
          Object.keys(c.fields).forEach((k) => {
            if (!EDITABLE.includes(k)) return;
            const v = c.fields[k];
            if (['sets', 'repLow', 'repHigh', 'seconds', 'restSec', 'rpe', 'rir', 'load'].includes(k)) ex[k] = v === '' || v === null ? null : toNum(v);
            else ex[k] = cleanText(v, 300);
          });
          const f = c.fields;
          if (f.repLow !== undefined || f.repHigh !== undefined) { ex.repsRaw = null; if (ex.repLow !== null) ex.toFailure = false; }
          if (f.restSec !== undefined && ex.restSec !== null) ex.restRaw = null;
          if (f.load !== undefined || f.unit !== undefined) { ex.percent1RM = f.load !== undefined && ex.load !== null ? null : ex.percent1RM; ex.ambiguousAt = f.load !== undefined && ex.load !== null ? null : ex.ambiguousAt; }
          if (f.rpe !== undefined && ex.rpe !== null) ex.ambiguousAt = null;
        }
        break;
      case 'setDow':
        if (day && (c.dow === null || (Number.isInteger(c.dow) && c.dow >= 0 && c.dow <= 6))) day.dow = c.dow;
        break;
      case 'deleteDay':
        if (day) { deleted.push(c.day); day.deleted = true; }
        break;
      case 'deleteBlock':
        if (day && day.blocks[c.block]) day.blocks[c.block].deleted = true;
        break;
      case 'confirmDay':
        if (day) day.confirmed = true;
        break;
      case 'confirmAll':
        next.days.forEach((d) => { d.confirmed = true; });
        break;
      default: break;
    }
  }
  next.days = next.days.filter((d) => !d.deleted);
  next.days.forEach((d) => { d.blocks = d.blocks.filter((b) => !b.deleted); });
  return finalize(next);
}

// ---------------------------------------------------------------- program
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'day';
const num0 = (n) => (typeof n === 'number' ? n : 0);

function exerciseName(ex) {
  if (ex.matchedExercise && (ex.matchConfirmed || ex.matchConfidence >= MATCH_AUTO)) return ex.matchedExercise;
  return ex.name; // never silently replaced
}
function extras(ex, o) {
  if (ex.seconds !== null) o.seconds = ex.seconds;
  if (ex.rir !== null) o.rir = ex.rir;
  if (ex.equipment) o.equipment = ex.equipment;
  if (ex.load !== null && ex.unit) { o.load = ex.load; o.unit = ex.unit; }
  if (ex.toFailure) o.toFailure = true;
  return o;
}
function toBlock(b) {
  const es = b.exercises;
  const first = es[0];
  const note = es.length === 1 ? first.note : es.map((e) => e.note).filter(Boolean).join('; ');
  if (b.blockType === 'superset' || b.blockType === 'circuit') {
    const members = es.map((e) => extras(e, { name: exerciseName(e), repLow: num0(e.repLow), repHigh: num0(e.repHigh), rpe: e.rpe, tempo: e.tempo }));
    const fn = b.blockType === 'superset' ? superset : circuit;
    return fn(b.name, b.rounds, b.restAfterRoundSec ?? (es[0] && es[0].restSec) ?? null, members, note);
  }
  if (b.blockType === 'finisher') {
    const members = es.map((e) => extras(e, { name: exerciseName(e), repLow: num0(e.repLow), repHigh: num0(e.repHigh), rpe: e.rpe, tempo: e.tempo }));
    return finisher(b.name, { rounds: b.rounds, restAfterRoundSec: b.restAfterRoundSec, durationSec: b.durationSec }, members, note);
  }
  const name = exerciseName(first);
  const build = b.blockType === 'dropset'
    ? dropset(name, num0(first.sets), num0(first.repLow), num0(first.repHigh), first.rpe, first.restSec, first.tempo, b.drops ?? first.drops ?? null, first.note)
    : single(name, num0(first.sets), num0(first.repLow), num0(first.repHigh), first.rpe, first.restSec, first.tempo, first.note);
  extras(first, build.exercises[0]);
  return build;
}

// Only CONFIRMED days with a weekday become training days; everything else is
// rest. What was left out is listed in program.source.skipped.
// Text that reads like an instruction stays on the review screen only; it is
// never stored in a program.
const safeNotes = (notes) => (notes || []).filter((n) => !INSTRUCTION_LIKE.test(String(n))).join(' ');

export function toProgram(parsed, { name, importedAt } = {}) {
  const days = {};
  const skipped = [];
  for (let i = 0; i < 7; i += 1) days[i] = { ...REST_DAY, key: `rest${i}`, blocks: [], conditioning: [], mobility: [], sport: [] };
  const used = new Set();
  (parsed.days || []).forEach((d) => {
    if (!d.confirmed) { skipped.push({ day: d.dayLabel, reason: 'not-confirmed' }); return; }
    if (d.dow === null || d.dow === undefined) { skipped.push({ day: d.dayLabel, reason: 'no-weekday' }); return; }
    if (used.has(d.dow)) { skipped.push({ day: d.dayLabel, reason: 'duplicate-weekday' }); return; }
    used.add(d.dow);
    if (d.restDay || !d.blocks.length) {
      days[d.dow] = { ...days[d.dow], title: d.title || 'Rest', notes: safeNotes(d.notes) };
      return;
    }
    days[d.dow] = {
      key: `${slug(d.title || d.dayLabel)}-${d.dow}`,
      title: d.title || d.dayLabel,
      focus: 'Imported',
      dayType: 'training',
      intensity: 'Moderate',
      blocks: d.blocks.map(toBlock),
      conditioning: [], mobility: [], sport: [],
      notes: safeNotes(d.notes),
    };
  });
  return {
    name: cleanText(name || parsed.planName || 'Imported Program', 80),
    rationale: 'Imported from an uploaded plan and reviewed before use. Targets are exactly what the file said; anything it left out is left blank, not guessed.',
    days,
    source: {
      kind: 'import', importKind: parsed.kind || null, sourceSha256: (parsed.history && parsed.history.sourceSha256) || null,
      importedAt: importedAt || (parsed.history && parsed.history.parsedAt) || null, skipped,
      progression: (parsed.progression || []).map((p) => p.text),
    },
  };
}
