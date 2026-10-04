// ============================================================
// imports/scanParser.js - body-composition scan text -> a REVIEWABLE record.
//
// README
//  * Scan values are ESTIMATES from a device (bioimpedance / DXA-like); they vary
//    with hydration, time of day and the machine. Never prescribe training,
//    calories or medical conclusions from a scan alone.
//  * This module never guesses. A value that is missing stays missing, a unit
//    is kept exactly as printed (lb / kg / % / in / cm / kcal), an ambiguous
//    date is flagged rather than resolved, and an implausible number is kept
//    but marked confidence 'low' with flag 'implausible'. Nothing is saved
//    until a person has reviewed it (source.reviewedAt starts null).
//  * Lean Body Mass and Fat Free Mass are different measurements and keep
//    different keys (leanMass / fatFreeMass). Visceral Fat Level (an index) and
//    Visceral Fat Area (cm2) are different measurements and are never merged.
//  * All input text is untrusted DATA; it is only ever matched against fixed
//    patterns.
// ============================================================

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const clean = (s) => String(s == null ? '' : s).replace(CONTROL, '').replace(/[ \t ]+/g, ' ').trim();

// Order matters: most specific first.
const LABELS = [
  { key: 'scanDate', re: /^(?:scan(?:ned)?|test|measurement|report|exam)\s+(?:date|on)|^date\s+of\s+(?:scan|test|measurement)|^date\b(?!\s+of\s+birth)/i },
  { key: 'visceralFatLevel', re: /^visceral\s+fat\s+(?:level|lvl|rating|index)/i },
  { key: 'visceralFatArea', re: /^visceral\s+fat\s+area/i },
  { key: 'visceralFat?', re: /^visceral\s+fat/i },
  { key: 'subcutFat', re: /^subcutaneous\s+fat(?:\s+mass)?/i },
  { key: 'fatFreeMass', re: /^(?:fat[\s-]*free\s+mass|ffm)/i },
  { key: 'leanMass', re: /^(?:lean\s+(?:body\s+)?mass|lbm)/i },
  { key: 'skeletalMuscle', re: /^(?:skeletal\s+muscle(?:\s+mass)?|smm)/i },
  { key: 'fatMass', re: /^(?:body\s+fat\s+mass|fat\s+mass)/i },
  { key: 'bodyFatPct', re: /^(?:body\s+fat\s*(?:percentage|percent|%)|percent\s+body\s+fat|bf\s*%|body\s+fat)/i },
  { key: 'bodyWater', re: /^(?:total\s+body\s+water|body\s+water|tbw)/i },
  { key: 'protein', re: /^protein(?:\s+mass)?/i },
  { key: 'mineral', re: /^minerals?(?:\s+mass)?/i },
  { key: 'waistHip', re: /^(?:waist[\s-]*(?:to[\s-]*)?hip(?:\s+ratio)?|whr)/i },
  { key: 'waist', re: /^waist(?:\s+circumference)?/i },
  { key: 'bmr', re: /^(?:basal\s+metabolic\s+rate|bmr)/i },
  { key: 'tee', re: /^(?:total\s+energy\s+expenditure|tdee|tee)/i },
  { key: 'bioAge', re: /^(?:bio(?:logical)?[\s-]*age|body\s+age)/i },
  { key: 'weight', re: /^(?:body\s+)?weight/i },
];

const MASS = ['weight', 'fatMass', 'leanMass', 'fatFreeMass', 'skeletalMuscle', 'bodyWater', 'protein', 'mineral', 'subcutFat'];

// Allowed units per field ('' = a bare number is the normal print).
const UNITS = {
  weight: ['lb', 'kg'], fatMass: ['lb', 'kg'], leanMass: ['lb', 'kg'], fatFreeMass: ['lb', 'kg'],
  skeletalMuscle: ['lb', 'kg'], bodyWater: ['lb', 'kg', 'L'], protein: ['lb', 'kg'], mineral: ['lb', 'kg'],
  subcutFat: ['lb', 'kg'], bodyFatPct: ['%'], visceralFatLevel: [''], visceralFatArea: ['cm2'],
  waist: ['in', 'cm'], waistHip: [''], bmr: ['kcal'], tee: ['kcal'], bioAge: ['yr', ''],
};
// Units that may be implied by the label when the print dropped them.
const IMPLIED = { bodyFatPct: '%', bmr: 'kcal', tee: 'kcal', visceralFatArea: 'cm2' };

// Plausible ranges, in the unit as printed.
const RANGES = {
  weight: { lb: [60, 600], kg: [30, 270] },
  fatMass: { lb: [3, 400], kg: [1.5, 180] },
  leanMass: { lb: [40, 300], kg: [20, 140] },
  fatFreeMass: { lb: [40, 300], kg: [20, 140] },
  skeletalMuscle: { lb: [20, 150], kg: [10, 70] },
  bodyWater: { lb: [30, 250], kg: [15, 115], L: [15, 115] },
  protein: { lb: [8, 60], kg: [4, 30] },
  mineral: { lb: [2, 25], kg: [1, 12] },
  subcutFat: { lb: [2, 250], kg: [1, 110] },
  bodyFatPct: { '%': [2, 65] },
  visceralFatLevel: { '': [1, 30] },
  visceralFatArea: { cm2: [5, 500] },
  waist: { in: [18, 80], cm: [45, 200] },
  waistHip: { '': [0.5, 1.5] },
  bmr: { kcal: [800, 4500] },
  tee: { kcal: [1000, 8000] },
  bioAge: { yr: [10, 110], '': [10, 110] },
};

const UNIT_RE = /^\s*(?:(lbs?\.?|pounds?)|([I1l]bs?\b)|(kgs?\.?|kilograms?)|(%)|(inch(?:es)?|in\b|")|(cm\s*[2²]|cm\^2)|(cm\b)|(kcal|calories|cal\b)|(years?|yrs?\b|yr\b)|(liters?|litres?|l\b))/i;

function readUnit(rest) {
  const m = UNIT_RE.exec(rest);
  if (!m) return null;
  const idx = m.findIndex((g, i) => i > 0 && g !== undefined);
  const canon = ['', 'lb', 'lb', 'kg', '%', 'in', 'cm2', 'cm', 'kcal', 'yr', 'L'][idx];
  return { unit: canon, ocr: idx === 2, length: m[0].length };
}

// '18,4' -> 18.4 (flag), '1,856' -> 1856 (flag), 'l8.4' -> 18.4 (flag)
export function parseNumberToken(tok) {
  const flags = [];
  let t = tok;
  if (/[OoIl]/.test(t)) {
    t = t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
    flags.push('ocr-substitution');
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
    t = t.replace(/,/g, '');
    flags.push('comma-thousands');
  } else if (/^\d+,\d{1,2}$/.test(t)) {
    t = t.replace(',', '.');
    flags.push('comma-decimal');
  } else if (/,/.test(t)) {
    return { value: null, flags: ['malformed-number'] };
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return { value: null, flags: ['malformed-number'] };
  return { value: Number(t), flags };
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const validYmd = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// -> { value: 'YYYY-MM-DD'|null, candidates:[iso], flags:[] }
export function parseScanDate(rawIn) {
  const flags = [];
  let raw = clean(rawIn);
  const fixed = raw.replace(/^[Oo](?=\d)|(?<=\d)[Oo](?=\d|[/\-.])|(?<=[/\-. ])[Oo](?=\d)/g, '0');
  if (fixed !== raw) { flags.push('ocr-substitution'); raw = fixed; }
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(raw);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return validYmd(y, mo, d) ? { value: iso(y, mo, d), candidates: [iso(y, mo, d)], flags } : { value: null, candidates: [], flags: [...flags, 'invalid-date'] };
  }
  m = /(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})/.exec(raw);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    const [d, mo, y] = [+m[1], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[3]];
    return validYmd(y, mo, d) ? { value: iso(y, mo, d), candidates: [iso(y, mo, d)], flags } : { value: null, candidates: [], flags: [...flags, 'invalid-date'] };
  }
  m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(raw);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    const [mo, d, y] = [MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], +m[3]];
    return validYmd(y, mo, d) ? { value: iso(y, mo, d), candidates: [iso(y, mo, d)], flags } : { value: null, candidates: [], flags: [...flags, 'invalid-date'] };
  }
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(raw);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let y = +m[3];
    if (m[3].length === 2) { y += 2000; flags.push('two-digit-year'); }
    const dmy = validYmd(y, b, a) ? iso(y, b, a) : null; // a = day, b = month
    const mdy = validYmd(y, a, b) ? iso(y, a, b) : null; // a = month, b = day
    const cands = [...new Set([dmy, mdy].filter(Boolean))];
    if (cands.length === 1) return { value: cands[0], candidates: cands, flags };
    if (cands.length === 2) return { value: null, candidates: cands, flags: [...flags, 'ambiguous-date'] };
    return { value: null, candidates: [], flags: [...flags, 'invalid-date'] };
  }
  return { value: null, candidates: [], flags: ['unrecognised-date'] };
}

function rateConfidence(flags) {
  if (flags.some((f) => ['implausible', 'unit-missing', 'unit-unexpected', 'ambiguous-date', 'invalid-date', 'unrecognised-date', 'malformed-number', 'two-digit-year'].includes(f))) return 'low';
  if (flags.length) return 'medium';
  return 'high';
}

const toLines = (input) => {
  const arr = Array.isArray(input) ? input : String(input == null ? '' : input).split(/\r\n|\r|\n/);
  return arr.map((l) => (typeof l === 'string' ? l : (l && l.text) || '')).map(clean).filter(Boolean);
};

export function parseScanText(input, { today } = {}) {
  const lines = toLines(input);
  const fields = {};
  const unmapped = [];
  const warnings = [];
  const note = (code, message, extra = {}) => warnings.push({ code, message, ...extra });

  lines.forEach((line) => {
    const entry = LABELS.find((e) => e.re.test(line));
    if (!entry) {
      // "Label  12.3 unit" lines we do not know are surfaced, never dropped silently.
      const um = /^([A-Za-z][A-Za-z %/().-]{2,40}?)\s*[:|]?\s+([0-9][0-9.,]*)\s*([A-Za-z%²0-9]{0,5})\b/.exec(line);
      if (um) unmapped.push({ label: um[1].trim(), value: um[2], unit: um[3] || null, sourceLine: line });
      return;
    }
    const labelMatch = entry.re.exec(line);
    const label = labelMatch[0];
    let rest = line.slice(label.length);
    // A label glued to more letters ("Weightless", "Datelines") is not this label.
    if (/^[A-Za-z]/.test(rest)) { unmapped.push({ label: line.split(/\s+\d/)[0], value: null, unit: null, sourceLine: line }); return; }
    rest = rest.replace(/^[\s:.=|]+/, '');

    if (entry.key === 'scanDate') {
      const d = parseScanDate(rest);
      if (d.value === null && !d.candidates.length && d.flags.includes('unrecognised-date')) return;
      if (fields.scanDate) return;
      const flags = [...d.flags];
      const t = today || null;
      if (d.value && t && d.value > t) flags.push('implausible');
      fields.scanDate = { value: d.value, label, sourceLine: line, raw: rest, candidates: d.candidates, flags, confidence: rateConfidence(flags) };
      if (d.flags.includes('ambiguous-date')) note('ambiguous-date', `The date "${rest}" could be read two ways (${d.candidates.join(' or ')}). Pick the right one.`, { field: 'scanDate' });
      return;
    }

    const numM = /^([0-9OoIl][0-9OoIl.,]*)/.exec(rest);
    const token = numM && /\d/.test(numM[1]) ? numM[1].replace(/[.,]+$/, '') : null;
    if (!token) { unmapped.push({ label: line.split(/\s+[0-9+-]/)[0].trim(), value: (/([0-9][0-9.,]*)/.exec(rest) || [])[1] || null, unit: null, sourceLine: line }); return; }
    const after = rest.slice(numM[1].length);
    if (/^[A-Za-z]/.test(after) && !readUnit(after)) { unmapped.push({ label: label.trim(), value: token, unit: null, sourceLine: line }); return; }
    const num = parseNumberToken(token);
    if (num.value === null) { unmapped.push({ label: label.trim(), value: token, unit: null, sourceLine: line }); return; }
    const u = readUnit(after);
    let unit = u ? u.unit : null;
    const flags = [...num.flags];
    if (u && u.ocr) flags.push('ocr-substitution');

    let key = entry.key;
    if (key === 'visceralFat?') {
      if (unit === 'cm2') key = 'visceralFatArea';
      else {
        unmapped.push({ label: label.trim(), value: token, unit, sourceLine: line });
        note('ambiguous-visceral', 'A "Visceral Fat" value was found without saying whether it is the level or the area. It was not used.', { sourceLine: line });
        return;
      }
    }
    const allowed = UNITS[key];
    if (unit === null) {
      if (IMPLIED[key]) { unit = IMPLIED[key]; flags.push('unit-from-label'); }
      else if (allowed.includes('')) unit = '';
      else { flags.push('unit-missing'); }
    } else if (!allowed.includes(unit)) {
      flags.push('unit-unexpected');
    }
    const range = RANGES[key] && RANGES[key][unit === null ? '' : unit];
    if (range && (num.value < range[0] || num.value > range[1])) flags.push('implausible');
    else if (!range && unit !== null && RANGES[key]) flags.push('unit-unexpected');

    const field = { value: num.value, unit, label: label.trim(), sourceLine: line, flags: [...new Set(flags)] };
    field.confidence = rateConfidence(field.flags);
    if (fields[key]) {
      if (fields[key].value !== field.value || fields[key].unit !== field.unit) {
        note('duplicate-label', `"${label.trim()}" appears more than once with different values; the first was kept.`, { field: key });
        unmapped.push({ label: label.trim(), value: token, unit, sourceLine: line });
      }
      return;
    }
    fields[key] = field;
  });

  const mapped = Object.keys(fields).filter((k) => k !== 'scanDate');
  const evolt = mapped.length >= 4 && ['weight', 'bodyFatPct', 'leanMass', 'skeletalMuscle'].some((k) => fields[k]);
  if (!evolt) {
    note('unsupported-layout', mapped.length
      ? 'Only a few scan values were recognised, so this does not look like a supported scan report. Check every value or enter them by hand.'
      : 'No scan values were recognised in this file. Nothing was filled in.');
  }
  mapped.forEach((k) => {
    if (fields[k].confidence === 'low') note('low-confidence', `${fields[k].label || k}: please check this value.`, { field: k, flags: fields[k].flags });
  });
  return { fields, unmapped, warnings, layout: evolt ? 'evolt-like' : 'unknown', lineCount: lines.length };
}

// ---- unit handling (never assumed; always from the unit as printed) ------
const KG_TO_LB = 2.20462;
const round1 = (n) => Math.round(n * 10) / 10;

// -> { [key]: { value, unit, converted, original:{value,unit}, unitKnown } }
export function normalizeScanFields(fields, userUnits = 'imperial') {
  const metric = userUnits === 'metric';
  const out = {};
  Object.entries(fields || {}).forEach(([key, f]) => {
    if (key === 'scanDate' || !f || typeof f.value !== 'number') return;
    const original = { value: f.value, unit: f.unit };
    let { value, unit } = f;
    let converted = false;
    if (MASS.includes(key) && unit === 'kg' && !metric) { value = round1(value * KG_TO_LB); unit = 'lb'; converted = true; }
    else if (MASS.includes(key) && unit === 'lb' && metric) { value = round1(value / KG_TO_LB); unit = 'kg'; converted = true; }
    else if (key === 'waist' && unit === 'cm' && !metric) { value = round1(value / 2.54); unit = 'in'; converted = true; }
    else if (key === 'waist' && unit === 'in' && metric) { value = round1(value * 2.54); unit = 'cm'; converted = true; }
    out[key] = { value, unit, converted, original, unitKnown: unit !== null };
  });
  return out;
}

const RECORD_KEYS = ['weight', 'bodyFatPct', 'fatMass', 'leanMass', 'skeletalMuscle', 'protein', 'mineral', 'bodyWater', 'subcutFat', 'visceralFatLevel', 'visceralFatArea', 'waist', 'waistHip', 'bmr', 'tee', 'bioAge'];

// -> { record, needsReview:[field names] }.  The app stores weights in lb and
// waist in in; set userUnits:'metric' to keep kg/cm instead.
export function toScanRecord(fields, opts = {}) {
  const { userUnits = 'imperial', fileSha256 = null, fileName = null, extractionMethod = null, id, now } = opts;
  const norm = normalizeScanFields(fields, userUnits);
  const record = { id: id || `scan-${now || Date.now()}`, date: '' };
  const needsReview = [];
  const labels = {};
  const unitsAsPrinted = {};
  const rawValues = {};
  const extras = {};
  const flagsByField = {};

  const sd = fields && fields.scanDate;
  if (sd && sd.value && sd.confidence !== 'low') record.date = sd.value;
  else needsReview.push('date');
  if (sd) { labels.scanDate = sd.label; flagsByField.scanDate = sd.flags; }

  RECORD_KEYS.concat(['fatFreeMass']).forEach((key) => {
    const f = fields && fields[key];
    const n = norm[key];
    if (!f || !n) return;
    labels[key] = f.label;
    unitsAsPrinted[key] = f.unit;
    flagsByField[key] = f.flags;
    const unitOk = n.unit !== null && !f.flags.includes('unit-unexpected') && !(key === 'bodyWater' && n.unit === 'L');
    if (!unitOk) {
      rawValues[key] = f.value;
      needsReview.push(key);
      return;
    }
    if (key === 'fatFreeMass') { extras.fatFreeMass = { value: n.value, unit: n.unit }; if (f.confidence === 'low') needsReview.push(key); return; }
    record[key] = n.value;
    if (f.confidence === 'low' || f.confidence === 'medium') needsReview.push(key);
  });
  if (record.weight === undefined && !needsReview.includes('weight')) needsReview.push('weight');
  record.source = {
    kind: 'upload', fileSha256, fileName, labels, unitsAsPrinted, extractionMethod, reviewedAt: null,
    ...(sd && sd.candidates && sd.candidates.length > 1 ? { dateCandidates: sd.candidates } : {}),
    ...(Object.keys(rawValues).length ? { rawValues } : {}),
    ...(Object.keys(extras).length ? { extras } : {}),
    flags: flagsByField,
    needsReview: [...new Set(needsReview)],
  };
  return { record, needsReview: [...new Set(needsReview)] };
}

// Same file (sha256) or the same date + weight + body-fat within tolerance.
export function findDuplicateScan(record, existingScans, fileSha256) {
  const sha = fileSha256 || (record && record.source && record.source.fileSha256);
  const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
  for (const s of existingScans || []) {
    if (!s) continue;
    if (sha && s.source && s.source.fileSha256 === sha) return { duplicate: true, reason: 'same-file', scan: s };
  }
  for (const s of existingScans || []) {
    if (!s || !record.date || s.date !== record.date) continue;
    const bfOk = (record.bodyFatPct === undefined && s.bodyFatPct === undefined) || near(record.bodyFatPct, s.bodyFatPct, 0.2);
    if (near(record.weight, s.weight, 0.3) && bfOk) return { duplicate: true, reason: 'same-values', scan: s };
  }
  return null;
}
