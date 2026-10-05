// Coach tab: reassess, review proposals, see what was applied (with Undo only
// where it would succeed), declined history, audit trail and the evidence the
// coach used. All writes go through the engine; this file never edits plan
// data directly.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, RefreshCw, WifiOff, Undo2 } from 'lucide-react';
import { Card, Chip, Banner, EmptyState, SectionTitle } from '../../components.jsx';
import { assess } from '../../coach/metrics.js';
import { WINDOWS, mergeConfig } from '../../coach/constants.js';
import {
  applyProposal, ensureCoach, generateProposals, keepCurrent, recordProposals, rejectProposal, undoProposal,
} from '../../coach/proposals.js';
import { explainProposal } from '../../coach/ai.js';
import ProposalCard, { dateLabel, windowLabel } from './ProposalCard.jsx';
import './coach.css';

const MISSING_TEXT = {
  'rhr baseline': 'not enough RHR history to compare',
  rhr: 'no recent resting heart rate logged',
  'hrv baseline': 'not enough HRV history to compare',
  sleep: 'no sleep logged in the last 7 days',
  'session load': 'no session RPE x duration logged',
  'unlogged planned sessions': 'some planned sessions are not logged',
};
const DAY_STATUS = { logged: 'logged', unlogged: 'not logged', rest: 'marked rest by you', missed: 'marked missed by you' };

const stamp = (ms) => { try { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); } catch (e) { return ''; } };
const useOnline = () => {
  const [on, setOn] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
};

function ModeSwitch({ mode, onChange }) {
  return (
    <fieldset className="coach-mode">
      <legend className="coach-legend">How should the coach act?</legend>
      <div className="coach-seg" role="radiogroup" aria-label="Coach mode">
        <label><input type="radio" name="coach-mode" value="recommend" checked={mode !== 'auto'} onChange={() => onChange('recommend')} />Recommend</label>
        <label><input type="radio" name="coach-mode" value="auto" checked={mode === 'auto'} onChange={() => onChange('auto')} />Automatic conservative adjustments</label>
      </div>
      <div className="hint">
        {mode === 'auto'
          ? 'On: after a reassessment, only validated reductions or recovery swaps within the smaller automatic limits are applied for you. Increases and moves always need your acceptance. You can undo any of them before the session. Turn off any time.'
          : 'Recommend (default): nothing changes until you accept. Automatic adjustments are off. You can enable them here; they only ever apply validated reductions or recovery swaps within limits.'}
      </div>
    </fieldset>
  );
}

function EvidencePanel({ assessment }) {
  const [win, setWin] = useState(7);
  const w = assessment.windows[win];
  const muscles = Object.entries(w.perMuscle).sort((a, b) => b[1] - a[1]);
  const c = w.conditioning;
  const r = assessment.recovery;
  const pain = Object.entries(assessment.pain.byExercise);
  const days = assessment.planStatus.filter((p) => p.date >= w.start && p.date <= w.end && (p.planned || p.status !== 'none'));
  return (
    <Card className="pad" aria-label="Evidence" role="region">
      <div className="coach-head">
        <h3 style={{ margin: 0, fontSize: 15 }}>Evidence as of {dateLabel(assessment.asOf)}</h3>
        <div className="coach-seg" role="radiogroup" aria-label="Evidence window">
          {WINDOWS.map((n) => (
            <label key={n}><input type="radio" name="coach-win" value={n} checked={win === n} onChange={() => setWin(n)} />{n} days</label>
          ))}
        </div>
      </div>

      <SectionTitle>Resistance sets per muscle ({windowLabel(win)})</SectionTitle>
      {muscles.length ? (
        <table className="coach-table">
          <thead><tr><th>Muscle</th><th>Sets</th></tr></thead>
          <tbody>{muscles.map(([m, n]) => <tr key={m}><td>{m}</td><td className="num">{n}</td></tr>)}</tbody>
        </table>
      ) : <div className="hint">No completed working sets logged in this window.</div>}
      <div className="hint">{w.completedWorkingSets} working sets over {w.loggedSessionDays} logged sessions. Warm-ups are excluded.</div>

      <SectionTitle>Conditioning (kept separate from lifting volume)</SectionTitle>
      <ul className="plain-list">
        <li>Walking: {c.walkMin} min</li>
        <li>Swim days: {c.swimDays}; badminton days: {c.badmintonDays}</li>
        <li>Watch exercise minutes: {c.watchExerciseMin}</li>
      </ul>

      <SectionTitle>Timed work</SectionTitle>
      <div className="hint" style={{ marginTop: 0 }}>{w.timedSets ? `${w.timedSets} timed sets, ${w.timedSeconds} s total` : 'No timed holds logged.'}</div>

      <SectionTitle>Recovery inputs</SectionTitle>
      <ul className="plain-list">
        <li>Sleep, 7-day average: {r.sleepAvg7 != null ? `${r.sleepAvg7} h (${r.sleepDays} nights logged)` : 'not logged'}</li>
        <li>Resting HR, last 3 days: {r.rhr.recent != null ? `${r.rhr.recent} bpm` : 'not logged'}{r.rhr.baseline != null ? `; your baseline ${r.rhr.baseline} bpm` : ''}</li>
        <li>HRV: {r.hrv.used ? `${r.hrv.recent} vs baseline ${r.hrv.baseline}` : 'not enough history to compare'}</li>
        <li>Session load: {w.loadTotal != null ? `${w.loadTotal} (RPE x minutes, only sessions where you logged both)` : 'not logged'}</li>
      </ul>

      <SectionTitle>Pain flags (last 14 days)</SectionTitle>
      {pain.length ? (
        <ul className="plain-list">
          {pain.map(([name, p]) => <li key={name}>{name}: highest {p.maxPain}/10, {p.exposures} sessions at or above the threshold</li>)}
        </ul>
      ) : <div className="hint">No pain logged on sets.</div>}

      <SectionTitle>Days in this window</SectionTitle>
      {days.length ? (
        <ul className="coach-days">
          {days.map((d) => <li key={d.date}><Chip tone={d.status === 'logged' ? 'green' : d.status === 'unlogged' ? 'amber' : ''}>{dateLabel(d.date)}: {DAY_STATUS[d.status] || 'planned'}</Chip></li>)}
        </ul>
      ) : <div className="hint">No planned or logged days here.</div>}
      <div className="hint">A day with nothing logged is shown as not logged. It is never assumed to be a day off.</div>

      <SectionTitle>Missing inputs</SectionTitle>
      {assessment.missing.length
        ? <ul className="plain-list">{assessment.missing.map((m) => <li key={m}>{MISSING_TEXT[m] || m}</li>)}</ul>
        : <div className="hint">Nothing important is missing.</div>}
    </Card>
  );
}

export default function CoachTab({ state, setState, today, nowMs, aiEnabled = false, callModel }) {
  const coach = ensureCoach(state);
  const mode = coach.settings.mode === 'auto' ? 'auto' : 'recommend';
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [last, setLast] = useState(null); // { at, notes, added }
  const [explanations, setExplanations] = useState({});

  const assessment = useMemo(() => {
    try { return assess(state, today, { config: coach.settings.config }); } catch (e) { return null; }
  }, [state, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = Object.values(coach.proposals);
  const pending = all.filter((p) => p.status === 'pending').sort((a, b) => (a.dates || [])[0] > (b.dates || [])[0] ? 1 : -1);
  const applied = all.filter((p) => p.status === 'applied').sort((a, b) => b.appliedAtMs - a.appliedAtMs);
  const history = all.filter((p) => p.status === 'declined' || p.status === 'rejected' || p.status === 'undone')
    .sort((a, b) => (b.resolvedAtMs || b.undoneAtMs || 0) - (a.resolvedAtMs || a.undoneAtMs || 0));

  const useAi = aiEnabled && online;
  const pendingKey = pending.map((p) => p.id).join('|');
  useEffect(() => {
    let live = true;
    pending.forEach((p) => {
      explainProposal(p, { enabled: useAi, callModel }).then((ex) => {
        if (live) setExplanations((m) => ({ ...m, [`${p.id}:${useAi}`]: ex }));
      }).catch(() => {});
    });
    return () => { live = false; };
  }, [pendingKey, useAi, callModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = { todayKey: today, nowMs };
  const commit = (fn) => setState((prev) => fn(prev));

  const reassess = () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const res = generateProposals(state, today, nowMs);
      // The engine does not suppress proposals the person just declined; do it here.
      const cooldownMs = (mergeConfig(coach.settings.config).cooldownDays) * 86400000;
      res.proposals = res.proposals.filter((p) => !all.some((e) => e.fingerprint === p.fingerprint
        && (e.status === 'declined' || e.status === 'rejected') && e.resolvedAtMs != null && nowMs - e.resolvedAtMs < cooldownMs));
      const ids = res.proposals.map((p) => p.id);
      commit((prev) => {
        let s = recordProposals(prev, res.proposals);
        if (ensureCoach(s).settings.mode === 'auto') {
          res.proposals.forEach((p) => {
            const rec = ensureCoach(s).proposals[p.id];
            if (!rec || rec.status !== 'pending') return;
            const r = applyProposal(s, rec, { ...opts, mode: 'auto' });
            if (r.ok) { s = r.state }
          });
        }
        return s;
      });
      setLast({ at: nowMs, notes: res.notes, added: ids.length });
      setMessage(ids.length
        ? `${ids.length} new suggestion${ids.length === 1 ? '' : 's'} found${mode === 'auto' ? '. Any that fit the automatic limits were applied; the rest wait for you' : ''}.`
        : 'No new changes proposed. Your plan stays as it is.');
    } catch (e) {
      setError(`Could not reassess: ${String((e && e.message) || e)}. Your plan was not changed.`);
    } finally { setBusy(false); }
  };

  const setMode = (m) => commit((prev) => {
    const c = ensureCoach(prev);
    return { ...prev, coach: { ...c, settings: { ...c.settings, mode: m } } };
  });

  const run = (fn, doneText) => {
    const preview = fn(state);
    if (!preview.ok) { setError(preview.errors.join('; ')); return; }
    setError(''); setMessage(doneText);
    commit((prev) => { const r = fn(prev); return r.ok ? r.state : prev; });
  };
  const onAccept = (p) => run((s) => applyProposal(s, ensureCoach(s).proposals[p.id] || p, opts), 'Change applied. You can undo it until the session day.');
  const onEdit = (p) => run((s) => applyProposal(s, p, opts), 'Edited change applied.');
  const onKeep = (p) => run((s) => keepCurrent(s, p.id, { nowMs }), 'Kept your current plan. This will not be suggested again for a few days.');
  const onReject = (p) => run((s) => rejectProposal(s, p.id, { nowMs }), 'Dismissed.');
  const onUndo = (p) => run((s) => undoProposal(s, p.id, opts), 'Change undone. Your plan is back to what it was.');

  const hasHistory = assessment && Object.values(assessment.windows[28]).length && assessment.windows[28].loggedSessionDays > 0;

  return (
    <div className="coach-tab" aria-busy={busy}>
      <div className="coach-head">
        <div>
          <h2>Coach</h2>
          <div className="coach-sub" aria-live="polite">
            {last ? `Last assessed ${stamp(last.at)} (as of ${dateLabel(today)})` : `Not reassessed yet this visit (as of ${dateLabel(today)})`}
          </div>
        </div>
        <button type="button" className="btn primary" onClick={reassess} disabled={busy}>
          <RefreshCw size={14} /> {busy ? 'Assessing...' : 'Reassess my plan'}
        </button>
      </div>

      {!online ? <Banner tone="amber" icon={WifiOff}>You are offline. The coach works from data saved on this device; AI-written explanations are paused.</Banner> : null}
      {error ? <Banner tone="red" icon={AlertTriangle} role="alert">{error}</Banner> : null}
      {message ? <div role="status" className="coach-sub">{message}</div> : null}
      {!assessment ? <Banner tone="red" icon={AlertTriangle} role="alert">The evidence could not be read from your saved data. Nothing was changed.</Banner> : null}
      {assessment && !hasHistory ? (
        <Banner tone="cyan" icon={Info}>Not enough logged training in the last 28 days to suggest much. Log a few sessions and the coach will have something to compare.</Banner>
      ) : null}

      <ModeSwitch mode={mode} onChange={setMode} />

      {last && last.notes.length ? (
        <Card className="pad" role="region" aria-label="Assessment notes">
          <b>Notes from this assessment</b>
          <ul className="plain-list">{last.notes.map((n, i) => <li key={i}>{n.rationale}</li>)}</ul>
        </Card>
      ) : null}

      <section aria-label="Pending proposals">
        <SectionTitle>Suggestions waiting for you ({pending.length})</SectionTitle>
        {pending.length ? (
          <div className="coach-list">
            {pending.map((p) => (
              <ProposalCard key={p.id} proposal={p} state={state} today={today}
                explanation={explanations[`${p.id}:${useAi}`]}
                onAccept={onAccept} onKeep={onKeep} onEdit={onEdit} onReject={onReject} />
            ))}
          </div>
        ) : <EmptyState icon={Info} title="No suggestions right now" sub="Use Reassess my plan to check your recent logs." />}
      </section>

      <section aria-label="Applied adjustments">
        <SectionTitle>Applied adjustments ({applied.length})</SectionTitle>
        {applied.length ? (
          <ul className="coach-list">
            {applied.map((p) => {
              const u = undoProposal(state, p.id, opts);
              return (
                <li key={p.id} className="coach-item">
                  <div className="coach-item-head">
                    <span>{(p.dates || []).map(dateLabel).join(', ')}: {p.rationale}</span>
                    <Chip tone="green">Applied{p.appliedMode === 'auto' ? ' automatically' : ''} {stamp(p.appliedAtMs)}</Chip>
                  </div>
                  <div className="coach-btns">
                    <button type="button" className="btn" disabled={!u.ok} onClick={() => onUndo(p)} aria-describedby={u.ok ? undefined : `undo-${p.id}`}>
                      <Undo2 size={14} /> Undo
                    </button>
                  </div>
                  {!u.ok ? <div id={`undo-${p.id}`} className="hint">Cannot undo: {u.errors.join('; ')}.</div> : null}
                </li>
              );
            })}
          </ul>
        ) : <div className="hint">Nothing applied yet.</div>}
      </section>

      <section aria-label="Declined and undone history">
        <SectionTitle>Declined and undone ({history.length})</SectionTitle>
        {history.length ? (
          <ul className="coach-list">
            {history.map((p) => (
              <li key={p.id} className="coach-item">
                <Chip>{p.status === 'declined' ? 'Kept current plan' : p.status === 'rejected' ? 'Dismissed' : 'Undone'}</Chip>{' '}
                {(p.dates || []).map(dateLabel).join(', ')}: {p.rationale}
              </li>
            ))}
          </ul>
        ) : <div className="hint">Nothing declined.</div>}
      </section>

      {assessment ? <EvidencePanel assessment={assessment} /> : null}

      <section aria-label="Audit trail">
        <SectionTitle>Audit trail</SectionTitle>
        {coach.audit.length ? (
          <ol className="coach-audit">
            {[...coach.audit].reverse().map((a, i) => (
              <li key={i}>{stamp(a.at)} {a.action} ({a.mode}) {(a.dates || []).join(', ')} rules {a.ruleVersion}</li>
            ))}
          </ol>
        ) : <div className="hint">No coach actions yet.</div>}
      </section>
    </div>
  );
}
