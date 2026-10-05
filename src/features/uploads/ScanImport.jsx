// ============================================================
// ScanImport - upload a body-scan report, REVIEW every value, then save.
//
// Props:
//   state    app state (reads state.bodyScans for duplicate detection)
//   extract  injectable extractor (default extractText inside FileDrop)
//   onSave(record, { file, fileSha256 })
//   onCancel()
//   units    'imperial' | 'metric'  (record units; default imperial)
//   now      () => ISO string | ISO string  (injected for tests)
//
// Scan values are estimates and are never used to prescribe training alone.
// Nothing is invented: a value the file did not give stays empty until typed.
// ============================================================
import React, { useMemo, useState } from 'react';
import { Check, AlertTriangle, Info, Save, Trash2, PenLine } from 'lucide-react';
import { Card, Chip, Banner, SectionTitle } from '../../components.jsx';
import FileDrop from './FileDrop.jsx';
import { parseScanText, toScanRecord, findDuplicateScan } from '../../imports/scanParser.js';
import './uploads.css';

const NAMES = {
  weight: 'Weight', bodyFatPct: 'Body fat %', fatMass: 'Fat mass', leanMass: 'Lean body mass', fatFreeMass: 'Fat free mass',
  skeletalMuscle: 'Skeletal muscle mass', bodyWater: 'Body water', protein: 'Protein', mineral: 'Mineral', subcutFat: 'Subcutaneous fat',
  visceralFatLevel: 'Visceral fat level', visceralFatArea: 'Visceral fat area', waist: 'Waist', waistHip: 'Waist-hip ratio',
  bmr: 'Basal metabolic rate', tee: 'Total energy expenditure', bioAge: 'Biological age',
};
const ORDER = Object.keys(NAMES);
const UNIT_OPTIONS = {
  weight: ['lb', 'kg'], fatMass: ['lb', 'kg'], leanMass: ['lb', 'kg'], fatFreeMass: ['lb', 'kg'], skeletalMuscle: ['lb', 'kg'],
  bodyWater: ['lb', 'kg', 'L'], protein: ['lb', 'kg'], mineral: ['lb', 'kg'], subcutFat: ['lb', 'kg'], bodyFatPct: ['%'],
  visceralFatLevel: [''], visceralFatArea: ['cm2'], waist: ['in', 'cm'], waistHip: [''], bmr: ['kcal'], tee: ['kcal'], bioAge: ['yr'],
};
const unitLabel = (u) => (u === '' ? 'no unit (an index)' : u === 'cm2' ? 'cm2' : u);

const FLAG_TEXT = {
  implausible: 'This number is outside the usual range for this measurement. Check it against your report.',
  'unit-missing': 'No unit was printed. Choose the unit.',
  'unit-unexpected': 'The unit does not look right for this measurement. Choose the correct one.',
  'ocr-substitution': 'Some characters were read from an image and may be wrong. Check against your report.',
  'comma-thousands': 'A comma was read as a thousands separator.',
  'comma-decimal': 'A comma was read as a decimal point.',
  'malformed-number': 'The number could not be read cleanly.',
  'two-digit-year': 'The year had two digits and was read as 20xx.',
  'ambiguous-date': 'The date can be read two ways. Pick the right one.',
  'invalid-date': 'That date is not a real calendar date.',
  'unrecognised-date': 'The date could not be read.',
  'unit-from-label': 'The unit was not printed; it was taken from the label.',
};
const CONF = {
  high: { tone: 'green', text: 'High confidence', Icon: Check },
  medium: { tone: 'amber', text: 'Medium confidence', Icon: Info },
  low: { tone: 'red', text: 'Low confidence', Icon: AlertTriangle },
};

const isIsoDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 1990;
};
const num = (s) => {
  if (s === '' || s === null || s === undefined) return null;
  const n = Number(String(s).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

function ConfChip({ level }) {
  const c = CONF[level] || CONF.low;
  return <Chip tone={c.tone}><span className="up-chip"><c.Icon size={12} aria-hidden="true" />{c.text}</span></Chip>;
}

export default function ScanImport({ state, extract, onSave, onCancel, units = 'imperial', now }) {
  const nowIso = () => (typeof now === 'function' ? now() : now) || new Date().toISOString();
  const [stage, setStage] = useState('upload'); // upload | problem | review
  const [loaded, setLoaded] = useState(null); // { file, fileSha256, extraction, parsed }
  const [problem, setProblem] = useState(null);
  const [manual, setManual] = useState(false);
  const [edits, setEdits] = useState({}); // key -> { value, unit, confirmed }
  const [added, setAdded] = useState([]);
  const [date, setDate] = useState('');
  const [dateTouched, setDateTouched] = useState(false);

  const onResult = (res) => {
    const { extraction } = res;
    const lines = extraction.lines || [];
    if (extraction.method === 'none' || !lines.length) {
      const pdf = res.check && res.check.kind === 'pdf';
      setProblem({ kind: 'no-text', pdf, warnings: extraction.warnings || [] });
      setLoaded({ ...res, parsed: null });
      setStage('problem');
      return;
    }
    const parsed = parseScanText(lines, { today: nowIso().slice(0, 10) });
    setLoaded({ ...res, parsed });
    const recognised = Object.keys(parsed.fields).filter((k) => k !== 'scanDate').length;
    if (parsed.layout !== 'evolt-like') {
      setProblem({ kind: 'layout', recognised, warnings: extraction.warnings || [] });
      setStage('problem');
      return;
    }
    startReview(parsed, false);
  };

  const startReview = (parsed, isManual) => {
    setManual(isManual);
    setEdits({});
    setAdded([]);
    const sd = parsed && parsed.fields.scanDate;
    setDate(sd && sd.value ? sd.value : '');
    setDateTouched(false);
    setStage('review');
  };

  const parsed = loaded && loaded.parsed;
  const keys = useMemo(() => {
    const present = parsed ? Object.keys(parsed.fields).filter((k) => k !== 'scanDate' && NAMES[k]) : [];
    if (manual) return ORDER.filter((k) => ['weight', 'bodyFatPct'].includes(k) || present.includes(k) || added.includes(k));
    return ORDER.filter((k) => present.includes(k) || added.includes(k));
  }, [parsed, manual, added]);

  // Parser-side review list (what it considers uncertain).
  const baseNeeds = useMemo(() => {
    if (!parsed) return [];
    return toScanRecord(parsed.fields, { userUnits: units, now: 0 }).needsReview.filter((k) => k !== 'date' && (k !== 'weight' || !!parsed.fields.weight));
  }, [parsed, units]);
  const dateNeedsReview = !parsed || !parsed.fields.scanDate || !parsed.fields.scanDate.value || parsed.fields.scanDate.confidence === 'low';

  const rowOf = (k) => {
    const f = parsed && parsed.fields[k];
    const e = edits[k] || {};
    const value = e.value !== undefined ? e.value : (f && typeof f.value === 'number' ? String(f.value) : '');
    const unit = e.unit !== undefined ? e.unit : (f && f.unit !== null && f.unit !== undefined ? f.unit : null);
    const needs = baseNeeds.includes(k) || (f && !UNIT_OPTIONS[k].includes(f.unit === null ? '__none' : f.unit));
    const reviewedNow = !needs || !!e.confirmed;
    return { f, value, unit, needs, confirmed: !!e.confirmed, reviewedNow };
  };
  const setEdit = (k, patch) => setEdits((cur) => ({ ...cur, [k]: { ...(cur[k] || {}), ...patch } }));

  const rows = keys.map((k) => ({ k, ...rowOf(k) }));
  const rowProblem = (r) => {
    const n = num(r.value);
    if (n === null) return 'Enter a number greater than zero.';
    const opts = UNIT_OPTIONS[r.k];
    if (r.unit === null || !opts.includes(r.unit)) return 'Choose a unit.';
    return null;
  };

  // Build the corrected fields and record.
  const built = useMemo(() => {
    const fields = {};
    keys.forEach((k) => {
      const r = rowOf(k);
      const n = num(r.value);
      const edited = edits[k] && (edits[k].value !== undefined || edits[k].unit !== undefined || edits[k].confirmed);
      if (n === null) return;
      const base = r.f || { label: `${NAMES[k]} (typed by hand)`, sourceLine: '', flags: [] };
      fields[k] = edited && r.reviewedNow
        ? { ...base, value: n, unit: r.unit, flags: [], confidence: 'high' }
        : { ...base, value: n, unit: r.unit };
    });
    if (parsed && parsed.fields.scanDate) {
      const sd = parsed.fields.scanDate;
      fields.scanDate = dateTouched || (date && sd.value !== date)
        ? { ...sd, value: isIsoDate(date) ? date : null, flags: [], confidence: 'high', candidates: [] }
        : sd;
    } else if (isIsoDate(date)) fields.scanDate = { value: date, label: 'Scan date (typed by hand)', sourceLine: '', flags: [], candidates: [], confidence: 'high' };
    const out = toScanRecord(fields, {
      userUnits: units, fileSha256: loaded ? loaded.fileSha256 : null, fileName: loaded && loaded.file ? loaded.file.name : null,
      extractionMethod: manual ? 'manual' : (loaded && loaded.extraction.method) || null, now: Date.parse(nowIso()) || 0,
    });
    if (manual) out.record.source.kind = 'manual';
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, edits, date, dateTouched, parsed, loaded, manual, units]);

  const dup = useMemo(
    () => (stage === 'review' && built.record.date ? findDuplicateScan(built.record, state && state.bodyScans, loaded && loaded.fileSha256) : null),
    [built, state, loaded, stage],
  );

  const unresolved = rows.filter((r) => r.needs && !r.confirmed);
  const badRows = rows.filter((r) => (r.value !== '' || r.needs) && rowProblem(r));
  const weightRow = rows.find((r) => r.k === 'weight');
  const weightOk = !!weightRow && !rowProblem(weightRow);
  const dateOk = isIsoDate(date) && date <= nowIso().slice(0, 10);
  const dateReviewed = !dateNeedsReview || dateTouched;
  const blockers = [];
  if (!weightOk) blockers.push('Add a valid weight.');
  if (!dateOk) blockers.push('Pick a valid scan date (not in the future).');
  else if (!dateReviewed) blockers.push('Confirm the scan date.');
  if (unresolved.length) blockers.push(`${unresolved.length} value${unresolved.length === 1 ? '' : 's'} still need your check.`);
  if (badRows.some((r) => r.k !== 'weight')) blockers.push('Fix the values marked with an error.');
  const canSave = blockers.length === 0;

  const save = () => {
    if (!canSave) return;
    const rec = built.record;
    rec.source = { ...rec.source, reviewedAt: nowIso(), needsReview: [] };
    onSave(rec, { file: loaded ? loaded.file : null, fileSha256: loaded ? loaded.fileSha256 : null });
  };

  const sdField = parsed && parsed.fields.scanDate;
  const candidates = sdField && sdField.candidates && sdField.candidates.length > 1 ? sdField.candidates : null;
  const absent = ORDER.filter((k) => !keys.includes(k));

  const estimates = (
    <Banner tone="cyan" icon={Info}>
      Scan values are estimates from a device and vary with hydration and time of day. They are never used on their own to prescribe your training.
    </Banner>
  );

  if (stage === 'upload') {
    return (
      <Card className="pad">
        <div className="block-tag"><span className="bar" />Import a body scan</div>
        <div className="hint" style={{ marginBottom: 12 }}>Upload the report as a PDF, or a screenshot or photo. You review every value before anything is saved.</div>
        {estimates}
        <FileDrop accept="scan" extract={extract} onResult={onResult} onCancel={onCancel} idPrefix="scan" />
        <div className="up-actions">
          <button type="button" className="btn ghost" onClick={() => { setLoaded(null); startReview(null, true); }}><PenLine size={14} aria-hidden="true" /> Type the values manually</button>
        </div>
      </Card>
    );
  }

  if (stage === 'problem') {
    return (
      <Card className="pad">
        <div className="block-tag"><span className="bar" />Import a body scan</div>
        {problem.kind === 'no-text' ? (
          <Banner tone="amber" icon={AlertTriangle} role="alert">
            {problem.pdf
              ? 'This PDF has no text layer (it is probably a picture of a report), so nothing could be read. Upload a screenshot or photo of the report instead, or type the values.'
              : 'No text was found in the image. Try a sharper, well-lit screenshot, or type the values.'}
          </Banner>
        ) : (
          <Banner tone="amber" icon={AlertTriangle} role="alert">
            {problem.recognised
              ? `This does not look like a supported scan report: only ${problem.recognised} value${problem.recognised === 1 ? ' was' : 's were'} recognised. You can review those or type the rest by hand.`
              : 'This does not look like a supported scan report. No scan values were recognised, so nothing was filled in.'}
          </Banner>
        )}
        {(problem.warnings || []).map((w) => <div className="hint" key={w}>{w}</div>)}
        <div className="up-actions">
          <button type="button" className="btn primary" onClick={() => { if (problem.recognised) startReview(parsed, false); else { setLoaded(null); startReview(null, true); } }}>
            <PenLine size={14} aria-hidden="true" /> {problem.recognised ? 'Review what was found' : 'Type the values manually'}
          </button>
          {problem.recognised ? <button type="button" className="btn" onClick={() => { setLoaded(null); startReview(null, true); }}>Type the values manually</button> : null}
          <button type="button" className="btn ghost" onClick={() => { setLoaded(null); setStage('upload'); }}>Try another file</button>
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </Card>
    );
  }

  // review
  return (
    <Card className="pad">
      <div className="block-tag"><span className="bar" />Review your scan</div>
      <h2 style={{ margin: '8px 0 4px', fontSize: 18 }}>{manual ? 'Enter your scan values' : 'Check every value'}</h2>
      {estimates}
      {manual ? <div className="hint">Nothing is filled in for you. Type only what your report shows.</div> : null}
      {parsed && parsed.warnings.filter((w) => w.code !== 'low-confidence' && w.code !== 'unsupported-layout').map((w) => (
        <Banner key={w.code + (w.field || w.sourceLine || '')} tone="amber" icon={AlertTriangle}>{w.message}</Banner>
      ))}
      {loaded && loaded.extraction && (loaded.extraction.warnings || []).map((w) => <div className="hint" key={w}>{w}</div>)}

      {dup ? (
        <Banner tone="amber" icon={AlertTriangle} role="alert">
          {dup.reason === 'same-file'
            ? `This exact file was already imported (scan dated ${dup.scan.date}).`
            : `A scan with the same date (${dup.scan.date}), weight and body fat already exists.`}
          {' '}Save it again as a separate scan, or discard this one.
        </Banner>
      ) : null}

      <SectionTitle>Scan date</SectionTitle>
      <div className={`up-row ${dateNeedsReview && !dateTouched ? 'needs' : 'done'}`} data-testid="row-date">
        <div>
          <div className="up-name">Date of scan</div>
          {sdField ? <div className="up-printed">Printed: {sdField.raw || sdField.label}</div> : <div className="up-printed">Not found in the file</div>}
        </div>
        <div className="field">
          <label htmlFor="scan-date">Scan date</label>
          <input id="scan-date" className="input mono" type="date" value={date} max={nowIso().slice(0, 10)}
            onChange={(e) => { setDate(e.target.value); setDateTouched(true); }} />
          {candidates ? (
            <div className="chip-row" role="group" aria-label="Possible dates">
              {candidates.map((c) => (
                <button key={c} type="button" className="btn xs" aria-pressed={date === c} onClick={() => { setDate(c); setDateTouched(true); }}>{c}</button>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          {dateNeedsReview && !dateTouched ? <Chip tone="amber"><span className="up-chip"><AlertTriangle size={12} aria-hidden="true" />Needs review</span></Chip> : <Chip tone="green"><span className="up-chip"><Check size={12} aria-hidden="true" />Date set</span></Chip>}
          <ul className="up-flags">{(sdField ? sdField.flags : []).filter((f) => FLAG_TEXT[f]).map((f) => <li key={f}>{FLAG_TEXT[f]}</li>)}</ul>
        </div>
      </div>

      <SectionTitle>Values</SectionTitle>
      <ul className="up-rows" aria-label="Scan values">
        {rows.map((r) => {
          const opts = UNIT_OPTIONS[r.k];
          const err = r.value !== '' || r.k === 'weight' ? rowProblem(r) : null;
          const flags = (r.f ? r.f.flags : []).filter((f) => FLAG_TEXT[f]);
          const resolved = r.needs && r.confirmed;
          return (
            <li key={r.k} className={`up-row ${r.needs && !r.confirmed ? 'needs' : 'done'}`} data-testid={`row-${r.k}`} data-needs-review={r.needs && !r.confirmed ? 'true' : 'false'}>
              <div>
                <div className="up-name">{NAMES[r.k]}</div>
                <div className="up-printed">{r.f ? `Printed as: ${r.f.label}${r.f.unit ? ` (${r.f.unit})` : ''}` : 'Typed by hand'}</div>
              </div>
              <div className="up-inputs">
                <div className="field">
                  <label htmlFor={`scan-${r.k}`}>{NAMES[r.k]} value</label>
                  <input id={`scan-${r.k}`} className="input mono" inputMode="decimal" value={r.value} aria-invalid={err ? 'true' : 'false'}
                    aria-describedby={err ? `scan-${r.k}-err` : undefined}
                    onChange={(e) => setEdit(r.k, { value: e.target.value, confirmed: true })} />
                </div>
                {opts.length > 1 || r.unit === null || !opts.includes(r.unit) ? (
                  <div className="field">
                    <label htmlFor={`scan-${r.k}-unit`}>{NAMES[r.k]} unit</label>
                    <select id={`scan-${r.k}-unit`} className="select" value={r.unit === null ? '' : r.unit}
                      onChange={(e) => setEdit(r.k, { unit: e.target.value, confirmed: true })}>
                      {r.unit === null || !opts.includes(r.unit) ? <option value="" disabled>Choose unit</option> : null}
                      {opts.map((u) => <option key={u} value={u}>{unitLabel(u) || 'none'}</option>)}
                    </select>
                  </div>
                ) : <span className="up-unit">{unitLabel(opts[0])}</span>}
              </div>
              <div>
                {r.f ? <ConfChip level={r.f.confidence} /> : <Chip>Typed by hand</Chip>}
                {r.needs ? (resolved
                  ? <Chip tone="green"><span className="up-chip"><Check size={12} aria-hidden="true" />Reviewed</span></Chip>
                  : <Chip tone="amber"><span className="up-chip"><AlertTriangle size={12} aria-hidden="true" />Needs review</span></Chip>) : null}
                {err ? <div id={`scan-${r.k}-err`} className="hint" role="alert">{err}</div> : null}
              </div>
              <div>
                {flags.length ? <ul className="up-flags">{flags.map((f) => <li key={f}>{FLAG_TEXT[f]}</li>)}</ul> : null}
                {r.needs ? (
                  <label className="check-line">
                    <input type="checkbox" checked={r.confirmed} disabled={!!err && !r.confirmed}
                      onChange={(e) => setEdit(r.k, { confirmed: e.target.checked })} />
                    I checked {NAMES[r.k]} against my report
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!rows.length ? <div className="hint">No values yet.</div> : null}

      {absent.length ? (
        <div className="field up-section">
          <label htmlFor="scan-add">Add a value I can see on my report</label>
          <select id="scan-add" className="select" value="" onChange={(e) => { if (e.target.value) setAdded((a) => [...a, e.target.value]); }}>
            <option value="">Choose a measurement</option>
            {absent.map((k) => <option key={k} value={k}>{NAMES[k]}</option>)}
          </select>
        </div>
      ) : null}

      {parsed && parsed.unmapped.length ? (
        <details className="up-details up-section">
          <summary>Lines that were not used ({parsed.unmapped.length})</summary>
          <ul className="up-flags">
            {parsed.unmapped.map((u, i) => <li key={i}>{u.sourceLine}</li>)}
          </ul>
        </details>
      ) : null}

      {dup ? (
        <div className="up-actions">
          <button type="button" className="btn primary" disabled={!canSave} onClick={save}><Save size={14} aria-hidden="true" /> Save anyway</button>
          <button type="button" className="btn danger" onClick={onCancel}><Trash2 size={14} aria-hidden="true" /> Discard</button>
        </div>
      ) : (
        <div className="up-actions">
          <button type="button" className="btn primary" disabled={!canSave} onClick={save} aria-describedby="scan-blockers"><Save size={14} aria-hidden="true" /> Save scan</button>
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      )}
      <div id="scan-blockers" className="hint" role="status" aria-live="polite">{canSave ? 'Ready to save.' : blockers.join(' ')}</div>
    </Card>
  );
}
