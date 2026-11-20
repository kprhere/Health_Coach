import React from 'react';

// Weekly working sets per muscle, shown on a simple front and back figure.
// The figure is drawn from basic shapes for this app. Levels follow the
// app's lagging-muscle rule: under 6 sets a week is under-stimulated, about
// 8-12 is the growth range, more than 16 is a lot to recover from in a cut.
export function muscleLevel(sets) {
  const n = Number(sets) || 0;
  if (n <= 0) return 0;
  if (n < 6) return 1;
  if (n <= 16) return 2;
  return 3;
}
export const LEVEL_LABEL = ['Not trained', 'Under 6 sets', '6-16 sets', 'Over 16 sets'];

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

export function MuscleMap({ sets = {}, groups = [], compact = false }) {
  const summary = groups.map((g) => `${g} ${sets[g] || 0} sets`).join(', ');
  const untrained = groups.filter((g) => !(sets[g] > 0));
  const low = groups.filter((g) => sets[g] > 0 && sets[g] < 6);
  return (
    <div className={`muscle-map${compact ? ' compact' : ''}`}>
      <div className="mm-figures" aria-label={`Working sets in the last 7 days: ${summary}`}>
        <Figure regions={FRONT} sets={sets} label="Front" />
        <Figure regions={BACK} sets={sets} label="Back" />
      </div>
      <div className="mm-legend">
        {LEVEL_LABEL.map((text, i) => <span key={text}><i className={`mm-swatch mm-l${i}`} />{text}</span>)}
      </div>
      {compact ? (
        <div className="mm-note">
          {untrained.length ? <span><b className="amber">Not trained this week:</b> {untrained.join(', ')}</span> : <span><b className="green">Every muscle trained this week.</b></span>}
          {low.length ? <span><b>Under 6 sets:</b> {low.join(', ')}</span> : null}
        </div>
      ) : (
        <div className="mm-sets">
          {groups.map((g) => (
            <span key={g} className={`mm-set mm-t${muscleLevel(sets[g])}`}>{g}<b>{sets[g] || 0}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}
