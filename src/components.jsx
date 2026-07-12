// ============================================================
// components.jsx - shared UI atoms, navigation, rings, charts
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import {
  Home, CalendarDays, Dumbbell, UtensilsCrossed, ScanLine, ListChecks, BarChart3, Settings2,
  X, Play, RotateCcw, Info, Check, Pill, Sparkles, FlaskConical, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

export const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'plan', label: 'Plan', icon: CalendarDays },
  { key: 'train', label: 'Train', icon: Dumbbell },
  { key: 'fuel', label: 'Fuel', icon: UtensilsCrossed },
  { key: 'body', label: 'Body', icon: ScanLine },
  { key: 'habits', label: 'Habits', icon: ListChecks },
  { key: 'stats', label: 'Stats', icon: BarChart3 },
  { key: 'more', label: 'More', icon: Settings2 },
];

// ---------- navigation ----------
export function BottomNav({ tab, setTab }) {
  return (
    <nav className="bottom-nav" role="tablist" aria-label="Primary">
      {TABS.map((t) => {
        const I = t.icon;
        const active = tab === t.key;
        return (
          <button key={t.key} className={active ? 'active' : ''} onClick={() => setTab(t.key)}
            role="tab" aria-selected={active} aria-label={t.label}>
            <I size={20} strokeWidth={active ? 2.4 : 2} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Sidebar({ tab, setTab, phase }) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="side-brand">
        <div className="brand-mark">R</div>
        <div>
          <b>Recomp OS</b>
          <span>Body Recomposition</span>
        </div>
      </div>
      {TABS.map((t) => {
        const I = t.icon;
        const active = tab === t.key;
        return (
          <button key={t.key} className={`side-link ${active ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <I size={19} strokeWidth={active ? 2.4 : 2} />
            {t.label}
          </button>
        );
      })}
      <div className="side-foot">
        <small>{phase.name}</small>
        <span className="num">Week {phase.week} / Day {phase.day}</span>
      </div>
    </aside>
  );
}

// ---------- atoms ----------
export const Eyebrow = ({ children }) => <div className="eyebrow">{children}</div>;
export const SectionTitle = ({ children, right }) => (
  <div className="section-title">{children}{right ? <span style={{ marginLeft: 'auto' }}>{right}</span> : null}</div>
);
export const Card = ({ children, className = '', ...rest }) => <div className={`card ${className}`} {...rest}>{children}</div>;
export const Chip = ({ children, tone = '' }) => <span className={`chip ${tone}`}>{children}</span>;

// Readable macro chips: "90 kcal · P 3g · C 12g · F 5g" that wrap cleanly on mobile
// and sit in a neat row on laptop. Numbers stay monospace, labels stay sans.
export function MacroChips({ kcal, p, c, f, fiber, waterL, size = 'md' }) {
  return (
    <div className={`macro-chips ${size}`}>
      {kcal != null ? <span className="mc kcal"><b>{kcal}</b> kcal</span> : null}
      {p != null ? <span className="mc p">P <b>{p}g</b></span> : null}
      {c != null ? <span className="mc c">C <b>{c}g</b></span> : null}
      {f != null ? <span className="mc f">F <b>{f}g</b></span> : null}
      {fiber != null ? <span className="mc fib">Fiber <b>{fiber}g</b></span> : null}
      {waterL != null ? <span className="mc w">Water <b>{waterL}L</b></span> : null}
    </div>
  );
}

// Renders a badminton / swimming style fuel plan from a data object.
export function FuelPlan({ plan, accent = 'var(--amber)', icon: Icon }) {
  if (!plan) return null;
  return (
    <div className="fuel-plan">
      <div className="fp-head">
        {Icon ? <Icon size={16} color={accent} /> : null}
        <div className="fp-title">{plan.title}</div>
        <span className="fp-window">{plan.window}</span>
      </div>
      {plan.sections.map((sec, i) => (
        <div className="fp-section" key={i}>
          <div className="fp-label" style={{ color: accent }}>{sec.label}</div>
          {sec.lead ? <p className="fp-lead">{sec.lead}</p> : null}
          {sec.options.map((opt, j) => (
            <div className="fp-opt" key={j}>
              <span className="fp-tag">{opt.tag}</span>
              <ul className="meal-items">{opt.items.map((it, k) => <li key={k}>{it}</li>)}</ul>
              {opt.macro ? <MacroChips {...opt.macro} size="sm" /> : null}
            </div>
          ))}
        </div>
      ))}
      {plan.thursdayRule ? <div className="fp-note amber"><b>Thursday:</b> {plan.thursdayRule}</div> : null}
      {plan.hydration ? <div className="fp-note"><b>Hydration:</b> {plan.hydration}</div> : null}
      {plan.coachNote ? <div className="fp-note coach"><b>Coach:</b> {plan.coachNote}</div> : null}
    </div>
  );
}

// Supplement timing + taken-today + weekly adherence dots.
// Purely presentational: parent passes data + handlers.
export function SupplementTiming({ items, takenMap = {}, onToggle, adherence, showConditional = false }) {
  const shown = items.filter((s) => !s.conditional || showConditional);
  const tagTone = { 'high-dose': 'red', maintenance: 'cyan', conditional: 'amber', optional: 'violet', daily: 'green' };
  return (
    <div className="supp-list">
      {shown.map((s) => {
        const taken = !!takenMap[s.key];
        const adh = adherence ? adherence(s.key) : null;
        return (
          <div className={`supp ${taken ? 'taken' : ''}`} key={s.key}>
            <button className={`check ${taken ? 'on' : ''}`} onClick={() => onToggle && onToggle(s.key)} aria-label={`Mark ${s.name} taken`}><Check size={15} /></button>
            <div className="supp-body">
              <div className="supp-top">
                <span className="supp-name">{s.name}</span>
                {s.tag ? <span className={`chip ${tagTone[s.tag] || ''}`}>{s.tag === 'high-dose' ? 'High dose' : s.tag}</span> : null}
              </div>
              <div className="supp-meta">
                <span className="num">{s.dose}</span> · {s.timing}{s.withFood && s.withFood !== 'Either' ? ` · ${s.withFood}` : ''}
              </div>
              <div className="supp-purpose">{s.purpose}</div>
              {s.caution ? <div className="supp-caution"><AlertTriangle size={12} /> {s.caution}</div> : null}
              {adh ? (
                <div className="supp-week">
                  <span className="sw-lab">7-day</span>
                  <span className="sw-dots">{Array.from({ length: adh.of }).map((_, i) => <i key={i} className={i < adh.taken ? 'on' : ''} />)}</span>
                  <span className="sw-pct num">{adh.taken}/{adh.of}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Hair-protection card. checks = [{tone:'ok'|'warn'|'info', text}], config from data.
export function HairHealthCard({ checks = [], config, labWarning }) {
  return (
    <div className="hair-card">
      <div className="fp-head"><Sparkles size={16} color="var(--violet)" /><div className="fp-title">{config.title}</div></div>
      <p className="fp-lead">{config.intro}</p>
      {labWarning ? <div className="fp-note amber"><b>Labs:</b> {labWarning}</div> : null}
      <div className="food-coach" style={{ marginTop: 4 }}>
        {checks.map((c, i) => (
          <div className={`fc-line ${c.tone === 'warn' ? 'amber' : c.tone === 'ok' ? 'green' : 'cyan'}`} key={i}><span className="fc-dot" />{c.text}</div>
        ))}
      </div>
      <div className="hair-labs">
        {config.labReminders.map((r, i) => <div className="hl-item" key={i}>{r}</div>)}
      </div>
      <div className="supp-caution" style={{ marginTop: 8 }}><Info size={12} /> {config.disclaimer}</div>
    </div>
  );
}

// Labs snapshot row list.
export function LabsCard({ labs = [] }) {
  const tone = { good: 'green', watch: 'amber', high: 'red' };
  return (
    <div className="labs-list">
      <div className="fp-head"><FlaskConical size={16} color="var(--cyan)" /><div className="fp-title">Labs snapshot</div></div>
      {labs.map((l) => (
        <div className="lab-row" key={l.key}>
          <div className="lab-main">
            <span className="lab-label">{l.label}</span>
            <span className={`chip ${tone[l.status] || ''}`}>{l.status === 'good' ? 'Good' : l.status === 'watch' ? 'Monitor' : 'High'}</span>
          </div>
          <div className="lab-val num">{l.value}</div>
          <div className="lab-note">{l.note}</div>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ pct, color = 'var(--cyan)' }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return <div className="pbar"><i style={{ width: `${p}%`, background: color }} /></div>;
}

export function StatCell({ k, v, unit, delta, deltaDir }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}{unit ? <small> {unit}</small> : null}</div>
      {delta != null ? <div className={`delta ${deltaDir || 'flat'}`}>{delta}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, sub }) {
  const I = icon || Info;
  return (
    <div className="empty">
      <I size={30} />
      <p style={{ color: 'var(--muted)', fontWeight: 600 }}>{title}</p>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}

export function Banner({ tone = 'cyan', icon, children }) {
  const I = icon;
  return (
    <div className={`banner ${tone}`}>
      {I ? <I size={17} style={{ flex: '0 0 17px', marginTop: 1, color: `var(--${tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : tone === 'violet' ? 'violet' : 'cyan'})` }} /> : null}
      <p>{children}</p>
    </div>
  );
}

// ---------- metric ring (bioscan dial) ----------
export function MetricRing({ pct = 0, value, sub, label, color = 'var(--cyan)', size = 64, stroke = 7 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const off = c - (p / 100) * c;
  return (
    <div className="ring-wrap">
      <div className="ring" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div className="ring-val"><b>{value}</b>{sub ? <small>{sub}</small> : null}</div>
      </div>
      {label ? <div className="ring-label">{label}</div> : null}
    </div>
  );
}

export function ScoreRing({ score, size = 96 }) {
  const color = score >= 80 ? 'var(--green)' : score >= 55 ? 'var(--cyan)' : score >= 35 ? 'var(--amber)' : 'var(--red)';
  return <MetricRing pct={score} value={score} sub="/100" color={color} size={size} stroke={9} />;
}

// ---------- coach insights ----------
export function CoachInsights({ items }) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className={`insight ${it.type}`}>
          <span className="dot" />
          <p>{it.text}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- rest timer ----------
export function RestTimer({ seconds = 90, label = 'Rest' }) {
  const [left, setLeft] = useState(null);
  const ref = useRef(null);
  useEffect(() => () => clearInterval(ref.current), []);
  const start = () => {
    clearInterval(ref.current);
    setLeft(seconds);
    ref.current = setInterval(() => {
      setLeft((x) => { if (x <= 1) { clearInterval(ref.current); return 0; } return x - 1; });
    }, 1000);
  };
  const reset = () => { clearInterval(ref.current); setLeft(null); };
  const mm = left != null ? Math.floor(left / 60) : Math.floor(seconds / 60);
  const ss = left != null ? left % 60 : seconds % 60;
  const face = `${mm}:${String(ss).padStart(2, '0')}`;
  return (
    <div className="rest-timer">
      <span className={`rt-face ${left === 0 ? 'zero' : ''}`}>{left === 0 ? 'Go' : face}</span>
      {left == null || left === 0
        ? <button className="btn xs" onClick={start}><Play size={13} /> {label} {seconds}s</button>
        : <button className="btn xs ghost" onClick={reset}><RotateCcw size={13} /> Reset</button>}
    </div>
  );
}

// ---------- bottom sheet / modal ----------
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="card-head" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn xs ghost" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- charts ----------
const AXIS = { fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', fill: '#8a97a3' };
const tooltipStyle = { background: '#141a22', border: '1px solid #253039', borderRadius: 10, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: '#e8edf2' };

export function LineTrend({ data, lines, xKey = 'label', tall = false, yDomain }) {
  return (
    <div className={`chart-h ${tall ? 'tall' : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#1c242d" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: '#253039' }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={yDomain || ['auto', 'auto']} width={44} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#8a97a3' }} />
          {lines.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name || l.key} stroke={l.color}
              strokeWidth={2.2} dot={{ r: 2.5, fill: l.color }} activeDot={{ r: 4 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarMini({ data, color = '#34d0de', xKey = 'label', yKey = 'value', tall = false }) {
  return (
    <div className={`chart-h ${tall ? 'tall' : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#1c242d" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: '#253039' }} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(52,208,222,0.08)' }} />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// small inline numeric input used across tabs
export function NumInput({ value, onChange, placeholder, style }) {
  return (
    <input className="input mono" inputMode="decimal" value={value ?? ''} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} style={style} />
  );
}
