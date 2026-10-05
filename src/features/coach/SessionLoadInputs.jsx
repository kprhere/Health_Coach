// Two OPTIONAL fields on a finished session. Session load = RPE x minutes is
// only ever computed from what the person typed; blanks stay blank.
import React, { useEffect, useId, useState } from 'react';
import './coach.css';

const RANGES = { rpe: [1, 10], min: [1, 600] };
const show = (v) => (v === undefined || v === null ? '' : String(v));

function parse(text, [lo, hi]) {
  const t = String(text).trim();
  if (t === '') return { blank: true };
  const n = Number(t);
  if (!Number.isFinite(n) || n < lo || n > hi) return { error: `Enter a number from ${lo} to ${hi}, or leave blank.` };
  return { value: n };
}

export default function SessionLoadInputs({ session, onChange }) {
  const id = useId();
  const [rpe, setRpe] = useState(show(session && session.sessionRpe));
  const [min, setMin] = useState(show(session && session.durationMin));
  useEffect(() => { setRpe(show(session && session.sessionRpe)); }, [session && session.sessionRpe]);
  useEffect(() => { setMin(show(session && session.durationMin)); }, [session && session.durationMin]);

  const rpeP = parse(rpe, RANGES.rpe);
  const minP = parse(min, RANGES.min);

  const write = (field, parsed) => {
    if (parsed.error) return;
    const next = { ...(session || {}) };
    if (parsed.blank) delete next[field]; else next[field] = parsed.value;
    onChange(next);
  };

  return (
    <fieldset className="coach-load">
      <legend className="coach-legend">Session load (optional)</legend>
      <div className="field-row cols-2">
        <div className="field">
          <label htmlFor={`${id}-rpe`}>Session RPE (1-10)</label>
          <input id={`${id}-rpe`} className="input mono" inputMode="decimal" value={rpe}
            aria-invalid={!!rpeP.error} aria-describedby={`${id}-help${rpeP.error ? ` ${id}-rpe-err` : ''}`}
            onChange={(e) => { setRpe(e.target.value); write('sessionRpe', parse(e.target.value, RANGES.rpe)); }} />
          {rpeP.error ? <div id={`${id}-rpe-err`} className="coach-err" role="alert">{rpeP.error}</div> : null}
        </div>
        <div className="field">
          <label htmlFor={`${id}-min`}>Duration (minutes)</label>
          <input id={`${id}-min`} className="input mono" inputMode="numeric" value={min}
            aria-invalid={!!minP.error} aria-describedby={`${id}-help${minP.error ? ` ${id}-min-err` : ''}`}
            onChange={(e) => { setMin(e.target.value); write('durationMin', parse(e.target.value, RANGES.min)); }} />
          {minP.error ? <div id={`${id}-min-err`} className="coach-err" role="alert">{minP.error}</div> : null}
        </div>
      </div>
      <div id={`${id}-help`} className="hint">Used for session load = RPE x minutes. Leave blank if unsure; the coach will not guess.</div>
    </fieldset>
  );
}
