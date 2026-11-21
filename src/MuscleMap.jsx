import React from 'react';

// Weekly working sets per muscle, shown on a simple front and back figure.
// The figure is drawn from basic shapes for this app. Levels follow the
// app's lagging-muscle rule: under 6 sets a week is under-stimulated, about
// 8-12 is the growth range, more than 16 is a lot to recover from in a cut.
export function muscleLevel(sets) {
  const n = Number(sets) || 0;
  if (n <= 0) return 0;
  if (n < 6) return 1;
  if (n < 12) return 2;
  if (n <= 16) return 3;
  return 4;
}
export const LEVEL_LABEL = ['Not trained', 'Under 6', '6-11', '12-16', 'Over 16'];
export const MAP_RANGES = [7, 30];

// Sets per week for the window. A 30-day window is averaged to a weekly rate
// so the same 6 / 12 / 16 bands still mean the same thing.
export function weeklyRate(sets, days = 7) {
  const n = Number(sets) || 0;
  return days > 7 ? Math.round((n / (days / 7)) * 10) / 10 : n;
}

const FRONT = [
  { g: 'Shoulders', shapes: [['ellipse', 33, 50, 10, 8], ['ellipse', 87, 50, 10, 8]] },
  { g: 'Chest', shapes: [['ellipse', 49, 62, 11, 9], ['ellipse', 71, 62, 11, 9]] },
  { g: 'Biceps', shapes: [['ellipse', 26, 78, 6, 12], ['ellipse', 94, 78, 6, 12]] },
  { g: 'Core', shapes: [['rect', 48, 74, 24, 40, 7]] },
  { g: 'Quads', shapes: [['ellipse', 51, 142, 9, 24], ['ellipse', 69, 142, 9, 24]] },
  { g: 'Calves', shapes: [['ellipse', 51, 196, 6, 17], ['ellipse', 69, 196, 6, 17]] },
];
const BACK = [
  { g: 'Shoulders', shapes: [['ellipse', 33, 50, 10, 8], ['ellipse', 87, 50, 10, 8]] },
  { g: 'Back', shapes: [['path', 'M44 46 L76 46 L80 70 L70 102 L50 102 L40 70 Z']] },
  { g: 'Triceps', shapes: [['ellipse', 26, 78, 6, 12], ['ellipse', 94, 78, 6, 12]] },
  { g: 'Glutes', shapes: [['ellipse', 51, 122, 10, 10], ['ellipse', 69, 122, 10, 10]] },
  { g: 'Hamstrings', shapes: [['ellipse', 51, 152, 8, 18], ['ellipse', 69, 152, 8, 18]] },
  { g: 'Calves', shapes: [['ellipse', 51, 196, 6, 17], ['ellipse', 69, 196, 6, 17]] },
];

function Shape({ s, className }) {
  const [type, ...a] = s;
  if (type === 'ellipse') return <ellipse className={className} cx={a[0]} cy={a[1]} rx={a[2]} ry={a[3]} />;
  if (type === 'rect') return <rect className={className} x={a[0]} y={a[1]} width={a[2]} height={a[3]} rx={a[4]} />;
  return <path className={className} d={a[0]} />;
}

// Neutral silhouette under the muscles: head, neck, forearms, torso, legs.
function Silhouette() {
  return (
    <g className="mm-body">
      <circle cx="60" cy="18" r="12" />
      <rect x="54" y="29" width="12" height="10" rx="3" />
      <path d="M38 42 L82 42 L84 112 L36 112 Z" />
      <ellipse cx="23" cy="104" rx="5" ry="13" /><ellipse cx="97" cy="104" rx="5" ry="13" />
      <rect x="40" y="112" width="40" height="18" rx="8" />
      <ellipse cx="51" cy="150" rx="10" ry="30" /><ellipse cx="69" cy="150" rx="10" ry="30" />
      <ellipse cx="51" cy="198" rx="7" ry="20" /><ellipse cx="69" cy="198" rx="7" ry="20" />
    </g>
  );
}

function Figure({ regions, sets, label }) {
  return (
    <figure className="mm-figure">
      <svg viewBox="0 0 120 230" role="img" aria-label={`${label} view`}>
        <Silhouette />
        {regions.map(({ g, shapes }) => shapes.map((s, i) => (
          <Shape key={`${g}-${i}`} s={s} className={`mm-muscle mm-l${muscleLevel(sets[g])}`}>
          </Shape>
        )))}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function RangeToggle({ days, onDays }) {
  return (
    <div className="mm-range" role="group" aria-label="Muscle map range">
      {MAP_RANGES.map((d) => (
        <button key={d} type="button" className={d === days ? 'on' : ''} aria-pressed={d === days} onClick={() => onDays(d)}>{d} days</button>
      ))}
    </div>
  );
}

export function MuscleMap({ sets = {}, groups = [], compact = false, days = 7 }) {
  const weekly = Object.fromEntries(groups.map((g) => [g, weeklyRate(sets[g], days)]));
  const avg = days > 7;
  const when = avg ? `in the last ${days} days` : 'this week';
  const summary = groups.map((g) => `${g} ${weekly[g]} sets${avg ? ' per week' : ''}`).join(', ');
  const untrained = groups.filter((g) => !(sets[g] > 0));
  const low = groups.filter((g) => sets[g] > 0 && weekly[g] < 6);
  return (
    <div className={`muscle-map${compact ? ' compact' : ''}`}>
      <div className="mm-figures" aria-label={`Working sets ${when}: ${summary}`}>
        <Figure regions={FRONT} sets={weekly} label="Front" />
        <Figure regions={BACK} sets={weekly} label="Back" />
      </div>
      <div className="mm-legend">
        {LEVEL_LABEL.map((text, i) => <span key={text}><i className={`mm-swatch mm-l${i}`} />{text}</span>)}
        <span className="mm-unit">sets / week{avg ? ', averaged' : ''}</span>
      </div>
      {compact ? (
        <div className="mm-note">
          {untrained.length ? <span><b className="amber">Not trained {when}:</b> {untrained.join(', ')}</span> : <span><b className="green">Every muscle trained {when}.</b></span>}
          {low.length ? <span><b>Under 6 sets a week:</b> {low.join(', ')}</span> : null}
        </div>
      ) : (
        <div className={`mm-sets${avg ? ' avg' : ''}`}>
          {groups.map((g) => (
            <span key={g} className={`mm-set mm-t${muscleLevel(weekly[g])}`}>
              <span className="mm-name">{g}</span>
              <b>{weekly[g]}{avg ? <small>/wk</small> : null}</b>
              {avg ? <small className="mm-total">{sets[g] || 0} total</small> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
