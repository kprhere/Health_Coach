// ============================================================
// loggers.jsx - block-aware Train logging
// single | dropset use straight-set logging.
// superset | circuit | finisher use round-based logging.
// Exercise history + volume flow through both paths (see helpers.allSetRecords).
// ============================================================
import React, { useState } from 'react';
import {
  Plus, Copy, Trash2, MoreHorizontal, Repeat, Check, RefreshCw, Search,
} from 'lucide-react';
import {
  makeSet, makeCell, cellDone, roundDone, getLastSession, getBestPerformance,
  getNextTarget, rxForExercise, e1rm, restartSuggestion, exerciseMeta, exerciseNames,
} from './helpers.js';
import { RestTimer } from './components.jsx';

const FORM_OPTS = ['', 'Clean', 'OK', 'Breakdown'];

function PainScale({ value, onChange }) {
  return (
    <div className="scale red">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}

function ReplaceSelect({ value, onChange, state }) {
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 200 }}>
      <option value="">Replace with...</option>
      {exerciseNames(state).map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

// details panel shared by single-set and round-cell
function Detail({ data, patch, onDelete, skipReplace, onSkipToggle, onReplace, state }) {
  return (
    <div className="cell-detail">
      <div className="field-row cols-3">
        <div className="field" style={{ margin: 0 }}>
          <label>Rest used (s)</label>
          <input className="input mono" inputMode="numeric" value={data.restSec} onChange={(e) => patch('restSec', e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Form</label>
          <select className="select" value={data.form} onChange={(e) => patch('form', e.target.value)}>
            {FORM_OPTS.map((f) => <option key={f} value={f}>{f || '-'}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Tempo done</label>
          <input className="input mono" value={data.tempo || ''} onChange={(e) => patch('tempo', e.target.value)} placeholder="3-1-1" />
        </div>
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Pain (0 none, 5 stop)</label>
        <PainScale value={data.pain || 0} onChange={(v) => patch('pain', v)} />
      </div>
      <div className="field" style={{ marginTop: 10, marginBottom: skipReplace ? 10 : 0 }}>
        <label>Notes</label>
        <textarea className="textarea" value={data.notes} onChange={(e) => patch('notes', e.target.value)} placeholder="Felt strong, add weight next time" />
      </div>
      {skipReplace ? (
        <div className="btn-row">
          <button className="btn xs" onClick={onSkipToggle}>{data.skipped ? 'Un-skip' : 'Skip exercise'}</button>
          <ReplaceSelect value={data.replacedWith} onChange={onReplace} state={state} />
        </div>
      ) : null}
      {data.skipped ? (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Skip reason</label>
          <input className="input" value={data.skipReason || ''} onChange={(e) => patch('skipReason', e.target.value)} placeholder="Machine taken, shoulder tight..." />
        </div>
      ) : null}
      {onDelete ? <button className="btn xs danger" style={{ marginTop: 10 }} onClick={onDelete}><Trash2 size={13} /> Delete set</button> : null}
    </div>
  );
}

// target chips
function TargetLine({ chips }) {
  return (
    <div className="target-line">
      {chips.map((c, i) => (
        <span key={i} className={`tt ${c.rest ? 'rest' : ''}`}>{c.k} <b>{c.v}</b></span>
      ))}
    </div>
  );
}

// last / best / next-target grid for one exercise
function HistoryGrid({ name, state, rx }) {
  const last = getLastSession(name, state);
  const best = getBestPerformance(name, state);
  const next = getNextTarget(name, state, rx);
  return (
    <div className="hist-block">
      <div className="hb">
        <div className="hb-k">Last session</div>
        <div className="hb-v">
          {last ? last.sets.map((s, i) => <span key={i}>{s.weight} x {s.reps}{i < last.sets.length - 1 ? ', ' : ''}</span>) : <span className="faint">No history</span>}
        </div>
      </div>
      <div className="hb">
        <div className="hb-k">Best</div>
        <div className="hb-v">{best ? <>{best.maxWeight} lb PR<br />e1RM {Math.round(best.e1rm)} lb</> : <span className="faint">-</span>}</div>
      </div>
      <div className="hb target" style={{ gridColumn: '1 / -1' }}>
        <div className="hb-k">Coach target today</div>
        <div className="hb-v">{next.text}<br /><span className="faint" style={{ fontSize: 10.5 }}>{next.note}</span></div>
      </div>
    </div>
  );
}

// ============================================================
// SINGLE + DROPSET
// ============================================================
export function SingleLogger({ block, entry, plan, state, onMutate, setRestart }) {
  const [openIdx, setOpenIdx] = useState(-1);
  const ex = block.exercises[0];
  const name = entry.replacedWith || entry.exName || ex.name;
  const meta = exerciseMeta(name, state);
  const rx = { repLow: ex.repLow, repHigh: ex.repHigh, rpe: ex.rpe };
  const isDrop = block.blockType === 'dropset';
  const rs = restartSuggestion(name, state);
  const rw = (state.restartWeights && state.restartWeights[name]) || { old: '', pct: '' };
  const addWarmup = () => onMutate((e) => { e.sets.unshift({ ...makeSet(), isWarmup: true }); });

  const setField = (i, f, v) => onMutate((e) => { e.sets[i][f] = v; });
  const addSet = (drop) => onMutate((e) => { e.sets.push({ ...makeSet(), isDrop: !!drop }); });
  const delSet = (i) => onMutate((e) => { e.sets.splice(i, 1); });
  const copyPrev = (i) => onMutate((e) => { if (i > 0) { const p = e.sets[i - 1]; e.sets[i] = { ...e.sets[i], weight: p.weight, reps: p.reps, rpe: p.rpe }; } });
  const toggleSkip = () => onMutate((e) => { e.skipped = !e.skipped; });
  const replace = (nm) => onMutate((e) => { e.replacedWith = nm; });

  const chips = [
    { k: 'Sets', v: ex.sets },
    { k: 'Reps', v: `${ex.repLow}-${ex.repHigh}` },
    { k: 'RPE', v: ex.rpe },
    { k: 'Rest', v: `${ex.restSec}s`, rest: true },
    { k: 'Tempo', v: ex.tempo },
  ];

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <span className="chip">{meta.p || 'Exercise'}</span>
        {entry.replacedWith ? <span className="chip amber">Replaced</span> : null}
        {entry.skipped ? <span className="chip red">Skipped</span> : null}
      </div>
      <TargetLine chips={chips} />
      {isDrop ? <div className="hint">Drop set: hit the top set near failure, then strip the weight and keep going. Add each drop as a row below.</div> : null}
      {meta.cue ? <div className="hint"><b style={{ color: 'var(--muted)' }}>Cue:</b> {meta.cue}. <b style={{ color: 'var(--muted)' }}>Avoid:</b> {meta.err}.</div> : null}
      {meta.eos ? <div className="hint">EOS option: {meta.eos}. Substitute: {meta.sub}.</div> : null}

      {setRestart ? (
        <div className="restart">
          <div className="restart-lead"><b>Restart load</b> <span className="faint">{rs.hasOld ? `${rs.pct}% of ${rs.old} lb old working weight` : 'enter your old working weight to get a restart target'}</span></div>
          <div className="restart-in">
            <div className="field" style={{ margin: 0 }}><label>Old wt (lb)</label><input className="input mono" inputMode="decimal" value={rw.old ?? ''} placeholder="lb" onChange={(e) => setRestart(name, 'old', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>Restart %</label><input className="input mono" inputMode="numeric" value={rw.pct ?? ''} placeholder="70" onChange={(e) => setRestart(name, 'pct', e.target.value)} /></div>
            <div className="restart-out">{rs.hasOld ? <><span className="faint">Suggested</span><b>{rs.suggested} lb</b></> : <span className="faint">Set baseline today</span>}</div>
            {rs.hasOld ? <button className="btn xs" onClick={() => onMutate((e) => { const t = e.sets.find((x) => !x.isWarmup); if (t) t.weight = String(rs.suggested); })}>Use</button> : null}
          </div>
        </div>
      ) : null}

      <HistoryGrid name={name} state={state} rx={rx} />

      <div className="set-head">
        <span>#</span><span>Weight</span><span>Reps</span><span>RPE</span><span></span>
      </div>
      {entry.sets.map((s, i) => (
        <div key={i}>
          <div className="set-row">
            <span className="set-n">{s.isWarmup ? <span className="tag-drop" style={{ color: 'var(--cyan)', background: 'rgba(52,208,222,0.12)' }}>W</span> : s.isDrop ? <span className="tag-drop">DROP</span> : i + 1}</span>
            <input inputMode="decimal" value={s.weight} placeholder="lb" onChange={(e) => setField(i, 'weight', e.target.value)} />
            <input inputMode="numeric" value={s.reps} placeholder="reps" onChange={(e) => setField(i, 'reps', e.target.value)} />
            <input inputMode="decimal" value={s.rpe} placeholder="rpe" onChange={(e) => setField(i, 'rpe', e.target.value)} />
            <button className="set-del" onClick={() => setOpenIdx(openIdx === i ? -1 : i)}><MoreHorizontal size={16} /></button>
          </div>
          {s.rpe !== '' && !isNaN(parseFloat(s.rpe)) ? <div className="rir-hint">Auto RIR {Math.max(0, 10 - parseFloat(s.rpe))}{s.isWarmup ? ' · warm-up, excluded from history' : ''}</div> : null}
          {openIdx === i ? <Detail data={s} patch={(f, v) => setField(i, f, v)} onDelete={() => { delSet(i); setOpenIdx(-1); }} /> : null}
        </div>
      ))}

      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn xs" onClick={() => addSet(false)}><Plus size={13} /> Set</button>
        <button className="btn xs ghost" onClick={addWarmup}><Plus size={13} /> Warm-up</button>
        {entry.sets.length > 1 ? <button className="btn xs" onClick={() => copyPrev(entry.sets.length - 1)}><Copy size={13} /> Copy last</button> : null}
        {isDrop ? <button className="btn xs" onClick={() => addSet(true)}><Plus size={13} /> Drop</button> : null}
        <button className="btn xs ghost" onClick={toggleSkip}>{entry.skipped ? 'Un-skip' : 'Skip'}</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <ReplaceSelect value={entry.replacedWith} onChange={replace} state={state} />
        <div className="hint" style={{ marginTop: 6 }}>Replacement changes exercise history, cues and future targets. Existing set rows and entered weights stay unchanged so nothing is overwritten.</div>
      </div>
    </div>
  );
}

// ============================================================
// SUPERSET / CIRCUIT / FINISHER  (round-based)
// ============================================================
export function RoundsLogger({ block, entry, state, onMutate }) {
  const [open, setOpen] = useState({}); // `${ri}:${nm}` -> bool
  const kind = block.blockType;

  const cellField = (ri, nm, f, v) => onMutate((e) => { e.rounds[ri].byExercise[nm][f] = v; });
  const completeRound = (ri) => onMutate((e) => {
    const rd = e.rounds[ri];
    Object.values(rd.byExercise).forEach((c) => { if (!c.skipped) c.done = true; });
    rd.done = true;
  });
  const uncompleteRound = (ri) => onMutate((e) => {
    const rd = e.rounds[ri]; rd.done = false;
    Object.values(rd.byExercise).forEach((c) => { c.done = false; });
  });
  const copyRound = (ri) => onMutate((e) => {
    if (ri <= 0) return;
    const prev = e.rounds[ri - 1].byExercise;
    Object.keys(e.rounds[ri].byExercise).forEach((nm) => {
      const p = prev[nm];
      if (p) e.rounds[ri].byExercise[nm] = { ...e.rounds[ri].byExercise[nm], weight: p.weight, reps: p.reps, rpe: p.rpe };
    });
  });
  const addRound = () => onMutate((e) => {
    const by = {}; e.exNames.forEach((nm) => { by[nm] = makeCell(); });
    e.rounds.push({ done: false, byExercise: by });
  });
  const completeAll = () => onMutate((e) => {
    e.rounds.forEach((rd) => { Object.values(rd.byExercise).forEach((c) => { if (!c.skipped) c.done = true; }); rd.done = true; });
    e.completed = true;
  });
  const cellSkip = (ri, nm) => onMutate((e) => { const c = e.rounds[ri].byExercise[nm]; c.skipped = !c.skipped; });
  const cellReplace = (ri, nm, name) => onMutate((e) => { e.rounds[ri].byExercise[nm].replacedWith = name; });

  const targetReps = (nm) => { const t = block.exercises.find((x) => x.name === nm); return t ? t.targetReps : ''; };
  const targetRpe = (nm) => { const t = block.exercises.find((x) => x.name === nm); return t ? t.targetRpe : ''; };

  const doneRounds = entry.rounds.filter(roundDone).length;

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        {block.exercises.map((x) => <span key={x.name} className="chip">{x.name} {x.targetReps}</span>)}
      </div>
      {block.note ? <div className="hint" style={{ marginBottom: 8 }}>{block.note}</div> : null}
      <div className="target-line" style={{ marginBottom: 4 }}>
        <span className="tt">Rounds <b>{doneRounds}/{entry.plannedRounds}</b></span>
        <span className="tt rest">Rest/round <b>{entry.restAfterRoundSec}s</b></span>
      </div>

      {entry.rounds.map((rd, ri) => {
        const rdDone = roundDone(rd);
        return (
          <div key={ri} className={`round-card ${rdDone ? 'done' : ''}`}>
            <div className="round-head">
              <span className="rh-n">Round {ri + 1}<small> / {entry.plannedRounds}</small></span>
              <div className="btn-row">
                {ri > 0 ? <button className="btn xs ghost" onClick={() => copyRound(ri)}><Copy size={12} /> Copy prev</button> : null}
                <button className="btn xs" onClick={() => (rdDone ? uncompleteRound(ri) : completeRound(ri))}>
                  <Check size={12} /> {rdDone ? 'Done' : 'Complete'}
                </button>
              </div>
            </div>

            {entry.exNames.map((nm) => {
              const c = rd.byExercise[nm];
              const shown = c.replacedWith || nm;
              const last = getLastSession(shown, state);
              const key = `${ri}:${nm}`;
              return (
                <div key={nm} className={`cell ${c.skipped ? 'skipped' : ''}`}>
                  <div className="cell-top">
                    <div className="cell-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {cellDone(c) && !c.skipped ? <Check size={13} color="var(--green)" /> : null}
                      {shown}<span className="rep-hint">{targetReps(nm)} @ RPE {targetRpe(nm)}</span>
                      {c.replacedWith ? <span className="tag-drop" style={{ color: 'var(--amber)', background: 'rgba(246,166,35,0.12)' }}>SWAP</span> : null}
                    </div>
                  </div>
                  <div className="cell-inputs">
                    <input inputMode="decimal" value={c.weight} placeholder="lb" onChange={(e) => cellField(ri, nm, 'weight', e.target.value)} />
                    <input inputMode="numeric" value={c.reps} placeholder="reps" onChange={(e) => cellField(ri, nm, 'reps', e.target.value)} />
                    <input inputMode="decimal" value={c.rpe} placeholder="rpe" onChange={(e) => cellField(ri, nm, 'rpe', e.target.value)} />
                    <button className="cell-more" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}><MoreHorizontal size={15} /></button>
                  </div>
                  {last ? <div className="hint" style={{ marginTop: 4 }}>Last: {last.sets.map((s) => `${s.weight}x${s.reps}`).join(', ')}</div> : null}
                  {open[key] ? (
                    <Detail
                      data={c}
                      patch={(f, v) => cellField(ri, nm, f, v)}
                      skipReplace
                      onSkipToggle={() => cellSkip(ri, nm)}
                      onReplace={(name) => cellReplace(ri, nm, name)}
                      state={state}
                    />
                  ) : null}
                </div>
              );
            })}

            {rdDone ? <RestTimer seconds={entry.restAfterRoundSec} label="Rest" /> : null}
          </div>
        );
      })}

      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn xs" onClick={addRound}><Plus size={13} /> Round</button>
        <button className="btn xs" onClick={completeAll}><Check size={13} /> Complete {kind}</button>
      </div>
    </div>
  );
}

// dispatcher
export function BlockLogger(props) {
  const t = props.block.blockType;
  if (t === 'single' || t === 'dropset') return <SingleLogger {...props} />;
  return <RoundsLogger {...props} />;
}

// ============================================================
// Add unplanned exercise sheet (creates a single block/entry)
// ============================================================
// positions: [{ id: null|blockId, label }] - null means "at the end". Lets the
// user drop a new exercise exactly where it belongs in the session (e.g.
// between block 6 and 7) instead of always appending it after everything.
export function AddExercisePicker({ onPick, state, positions }) {
  const [q, setQ] = useState('');
  const [afterId, setAfterId] = useState(positions && positions.length ? positions[positions.length - 1].id : null);
  const list = exerciseNames(state).filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <div>
      {positions && positions.length ? (
        <div className="field">
          <label>Insert position</label>
          <select className="select" value={afterId ?? '__end__'} onChange={(e) => setAfterId(e.target.value === '__end__' ? null : e.target.value)}>
            {positions.map((p) => <option key={p.id ?? '__end__'} value={p.id ?? '__end__'}>{p.label}</option>)}
          </select>
        </div>
      ) : null}
      <div className="field lib-search">
        <input className="input" placeholder="Search the exercise library" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="lib-list">
        {list.map((n) => {
          const m = exerciseMeta(n, state);
          return (
            <button key={n} className="lib-item" onClick={() => onPick(n, afterId)}>
              <b>{n}</b>
              <span>{m.p} · {m.eq} · {m.use}</span>
            </button>
          );
        })}
        {list.length === 0 ? <div className="empty"><p>No match. Try a different word.</p></div> : null}
      </div>
    </div>
  );
}

export function makeUnplannedEntry(name, state, afterBlockId = null) {
  const id = `x#${Date.now()}`;
  const meta = exerciseMeta(name, state);
  const setCount = Math.max(1, Math.min(10, parseInt(meta.defaultSets, 10) || 3));
  const repLow = Math.max(1, parseInt(meta.repLow, 10) || 8);
  const repHigh = Math.max(repLow, parseInt(meta.repHigh, 10) || 12);
  const rpe = Math.max(1, Math.min(10, parseFloat(meta.rpe) || 8));
  const restSec = Math.max(0, parseInt(meta.restSec, 10) || 90);
  const sets = Array.from({ length: setCount }, () => makeSet());
  return {
    id,
    entry: {
      blockType: 'single', name, exName: name, sets, afterBlockId,
      skipped: false, skipReason: '', replacedWith: '', completed: false, unplanned: true,
    },
    // a synthetic "block" so the logger can render a target line
    block: { id, blockType: 'single', name, exercises: [{ name, sets: setCount, repLow, repHigh, rpe, restSec, tempo: meta.tempo || '2-1-1' }] },
  };
}
