// ============================================================
// PlanImport - bring in a training plan (file, pasted text, or typed), review
// it day by day, then save. Nothing is saved until at least one day is confirmed.
//
// Props:
//   state    app state (state.program is the "current plan" for comparison)
//   extract  injectable extractor (default extractText inside FileDrop)
//   onSave(program, { file, fileSha256, history })
//   onCancel()           also used for "Keep my current plan"
//   now      () => ISO string | ISO string  (injected for tests)
//
// Uploaded text is untrusted data. Instruction-like text is shown only as an
// inert quoted note; it never changes what the app does.
// ============================================================
import React, { useMemo, useState } from 'react';
import { Check, AlertTriangle, Info, Save, XCircle } from 'lucide-react';
import { Card, Chip, Banner, SectionTitle } from '../../components.jsx';
import FileDrop from './FileDrop.jsx';
import { parsePlanInput, applyCorrections, toProgram } from '../../imports/planParser.js';
import { comparePlans } from '../../coach/planCompare.js';
import { EXERCISES, DAY_NAMES } from '../../data.js';
import './uploads.css';

const LIBRARY = Object.keys(EXERCISES).sort();
const KEEP_CUSTOM = '__custom';

const GROUPS = [
  { id: 'units', title: 'Missing units', codes: ['missing-unit', 'rest-unit-missing'] },
  { id: 'targets', title: 'Unclear targets', codes: ['ambiguous-target', 'implausible', 'percent-1rm-no-1rm', 'cardio-no-duration'] },
  { id: 'names', title: 'Exercise names', codes: ['unrecognised', 'ambiguous-match', 'fuzzy-match'] },
  { id: 'days', title: 'Days', codes: ['day-unmapped', 'duplicate-day', 'empty-day', 'too-many-days'] },
];
const SEV = {
  error: { text: 'Error', tone: 'red', Icon: XCircle },
  warn: { text: 'Warning', tone: 'amber', Icon: AlertTriangle },
  info: { text: 'Note', tone: 'cyan', Icon: Info },
};
const SKIP_TEXT = { 'not-confirmed': 'not confirmed yet', 'no-weekday': 'no weekday chosen', 'duplicate-weekday': 'same weekday as another day' };
const HIDDEN_CODES = ['instruction-like-text', 'unparsed-line'];

function NameInput({ id, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  return (
    <input id={id} className="input" value={draft === null ? value : draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null && draft.trim() && draft !== value) onCommit(draft); setDraft(null); }} />
  );
}

export default function PlanImport({ state, extract, onSave, onCancel, now }) {
  const nowIso = () => (typeof now === 'function' ? now() : now) || new Date().toISOString();
  const [stage, setStage] = useState('input'); // input | review
  const [mode, setMode] = useState('paste'); // paste | manual
  const [text, setText] = useState('');
  const [source, setSource] = useState(null); // { file, fileSha256 }
  const [parsed, setParsed] = useState(null);
  const [edits, setEdits] = useState([]);
  const [confirmed, setConfirmed] = useState([]);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');

  const hasExisting = Object.values((state && state.program && state.program.days) || {}).some((d) => (d.blocks || []).length);

  const begin = (kind, content, meta, src) => {
    const p = parsePlanInput({ kind, content }, { ...meta, parsedAt: nowIso() });
    setSource(src);
    if (!p.ok) {
      setProblem(p.errors.map((e) => e.message).join(' ') || 'The plan could not be read.');
      setStage('input');
      return;
    }
    setProblem('');
    setParsed(p);
    setEdits([]);
    setConfirmed([]);
    setName(p.planName || '');
    setStage('review');
  };

  const onResult = ({ file, fileSha256, check, extraction }) => {
    if (extraction.method === 'none' || !(extraction.text || '').trim()) {
      setProblem('No text could be read from that file. Paste the plan below or type it in instead.');
      return;
    }
    const kind = check && ['csv', 'json'].includes(check.kind) ? check.kind : 'text';
    begin(kind, extraction.text, { sourceSha256: fileSha256, fileName: file && file.name }, { file, fileSha256 });
  };

  const current = useMemo(() => {
    if (!parsed) return null;
    return applyCorrections(parsed, [...edits, ...confirmed.map((day) => ({ op: 'confirmDay', day }))]);
  }, [parsed, edits, confirmed]);

  const program = useMemo(() => {
    if (!current) return null;
    // Instruction-like lines are kept as inert quotes on screen only; they are not written into the saved program.
    const inert = new Set(current.unsupported.filter((u) => u.code === 'instruction-like-text').map((u) => u.text));
    const safe = { ...current, days: current.days.map((d) => ({ ...d, notes: (d.notes || []).filter((n) => !inert.has(n)) })) };
    return toProgram(safe, { name: name || undefined, importedAt: nowIso() });
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, name]);
  const comparison = useMemo(
    () => (program && hasExisting && confirmed.length ? comparePlans(state.program, program, state) : null),
    [program, hasExisting, confirmed, state],
  );

  const op = (o) => setEdits((cur) => {
    const last = cur[cur.length - 1];
    if (o.op === 'editExercise' && last && last.op === 'editExercise' && last.day === o.day && last.block === o.block && last.exercise === o.exercise) {
      return [...cur.slice(0, -1), { ...last, fields: { ...last.fields, ...o.fields } }];
    }
    return [...cur, o];
  });
  const toggleDay = (i, on) => setConfirmed((c) => (on ? [...new Set([...c, i])] : c.filter((x) => x !== i)));

  if (stage === 'input') {
    return (
      <Card className="pad">
        <div className="block-tag"><span className="bar" />Import a training plan</div>
        <div className="hint" style={{ marginBottom: 12 }}>Upload a file, paste your plan, or type it in. You review every day before anything is saved, and your logged workouts are never touched.</div>
        {problem ? <Banner tone="amber" icon={AlertTriangle} role="alert">{problem}</Banner> : null}
        <FileDrop accept="plan" extract={extract} onResult={onResult} idPrefix="plan" />

        <SectionTitle>Or paste or type your plan</SectionTitle>
        <div className="pill-toggle wrap" role="group" aria-label="Plan entry method">
          <button type="button" aria-pressed={mode === 'paste'} className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>Paste text</button>
          <button type="button" aria-pressed={mode === 'manual'} className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Type it in</button>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="plan-text">{mode === 'paste' ? 'Pasted plan' : 'Your plan, one exercise per line'}</label>
          <textarea id="plan-text" className="textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'Mon: Back Squat 3x6-8 rest 150s\nMon: Bench Press 3x8'} />
          <div className="hint">Say the unit for rest (s or min) and weights (lb or kg). Anything unclear is flagged, not guessed.</div>
        </div>
        <div className="up-actions">
          <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => begin(mode === 'manual' ? 'manual' : 'text', text, {}, { file: null, fileSha256: null })}>Read plan</button>
          <button type="button" className="btn ghost" onClick={onCancel}>{hasExisting ? 'Keep my current plan' : 'Cancel'}</button>
        </div>
      </Card>
    );
  }

  const notes = [
    ...current.unsupported.filter((u) => HIDDEN_CODES.includes(u.code)).map((u) => u.text),
    ...(current.notes || []),
  ];
  const progression = (current.progression || []).map((p) => p.text);
  const warnings = current.warnings.filter((w) => !HIDDEN_CODES.includes(w.code));
  const grouped = GROUPS.map((g) => ({ ...g, items: warnings.filter((w) => g.codes.includes(w.code)) }));
  const known = new Set(GROUPS.flatMap((g) => g.codes));
  const other = warnings.filter((w) => !known.has(w.code));
  if (other.length) grouped.push({ id: 'other', title: 'Other', items: other });
  const skipped = program.source.skipped;
  const savedDays = Object.values(program.days).filter((d) => d.dayType === 'training' || (d.blocks || []).length).length;
  const canSave = confirmed.length > 0 && savedDays > 0;

  return (
    <Card className="pad">
      <div className="block-tag"><span className="bar" />Review your plan</div>
      <h2 style={{ margin: '8px 0 4px', fontSize: 18 }}>{current.days.length} day{current.days.length === 1 ? '' : 's'} found</h2>
      <div className="hint">Confirm each day you want. Days you do not confirm are left out. Targets are exactly what the file said; blanks stay blank.</div>

      <div className="field up-section">
        <label htmlFor="plan-name">Plan name</label>
        <input id="plan-name" className="input" value={name} placeholder="Imported Program" onChange={(e) => setName(e.target.value)} />
      </div>

      {grouped.some((g) => g.items.length) ? (
        <>
          <SectionTitle>Things to check</SectionTitle>
          {grouped.filter((g) => g.items.length).map((g) => (
            <div key={g.id} className="up-section">
              <b>{g.title} ({g.items.length})</b>
              <ul className="up-rows" aria-label={g.title}>
                {g.items.map((w, i) => {
                  const s = SEV[w.severity] || SEV.info;
                  return (
                    <li key={`${w.code}-${i}`} className="up-row" style={{ gap: 4 }}>
                      <Chip tone={s.tone}><span className="up-chip"><s.Icon size={12} aria-hidden="true" />{s.text}</span></Chip>
                      <span>{w.message}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      ) : null}

      {notes.length || progression.length ? (
        <div className="up-section">
          <SectionTitle>Notes from your file (not acted on)</SectionTitle>
          {notes.map((n, i) => <blockquote key={`n${i}`} className="up-quote">{n}</blockquote>)}
          {progression.map((n, i) => <blockquote key={`p${i}`} className="up-quote">Progression rule, not applied: {n}</blockquote>)}
        </div>
      ) : null}

      <SectionTitle right={<button type="button" className="btn xs" onClick={() => setConfirmed(current.days.map((_, i) => i))}>Confirm all</button>}>Days</SectionTitle>
      {current.days.map((d, di) => {
        const on = confirmed.includes(di);
        const skip = skipped.find((s) => s.day === d.dayLabel && (s.reason !== 'not-confirmed' || !on));
        const dayWarn = !d.blocks.length;
        return (
          <section key={di} className={`up-group ${on && !skip ? 'on' : ''}`} aria-label={`${d.dayLabel} ${d.title || ''}`.trim()}>
            <header>
              <label className="check-line">
                <input type="checkbox" checked={on} onChange={(e) => toggleDay(di, e.target.checked)} />
                Confirm {d.dayLabel}{d.title ? ` - ${d.title}` : ''}
              </label>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor={`dow-${di}`}>Weekday for {d.dayLabel}</label>
                <select id={`dow-${di}`} className="select" value={d.dow === null || d.dow === undefined ? '' : String(d.dow)}
                  onChange={(e) => op({ op: 'setDow', day: di, dow: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Choose a weekday</option>
                  {[1, 2, 3, 4, 5, 6, 0].map((n) => <option key={n} value={n}>{DAY_NAMES[n]}</option>)}
                </select>
              </div>
              {on && !skip ? <Chip tone="green"><span className="up-chip"><Check size={12} aria-hidden="true" />Will be saved</span></Chip>
                : <Chip tone="amber"><span className="up-chip"><AlertTriangle size={12} aria-hidden="true" />Will be skipped{skip ? `: ${SKIP_TEXT[skip.reason]}` : ''}</span></Chip>}
            </header>
            {dayWarn ? <div className="up-ex hint">{d.restDay ? 'Rest day.' : 'No exercises in this day.'}</div> : null}
            {d.blocks.map((b, bi) => b.exercises.map((ex, ei) => {
              const id = `ex-${di}-${bi}-${ei}`;
              const ref = { day: di, block: bi, exercise: ei };
              const autoMatched = ex.matchedExercise && (ex.matchConfirmed || ex.matchConfidence >= 0.95);
              const selectValue = ex.customConfirmed ? KEEP_CUSTOM : (autoMatched ? ex.matchedExercise : '');
              const edit = (fields) => op({ op: 'editExercise', ...ref, fields });
              const suggestion = !autoMatched && !ex.customConfirmed && ex.matchedExercise;
              return (
                <div key={id} className="up-ex" data-testid={id}>
                  {b.blockType !== 'single' ? <div className="up-printed">{b.blockType}{b.name ? `: ${b.name}` : ''}</div> : null}
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor={`${id}-name`}>Exercise as typed</label>
                    <NameInput id={`${id}-name`} value={ex.name} onCommit={(v) => op({ op: 'renameExercise', ...ref, name: v })} />
                  </div>
                  <div>
                    {autoMatched ? <Chip tone="green"><span className="up-chip"><Check size={12} aria-hidden="true" />Library match {Math.round((ex.matchConfidence || 1) * 100)}%</span></Chip>
                      : ex.customConfirmed ? <Chip><span className="up-chip"><Check size={12} aria-hidden="true" />Kept as custom</span></Chip>
                        : suggestion ? <Chip tone="amber"><span className="up-chip"><AlertTriangle size={12} aria-hidden="true" />Possible match: {ex.matchedExercise} ({Math.round(ex.matchConfidence * 100)}%)</span></Chip>
                          : <Chip tone="amber"><span className="up-chip"><AlertTriangle size={12} aria-hidden="true" />Not in library, stays custom</span></Chip>}
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor={`${id}-match`}>Library exercise for {ex.name}</label>
                    <select id={`${id}-match`} className="select" value={selectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === KEEP_CUSTOM) op({ op: 'keepCustom', ...ref });
                        else if (v) op({ op: 'matchExercise', ...ref, to: v });
                      }}>
                      <option value="" disabled={!!selectValue}>{suggestion ? `Not chosen (suggested: ${ex.matchedExercise})` : 'Not chosen (kept as typed)'}</option>
                      <option value={KEEP_CUSTOM}>Keep as custom</option>
                      {LIBRARY.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="up-nums">
                    {[['sets', 'Sets'], ['repLow', 'Reps low'], ['repHigh', 'Reps high'], ['restSec', 'Rest (sec)'], ['rpe', 'RPE']].map(([f, label]) => (
                      <div className="field" key={f}>
                        <label htmlFor={`${id}-${f}`}>{label}</label>
                        <input id={`${id}-${f}`} className="input mono" inputMode="decimal" value={ex[f] === null || ex[f] === undefined ? '' : ex[f]}
                          onChange={(e) => edit({ [f]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  {ex.note ? <blockquote className="up-quote">{ex.note}</blockquote> : null}
                </div>
              );
            }))}
          </section>
        );
      })}

      {skipped.length ? (
        <Banner tone="amber" icon={AlertTriangle}>
          Will be skipped: {skipped.map((s) => `${s.day} (${SKIP_TEXT[s.reason] || s.reason})`).join(', ')}.
        </Banner>
      ) : null}

      {comparison ? (
        <>
          <SectionTitle>Compared with your current plan</SectionTitle>
          <div className="compare-grid" role="table" aria-label="Current plan versus imported plan">
            <div role="row" className="compare-head"><span role="columnheader">Training days</span><span role="columnheader">Current {comparison.trainingDays.a}</span><span role="columnheader">Imported {comparison.trainingDays.b}</span></div>
            {Object.entries(comparison.weeklySetsByMuscle).map(([muscle, v]) => (
              <div role="row" key={muscle}>
                <span role="cell">{muscle} sets / week</span>
                <span role="cell">{v.a}</span>
                <span role="cell">{v.b}{v.delta ? ` (${v.delta > 0 ? '+' : ''}${v.delta})` : ''}</span>
              </div>
            ))}
          </div>
          {comparison.notes.map((n) => <div className="hint" key={n}>{n}</div>)}
        </>
      ) : null}

      <div className="up-actions">
        <button type="button" className="btn primary" disabled={!canSave}
          onClick={() => onSave(program, { file: source ? source.file : null, fileSha256: source ? source.fileSha256 : null, history: current.history })}>
          <Save size={14} aria-hidden="true" /> Save plan
        </button>
        <button type="button" className="btn ghost" onClick={() => setStage('input')}>Start over</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{hasExisting ? 'Keep my current plan' : 'Cancel'}</button>
      </div>
      <div className="hint" role="status" aria-live="polite">
        {canSave ? 'Nothing changes until you press Save plan.' : (confirmed.length ? 'The confirmed days have no weekday, so there is nothing to save yet. Choose a weekday.' : 'Confirm at least one day to save.')}
      </div>
    </Card>
  );
}
