// ============================================================
// PlanSetup - ask the minimum useful questions, generate a starting plan from
// the CONFIRMED answers, and let the person accept it, edit the answers,
// regenerate, or keep what they already have.
//
// Body scans are supporting context elsewhere; nothing on this screen reads
// them, so a scan can never be the sole basis for a plan.
// ============================================================
import React, { useMemo, useState } from 'react';
import { Check, AlertTriangle, Info, RotateCcw, Sparkles } from 'lucide-react';
import { Card, Chip, Banner, SectionTitle } from '../../components.jsx';
import { generatePlan, validateAnswers, GOALS, EXPERIENCES, AREAS, EQUIPMENT_CATEGORIES } from '../../coach/planGenerator.js';
import { comparePlans } from '../../coach/planCompare.js';
import { DAY_NAMES, DAY_SHORT } from '../../data.js';

const GOAL_LABEL = { 'fat-loss': 'Lose fat', muscle: 'Build muscle', recomp: 'Both (recomp)', strength: 'Get stronger', general: 'General fitness' };
const EXP_LABEL = { new: 'New to lifting', returning: 'Coming back after a break', intermediate: 'Training for a while', advanced: 'Years of consistent training' };

const BLANK = {
  goal: null, experience: null, availableDays: [1, 3, 5], sessionMinutes: 45,
  equipment: ['dumbbell', 'machine'],
  preferences: { avoid: [], like: [] },
  recent: { lastTrainedWeeksAgo: null, currentlyTraining: false, summary: '' },
  recovery: { sleepHours: null, stress: null },
  limitations: [],
};

const toggle = (list, value) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

function Choice({ options, value, onChange, labels = {}, multi = false, ariaLabel }) {
  return (
    <div className="pill-toggle wrap" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = multi ? value.includes(o) : value === o;
        return (
          <button key={String(o)} type="button" aria-pressed={on} className={on ? 'active' : ''}
            onClick={() => onChange(multi ? toggle(value, o) : o)}>{labels[o] || String(o)}</button>
        );
      })}
    </div>
  );
}

export default function PlanSetup({ state, onAccept, onKeep, onCancel }) {
  const [answers, setAnswers] = useState(() => ({
    ...BLANK,
    availableDays: (state.settings.availableDays || []).length ? state.settings.availableDays : BLANK.availableDays,
    equipment: (state.settings.equipment || []).length ? state.settings.equipment : BLANK.equipment,
    sessionMinutes: state.settings.sessionMinutes || BLANK.sessionMinutes,
    goal: (state.settings.goals || [])[0] || null,
  }));
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const set = (patch) => setAnswers((a) => ({ ...a, ...patch }));

  const hasExisting = Object.values((state.program && state.program.days) || {}).some((d) => (d.blocks || []).length);
  const ready = !!answers.goal && !!answers.experience && answers.availableDays.length > 0;

  const generate = () => {
    const check = validateAnswers(answers);
    if (!check.ok) { setError(check.errors.join(' ')); return; }
    try { setResult(generatePlan(answers)); setError(''); } catch (e) { setError(String(e.message || e)); }
  };

  const comparison = useMemo(
    () => (result && hasExisting ? comparePlans(state.program, result.program, state) : null),
    [result, hasExisting, state],
  );

  if (result) {
    const { program, summary, rationale, missing, warnings, conservative } = result;
    return (
      <Card className="pad">
        <div className="block-tag"><span className="bar" />Your proposed plan</div>
        <h2 style={{ margin: '8px 0 4px', fontSize: 18 }}>{program.name}</h2>
        <div className="chip-row">
          <Chip tone="cyan">{summary.trainingDays} days / week</Chip>
          <Chip>~{summary.estimatedMinutesPerSession} min a session</Chip>
          {conservative ? <Chip tone="amber">Conservative start</Chip> : null}
        </div>

        {warnings.map((w) => <Banner key={w} tone="amber" icon={AlertTriangle}>{w}</Banner>)}

        <SectionTitle>Week</SectionTitle>
        <div className="week-list">
          {Object.keys(program.days).map((dow) => {
            const d = program.days[dow];
            const lifting = (d.blocks || []).length > 0;
            return (
              <div key={dow} className={`week-row ${lifting ? 'on' : ''}`}>
                <b>{DAY_SHORT[dow]}</b>
                <span>{d.title}{lifting ? ` · ${d.blocks.length} exercises` : ''}</span>
              </div>
            );
          })}
        </div>

        <SectionTitle>Why this plan</SectionTitle>
        <ul className="plain-list">{rationale.map((r) => <li key={r}>{r}</li>)}</ul>

        {missing.length ? (
          <Banner tone="cyan" icon={Info}>
            <b>Would sharpen it:</b> {missing.join(' ')}
          </Banner>
        ) : null}

        {comparison ? (
          <>
            <SectionTitle>Compared with your current plan</SectionTitle>
            <div className="compare-grid" role="table" aria-label="Current plan versus proposed plan">
              <div role="row" className="compare-head"><span role="columnheader">Training days</span><span role="columnheader">Current {comparison.trainingDays.a}</span><span role="columnheader">Proposed {comparison.trainingDays.b}</span></div>
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

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => onAccept(program, { answers: result.normalized, inputsHash: result.inputsHash })}>
            <Check size={14} /> Accept this plan
          </button>
          <button className="btn" onClick={() => setResult(null)}>Edit answers</button>
          <button className="btn ghost" onClick={generate}><RotateCcw size={14} /> Regenerate</button>
          {hasExisting ? <button className="btn ghost" onClick={onKeep}>Keep my current plan</button> : null}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          A starting point from what you told me, not medical advice. Nothing changes until you accept, and your logged workouts are never touched.
        </div>
      </Card>
    );
  }

  return (
    <Card className="pad">
      <div className="block-tag"><span className="bar" />Build my plan</div>
      <div className="hint" style={{ marginBottom: 12 }}>A few questions. You review the result before anything is saved.</div>

      <div className="field"><label>Main goal</label>
        <Choice ariaLabel="Main goal" options={GOALS} labels={GOAL_LABEL} value={answers.goal} onChange={(goal) => set({ goal })} /></div>
      <div className="field"><label>Experience</label>
        <Choice ariaLabel="Experience" options={EXPERIENCES} labels={EXP_LABEL} value={answers.experience} onChange={(experience) => set({ experience })} /></div>

      <div className="field"><label>Days you can train</label>
        <Choice ariaLabel="Days you can train" multi options={[1, 2, 3, 4, 5, 6, 0]} labels={Object.fromEntries(DAY_NAMES.map((n, i) => [i, n.slice(0, 3)]))}
          value={answers.availableDays} onChange={(availableDays) => set({ availableDays })} /></div>
      <div className="field-row cols-2">
        <div className="field"><label htmlFor="ps-min">Minutes per session</label>
          <input id="ps-min" className="input mono" inputMode="numeric" value={answers.sessionMinutes ?? ''} onChange={(e) => set({ sessionMinutes: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="ps-weeks">Weeks since you last trained</label>
          <input id="ps-weeks" className="input mono" inputMode="numeric" value={answers.recent.lastTrainedWeeksAgo ?? ''}
            onChange={(e) => set({ recent: { ...answers.recent, lastTrainedWeeksAgo: e.target.value === '' ? null : Number(e.target.value) } })} /></div>
      </div>

      <div className="field"><label>Equipment you can use</label>
        <Choice ariaLabel="Equipment" multi options={EQUIPMENT_CATEGORIES} value={answers.equipment} onChange={(equipment) => set({ equipment })} /></div>

      <div className="field-row cols-2">
        <div className="field"><label htmlFor="ps-sleep">Typical sleep (hours, optional)</label>
          <input id="ps-sleep" className="input mono" inputMode="decimal" value={answers.recovery.sleepHours ?? ''}
            onChange={(e) => set({ recovery: { ...answers.recovery, sleepHours: e.target.value === '' ? null : Number(e.target.value) } })} /></div>
        <div className="field"><label>Stress lately</label>
          <Choice ariaLabel="Stress" options={['low', 'medium', 'high']} value={answers.recovery.stress} onChange={(stress) => set({ recovery: { ...answers.recovery, stress } })} /></div>
      </div>

      <div className="field"><label>Anything that hurts or limits you? (optional)</label>
        <Choice ariaLabel="Limitations" multi options={AREAS}
          value={answers.limitations.map((l) => l.area)}
          onChange={(areas) => set({ limitations: areas.map((area) => answers.limitations.find((l) => l.area === area) || { area, note: '', clinicianRestriction: false }) })} />
        {answers.limitations.map((l) => (
          <label key={l.area} className="check-line">
            <input type="checkbox" checked={l.clinicianRestriction}
              onChange={(e) => set({ limitations: answers.limitations.map((x) => (x.area === l.area ? { ...x, clinicianRestriction: e.target.checked } : x)) })} />
            A clinician has given me restrictions for my {l.area}
          </label>
        ))}
      </div>

      {error ? <Banner tone="red" icon={AlertTriangle} role="alert">{error}</Banner> : null}
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!ready} onClick={generate}><Sparkles size={14} /> Generate plan</button>
        {onCancel ? <button className="btn ghost" onClick={onCancel}>{hasExisting ? 'Keep my current plan' : 'Skip for now'}</button> : null}
      </div>
      {!ready ? <div className="hint" style={{ marginTop: 8 }}>Pick a goal, your experience and at least one training day.</div> : null}
    </Card>
  );
}
