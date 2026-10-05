// One coach proposal: current vs proposed per date, evidence, rationale,
// validation, and the decisions. Nothing here changes state itself;
// the parent applies whatever it is handed.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { Card, Chip, Banner } from '../../components.jsx';
import { resolveWorkout } from '../../helpers.js';
import { applyOverrides, totalSets } from '../../coach/overrides.js';
import { effectiveWorkout } from '../../coach/effective.js';
import { validateProposal } from '../../coach/proposals.js';
import { CLINICIAN_NOTE, mergeConfig } from '../../coach/constants.js';
import './coach.css';

export const NOT_CLEARANCE = 'These numbers are rules of thumb from your own logs. They are not medical clearance and not a diagnosis.';
const CONF_TONE = { low: 'amber', medium: 'cyan', high: 'green' };
const KIND_LABEL = {
  reduce: 'Reduce volume', substitute: 'Swap an exercise', move: 'Move a session', recovery: 'Recovery day',
  increase: 'Small increase', restart: 'Restart gently', combined: 'Several changes', question: 'Question', info: 'Information',
};

export const dateLabel = (key) => {
  try { return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return key; }
};
export const windowLabel = (w) => (w ? `last ${w} days` : 'window not stated');

const isSetBlock = (b) => b.blockType === 'single' || b.blockType === 'dropset';
const countOf = (b) => (isSetBlock(b) ? (b.exercises[0] && b.exercises[0].sets) : b.rounds) || 0;
const hasPainNote = (p) => (p.rules || []).includes('pain-block') || String(p.rationale || '').includes(CLINICIAN_NOTE);

// Plan for `date` as it would be after the given ops (swaps applied first).
export function proposedPlan(state, date, changes) {
  const clone = structuredClone(state);
  changes.filter((o) => o.op === 'move').forEach((o) => {
    clone.workoutSwaps = { ...(clone.workoutSwaps || {}), [o.from]: o.to, [o.to]: o.from };
  });
  const ops = changes.filter((o) => o.op !== 'move' && o.date === date);
  if (ops.length) {
    const prior = (clone.planOverrides && clone.planOverrides[date]) || { version: 0, ops: [] };
    clone.planOverrides = { ...(clone.planOverrides || {}), [date]: { ...prior, proposalId: 'preview', ops: [...prior.ops, ...ops] } };
  }
  return applyOverrides(resolveWorkout(date, clone), date, clone);
}

const sig = (b) => `${countOf(b)}|${b.name}|${b.exercises.map((e) => e.name).join(',')}`;

function PlanBox({ kind, plan, other }) {
  const otherBlocks = Object.fromEntries((other.blocks || []).map((b) => [b.id, b]));
  return (
    <div className={`coach-plan ${kind}`}>
      <h5>{kind === 'current' ? 'Current' : 'Proposed'}</h5>
      <div><b>{plan.title || 'Session'}</b>{plan.intensity ? ` · ${plan.intensity}` : ''}</div>
      <div className="coach-total">{totalSets(plan)} planned sets</div>
      {(plan.blocks || []).length ? (
        <ul>
          {plan.blocks.map((b) => {
            const o = otherBlocks[b.id];
            const changed = !o || sig(o) !== sig(b);
            return <li key={b.id} className={changed ? 'changed' : ''}>{b.name}: {countOf(b)} {isSetBlock(b) ? 'sets' : 'rounds'}{changed ? ' (differs)' : ''}</li>;
          })}
        </ul>
      ) : <div className="hint">No lifting blocks.</div>}
      {(plan.conditioning || []).length && !(plan.blocks || []).length ? <div className="hint">{plan.conditioning.join('; ')}</div> : null}
    </div>
  );
}

function DateCompare({ date, state, changes }) {
  const [view, setView] = useState('proposed');
  const { current, proposed } = useMemo(() => ({
    current: effectiveWorkout(date, state),
    proposed: proposedPlan(state, date, changes),
  }), [date, state, changes]);
  return (
    <div className="coach-date">
      <h4>{dateLabel(date)}</h4>
      <div className="pill-toggle coach-view-switch" role="group" aria-label={`Show current or proposed plan for ${date}`}>
        {['current', 'proposed'].map((v) => (
          <button key={v} type="button" aria-pressed={view === v} className={view === v ? 'active' : ''} style={{ minHeight: 44 }} onClick={() => setView(v)}>
            {v === 'current' ? 'Current' : 'Proposed'}
          </button>
        ))}
      </div>
      <div className="coach-cmp" data-view={view}>
        <PlanBox kind="current" plan={current} other={proposed} />
        <PlanBox kind="proposed" plan={proposed} other={current} />
      </div>
    </div>
  );
}

function describeOp(o) {
  if (o.op === 'scale-sets') return `Scale sets${o.blockId ? ` in ${o.blockId}` : ''} on ${dateLabel(o.date)}`;
  if (o.op === 'move') return `Move ${dateLabel(o.from)} to ${dateLabel(o.to)}`;
  if (o.op === 'substitute') return `Swap ${o.from} for ${o.to} on ${dateLabel(o.date)}`;
  if (o.op === 'drop-block') return `Drop optional block ${o.blockId} on ${dateLabel(o.date)}`;
  if (o.op === 'recovery-day') return `Recovery day on ${dateLabel(o.date)}`;
  return `${o.op} on ${dateLabel(o.date || o.from)}`;
}

function Editor({ proposal, state, today, onApply, onCancel }) {
  const cfg = mergeConfig((state.coach && state.coach.settings && state.coach.settings.config) || {});
  const minFactor = Math.max(0.5, 1 - cfg.maxReductionPct / 100);
  const scale = proposal.changes.find((o) => o.op === 'scale-sets');
  const [factor, setFactor] = useState(scale ? scale.factor : 1);
  const [included, setIncluded] = useState(() => proposal.changes.map(() => true));
  const edited = useMemo(() => ({
    ...proposal,
    changes: proposal.changes
      .map((o) => (o.op === 'scale-sets' ? { ...o, factor: Number(factor) } : o))
      .filter((_, i) => included[i]),
  }), [proposal, factor, included]);
  const check = edited.changes.length
    ? validateProposal(edited, state, { todayKey: today })
    : { ok: false, errors: ['Include at least one change.'] };
  return (
    <div className="coach-edit" role="group" aria-label="Edit this proposal">
      {scale ? (
        <div className="field">
          <label htmlFor={`f-${proposal.id}`}>Keep {Math.round(factor * 100)}% of planned sets</label>
          <input id={`f-${proposal.id}`} type="range" min={minFactor} max="1" step="0.05" value={factor} onChange={(e) => setFactor(e.target.value)} />
          <div className="hint">Volume can only go down here. The allowed limit is a {cfg.maxReductionPct}% reduction.</div>
        </div>
      ) : null}
      {proposal.changes.length > 1 ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="coach-legend">Include</legend>
          {proposal.changes.map((o, i) => (
            <label key={i} className="check-line">
              <input type="checkbox" checked={included[i]} onChange={(e) => setIncluded(included.map((x, j) => (j === i ? e.target.checked : x)))} />
              {describeOp(o)}
            </label>
          ))}
        </fieldset>
      ) : null}
      {!check.ok ? <ul className="plain-list" role="alert" aria-label="Edited proposal problems">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
      <div className="coach-btns">
        <button type="button" className="btn amber" disabled={!check.ok} onClick={() => onApply(edited)}><Check size={14} /> Apply edited version</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel edit</button>
      </div>
    </div>
  );
}

export default function ProposalCard({ proposal, state, today, onAccept, onKeep, onEdit, onReject, explanation }) {
  const [editing, setEditing] = useState(false);
  const check = useMemo(() => validateProposal(proposal, state, { todayKey: today }), [proposal, state, today]);
  const dates = proposal.dates && proposal.dates.length ? proposal.dates : [...new Set((proposal.changes || []).flatMap((o) => [o.date, o.from, o.to].filter(Boolean)))].sort();
  const isModel = explanation && explanation.source === 'model';
  const reasonId = `reason-${proposal.id}`;

  return (
    <Card className="pad coach-card" role="group" aria-label={`Proposal: ${KIND_LABEL[proposal.kind] || proposal.kind}`}>
      <div className="coach-item-head">
        <b>{KIND_LABEL[proposal.kind] || proposal.kind}</b>
        <span className="chip-row" style={{ margin: 0 }}>
          <Chip tone={CONF_TONE[proposal.confidence] || ''}>Confidence: {proposal.confidence}</Chip>
          {proposal.requiresAcceptance ? <Chip tone="amber">Needs your OK</Chip> : null}
        </span>
      </div>

      <div className="coach-dates" style={{ marginTop: 12 }}>
        {dates.map((d) => <DateCompare key={d} date={d} state={state} changes={proposal.changes} />)}
      </div>

      <h4>Why</h4>
      <p className="coach-why">{proposal.rationale}</p>

      <h4>Evidence</h4>
      {(proposal.evidence || []).length ? (
        <ul className="plain-list">
          {proposal.evidence.map((e, i) => <li key={i}>{e.label}: <span className="num">{String(e.value)}</span> ({windowLabel(e.window)})</li>)}
        </ul>
      ) : <div className="hint">No numeric evidence was attached.</div>}

      {(proposal.missing || []).length ? (
        <Banner tone="cyan" icon={Info}><b>Would sharpen this:</b> {proposal.missing.join('; ')}.</Banner>
      ) : null}

      {hasPainNote(proposal) ? (
        <Banner tone="amber" icon={AlertTriangle}>
          Pain was logged on this exercise. This is a load-management suggestion, not a diagnosis. If pain is persistent or concerning, consider evaluation by a qualified clinician.
        </Banner>
      ) : null}

      {explanation ? (
        <div style={{ marginTop: 8 }}>
          {isModel ? <div className="coach-ai-label">AI-written explanation (from the numbers above)</div> : <div className="coach-legend">Summary (rule-based)</div>}
          <p className="coach-why" style={{ marginTop: 4 }}>{explanation.text}</p>
          {(explanation.cautions || []).map((c) => <div className="hint" key={c}>{c}</div>)}
        </div>
      ) : null}

      <div className="hint">{NOT_CLEARANCE}</div>

      {!check.ok ? (
        <div id={reasonId} role="status" style={{ marginTop: 8 }}>
          <Banner tone="red" icon={AlertTriangle}><b>Cannot be applied:</b> {check.errors.join('; ')}.</Banner>
        </div>
      ) : null}

      {editing ? (
        <Editor proposal={proposal} state={state} today={today}
          onApply={(p) => { setEditing(false); onEdit(p); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="coach-btns">
          <button type="button" className="btn primary" disabled={!check.ok} aria-describedby={!check.ok ? reasonId : undefined} onClick={() => onAccept(proposal)}>
            <Check size={14} /> Accept
          </button>
          <button type="button" className="btn" onClick={() => onKeep(proposal)}>Keep current plan</button>
          <button type="button" className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          {onReject ? <button type="button" className="btn ghost" onClick={() => onReject(proposal)}>Dismiss</button> : null}
        </div>
      )}
    </Card>
  );
}
