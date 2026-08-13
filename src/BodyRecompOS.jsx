// ============================================================
// BodyRecompOS.jsx - the whole app: state + eight tabs
// Mobile: bottom nav, single column. Desktop: sidebar + multi-column splits.
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Check, Download, Upload, RotateCcw,
  Droplets, Footprints, Moon, Flame, Activity, Waves, TrendingUp, Trophy, Target,
  AlertTriangle, Watch, Pencil, Trash2, Info, Save, Beef, Leaf, Timer, Zap, Dumbbell,
  Sparkles, ArrowLeftRight,
} from 'lucide-react';

import {
  PROGRAM, NUTRITION, SUPPLEMENTS, HABITS, SCAN_FIELDS, WATCH_FIELDS, DAY_SHORT,
  EXERCISES, PROGRAM_RATIONALE, BADMINTON_FUEL, SWIMMING_FUEL, DAY_VARIANTS,
  LABS, HAIR_HEALTH, DAILY_BEVERAGES,
} from './data.js';
import {
  todayKey, addDays, prettyDate, shortDate, dowOf, clone, fastEndTime,
  dayFlags, resolveWorkout, resolveNutrition, initSession,
  blockDone, workoutProgress, nutritionActuals, nutritionAdherence,
  watchFor, recoveryScore, habitStatus, habitPct, dailyScore, coachInsights,
  phaseInfo, programCalendar, sortedScans, latestScan, baselineScan, nextScanCountdown, monthlyTargetProgress,
  volumeByMuscle, volumeByExercise, supersetStats, finisherStats, weeklyVolumeSeries,
  allSetRecords, getBestPerformance, exportJSON, workoutCSV, download, validateImport,
  defaultState, loadState, saveState, mergeSyncedState,
  supplementAdherence, hairHealthChecks, daysToLab,
  nutritionProfile, volumeTrend, muscleBalance, fmtVol, parseHealthParams, muscleWeekTrend,
  recompSignal, consistencyStreak, energyBalance, proteinPerLbLean, trainingLoadSummary,
  customExercisePlanFits, workoutSwapPartner, workoutSessionHasData,
} from './helpers.js';
import {
  Sidebar, BottomNav, Card, Chip, SectionTitle, MetricRing, ScoreRing, ProgressBar,
  StatCell, CoachInsights, Sheet, Banner, EmptyState, LineTrend, BarMini,
  MacroChips, FuelPlan, SupplementTiming, HairHealthCard, LabsCard,
  TargetsFromScan, MealCard, HeroGauge, RecompSignalCard,
} from './components.jsx';
import { BlockLogger, AddExercisePicker, makeUnplannedEntry } from './loggers.jsx';
import { generateDemoData } from './demo.js';
import { deriveSync, pullRemote, pushRemote } from './sync.js';

// the sync passphrase lives on-device only, in its own key, so it never
// ends up inside an exported JSON backup.
const SYNC_SECRET_KEY = 'recomp-sync-secret';
const SYNC_UPDATED_KEY = 'recomp-sync-updated';
const getSyncSecret = () => { try { return localStorage.getItem(SYNC_SECRET_KEY) || ''; } catch { return ''; } };
const setSyncSecret = (v) => { try { if (v) localStorage.setItem(SYNC_SECRET_KEY, v); else localStorage.removeItem(SYNC_SECRET_KEY); } catch { /* ignore */ } };

// ---------- small shared pieces ----------
function DateNav({ date, setDate }) {
  const isToday = date === todayKey();
  return (
    <div className="date-nav">
      <button className="nav-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button>
      <div className="dn-mid">
        <b>{prettyDate(date)}</b>
        <span>{isToday ? 'Today' : dayFlags(date).dow === 0 ? 'Sunday' : ''}</span>
        {!isToday ? <button className="btn xs ghost" style={{ marginTop: 4 }} onClick={() => setDate(todayKey())}>Jump to today</button> : null}
      </div>
      <button className="nav-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={18} /></button>
    </div>
  );
}

function ActivityToggles({ date, ctx }) {
  const flags = dayFlags(date, ctx.state);
  const act = ctx.state.activity[date] || {};
  if (!flags.badmintonAvailable && !flags.swimDay) return null;
  return (
    <div className="toggle-chips">
      {flags.badmintonAvailable ? (
        <button className={`toggle-chip ${act.badminton ? 'on' : ''}`} onClick={() => ctx.toggleActivity(date, 'badminton')}>
          <Activity size={15} /> Badminton
        </button>
      ) : null}
      {flags.swimDay ? (
        <button className={`toggle-chip ${act.swim ? 'on' : ''}`} onClick={() => ctx.toggleActivity(date, 'swim')}>
          <Waves size={15} /> Swim
        </button>
      ) : null}
    </div>
  );
}

function DayNutritionMode({ date, ctx }) {
  const mode = (ctx.state.dayOverrides && ctx.state.dayOverrides[date]) || '';
  const scheduled = DAY_VARIANTS[PROGRAM.days[dowOf(date)].dayType] || DAY_VARIANTS.training;
  return (
    <Card className="pad-sm">
      <div className="block-tag"><span className="bar" />Food plan for {shortDate(date)}</div>
      <div className="pill-toggle">
        <button className={mode === '' ? 'active' : ''} onClick={() => ctx.setDayOverride(date, '')}>Scheduled</button>
        <button className={mode === 'veg' ? 'active' : ''} onClick={() => ctx.setDayOverride(date, 'veg')}>Vegetarian</button>
        <button className={mode === 'fast1' ? 'active' : ''} onClick={() => ctx.setDayOverride(date, 'fast1')}>Fast to 1 PM</button>
        <button className={mode === 'fast2' || mode === 'fast' ? 'active' : ''} onClick={() => ctx.setDayOverride(date, 'fast2')}>Fast to 2 PM</button>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>Scheduled is {scheduled.label}. An override changes meals, targets and nutrition totals for this date only. The workout and existing logs stay in place.</div>
    </Card>
  );
}

function ActivityRows({ items, icon }) {
  const I = icon;
  if (!items || items.length === 0) return null;
  return (
    <div>
      {items.map((a, i) => (
        <div className="row" key={i}>
          <I size={17} color="var(--muted)" style={{ flex: '0 0 17px' }} />
          <div className="row-main">
            <div className="row-title">{a.name}</div>
            <div className="row-sub">{a.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// HOME
// =====================================================================
function HomeTab({ ctx }) {
  const date = todayKey();
  const s = ctx.state;
  const plan = resolveWorkout(date, s);
  const nut = resolveNutrition(date, s);
  const flags = dayFlags(date, s);
  const fastEnd = fastEndTime(date, s);
  const act = s.activity[date] || {};
  const a = nutritionActuals(date, s);
  const w = watchFor(date, s);
  const score = dailyScore(date, s);
  const phase = phaseInfo(s);
  const scan = nextScanCountdown(s);
  const target = monthlyTargetProgress(s);
  const insights = coachInsights(date, s, new Date());
  const session = s.workoutSessions[date];
  const prog = session ? workoutProgress(session) : { done: 0, total: plan.blocks.length };

  const steps = parseFloat(w.steps) || 0;
  const sleep = parseFloat(w.sleepH) || 0;

  // new premium "meaningful numbers" (all derived from existing data)
  const recomp = recompSignal(s);
  const eb = energyBalance(date, s);
  const ppl = proteinPerLbLean(s);
  const rec = recoveryScore(date, s);
  const streak = consistencyStreak(s);
  const tl = trainingLoadSummary(s);
  const firstName = s.profile.name.split(' ')[0];
  const hr = new Date().getHours();
  const greetWord = hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening';
  const heroSummary = `${plan.blocks.length ? `${plan.focus} session — ${prog.total || plan.blocks.length} blocks.` : `${plan.title} today.`} Fuel ${nut.targets.kcal} kcal · ${nut.targets.protein}g protein.`;

  const goalRings = [
    { label: 'Protein', value: Math.round(a.protein), sub: `/${nut.targets.protein}`, pct: (a.protein / nut.targets.protein) * 100, color: 'var(--cyan)' },
    { label: 'Water L', value: a.water, sub: `/${nut.targets.waterL}`, pct: (a.water / nut.targets.waterL) * 100, color: 'var(--violet)' },
    { label: 'Steps', value: steps >= 1000 ? (steps / 1000).toFixed(1) + 'k' : steps, sub: '/10k', pct: (steps / 10000) * 100, color: 'var(--amber)' },
    { label: 'Sleep', value: sleep || '-', sub: '/7.5', pct: (sleep / 7.5) * 100, color: 'var(--green)' },
  ];

  return (
    <div>
      <HeroGauge
        greeting={`${greetWord}, ${firstName}`}
        score={score.score}
        chips={[{ label: `${plan.title} · ${plan.focus}`, tone: 'cyan' }, { label: phase.name, tone: 'violet' }]}
        summary={heroSummary}
      />
      <div className="hero-adherence">Habits {score.hp}% · Nutrition {score.na}% · Training {score.wa}% · Recovery {score.rec}%</div>

      <div className="split">
        <div className="split-main">
          <RecompSignalCard signal={recomp} />

          <SectionTitle>Today goals</SectionTitle>
          <Card>
            <div className="ring-grid">
              {goalRings.map((g) => (
                <MetricRing key={g.label} pct={g.pct} value={g.value} sub={g.sub} label={g.label} color={g.color} size={68} />
              ))}
            </div>
          </Card>

          <div className="mnum-grid">
            <div className="mnum"><div className="mnum-k">Energy balance</div><div className="mnum-v amber">{eb.hasData ? `${eb.net > 0 ? '+' : ''}${eb.net}` : '—'} <small>kcal</small></div></div>
            <div className="mnum"><div className="mnum-k">Protein / lean lb</div><div className="mnum-v cyan">{ppl ? ppl.value : '—'} <small>g/lb</small></div></div>
            <div className="mnum"><div className="mnum-k">Recovery</div><div className="mnum-v green">{rec.pct} <small>%</small></div></div>
            <div className="mnum"><div className="mnum-k">Streak</div><div className="mnum-v violet">{streak} <small>day{streak === 1 ? '' : 's'}</small></div></div>
          </div>

          <SectionTitle right={tl.trend.pct != null ? <Chip tone={tl.trend.up ? 'green' : 'amber'}>{tl.trend.up ? '+' : ''}{tl.trend.pct}% vol</Chip> : null}>Training load</SectionTitle>
          <Card className="pad-sm">
            <div className="train-load">
              <div className="tl-cell"><div className="tl-k">This week volume</div><div className="tl-v">{fmtVol(tl.trend.current)}</div><div className="tl-sub">last full {fmtVol(tl.trend.lastFull)}</div></div>
              <div className="tl-cell"><div className="tl-k">Hard sets</div><div className="tl-v">{tl.hardSets}</div><div className="tl-sub">logged this week</div></div>
              <div className="tl-cell"><div className="tl-k">Top e1RM</div><div className="tl-v">{tl.top ? tl.top.e1rm : '-'}<small> lb</small></div><div className="tl-sub">{tl.top ? tl.top.name : 'log a lift'}</div></div>
              <div className="tl-cell"><div className="tl-k">Muscle focus</div><div className="tl-v" style={{ fontSize: 14 }}>{tl.lagging ? tl.lagging.muscle : 'Balanced'}</div><div className="tl-sub">{tl.lagging ? 'add sets' : 'all covered'}</div></div>
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={() => ctx.goto('stats')}>Open Stats</button></div>
          </Card>

          <SectionTitle>Today plan</SectionTitle>
          <Card>
            <div className="card-head"><div className="lead"><Dumbbell size={17} color="var(--cyan)" /><h3>{plan.title}</h3></div>
              <Chip tone={prog.total && prog.done === prog.total ? 'green' : 'cyan'}>{prog.done}/{prog.total || plan.blocks.length} blocks</Chip></div>
            {plan.blocks.length ? plan.blocks.map((b) => (
              <div className="row" key={b.id}>
                <span className={`block-kind ${b.blockType}`}>{b.blockType[0].toUpperCase()}</span>
                <div className="row-main"><div className="row-title">{b.name}</div></div>
              </div>
            )) : <div className="row"><div className="row-main"><div className="row-title muted">Recovery day, no lifting</div></div></div>}
            <ActivityRows items={plan.sport} icon={Activity} />
            <ActivityRows items={plan.conditioning} icon={Waves} />
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn primary sm" onClick={() => ctx.goto('train')}>Open Train</button>
              <button className="btn ghost sm" onClick={() => ctx.goto('plan')}>See week</button>
            </div>
          </Card>

          <SectionTitle>Today rules</SectionTitle>
          <div className="grid-2">
            <Card className="pad-sm">
              <div className="stat-grid">
                <StatCell k="Swim" v={flags.swimDay ? 'Yes (PM)' : 'No'} />
                <StatCell k="Badminton" v={flags.badmintonAvailable ? (act.badminton ? 'Done' : 'Optional') : 'No'} />
                <StatCell k="Fasting" v={fastEnd ? `Until ${fastEnd.label}` : 'No'} />
                <StatCell k="Vegetarian" v={flags.vegDay ? 'Yes' : 'No'} />
              </div>
            </Card>
            <Card className="pad-sm">
              <div className="block-tag"><span className="bar" />Supplements</div>
              {SUPPLEMENTS.map((sp) => (
                <div className="row" key={sp.key}>
                  <div className="row-main"><div className="row-title">{sp.name}</div><div className="row-sub">{sp.dose} · {sp.timing}</div></div>
                </div>
              ))}
            </Card>
          </div>

          {(() => {
            const prof = nut.profile;
            const tips = [];
            if (prof) tips.push({ tone: 'cyan', text: `Today: ${nut.targets.kcal} kcal · ${nut.targets.protein}g protein · ${nut.targets.carbs}g carbs. A ${prof.deficitPct}% cut from your ${prof.tdee} maintenance, with protein set from your ${prof.leanMass} lb lean mass to hold muscle and hair.` });
            if (flags.badmintonAvailable) tips.push({ tone: 'amber', text: act.badminton ? 'Badminton played: add electrolytes and 30-50g carbs, water +0.5 L, protein unchanged.' : 'Badminton optional today: if played, keep pre-court food light and refuel with whey plus a banana after.' });
            if (flags.swimDay) tips.push({ tone: 'cyan', text: fastEnd ? `Fast until ${fastEnd.label}, break gently with vegetarian food, then keep the pre-swim meal light and protein-focused.` : 'Swim tonight: keep the pre-swim snack light and prioritise protein after class.' });
            if (fastEnd && !flags.swimDay) tips.push({ tone: 'amber', text: `Fast until ${fastEnd.label}: water, black coffee and green tea only, followed by the vegetarian plan.` });
            if (flags.vegDay) tips.push({ tone: 'green', text: 'Vegetarian day: hit protein with whey, tofu, Greek yogurt, dal and measured paneer.' });
            if (a.protein < nut.targets.protein * 0.6) tips.push({ tone: 'cyan', text: `Protein at ${Math.round(a.protein)}g of ${nut.targets.protein}g. Add a whey shake or Greek yogurt.` });
            if (a.water < nut.targets.waterL * 0.6) tips.push({ tone: 'violet', text: 'Water is behind. Drink 500 ml now and keep a bottle in sight.' });
            const dtl = daysToLab(s);
            if (s.settings.labWarningOn && dtl != null && dtl >= 0 && dtl <= 7) tips.push({ tone: 'amber', text: `Blood work in ${dtl} day${dtl === 1 ? '' : 's'}. High-dose biotin can skew results, pause it and tell the lab.` });
            // evergreen guidance only fills the leftover slots, so live/actionable tips win the top
            const evergreen = [
              { tone: 'green', text: 'LDL 123 and HbA1c 5.6 are the watch items: keep paneer measured, skip fried food and sugary drinks, pair carbs with protein.' },
              { tone: 'violet', text: 'Protect hair: hold protein steady and avoid crash dieting through the fat-loss phase.' },
            ];
            for (const e of evergreen) { if (tips.length >= 5) break; tips.push(e); }
            return (
              <>
                <SectionTitle>Food coach</SectionTitle>
                <Card className="pad-sm">
                  <div className="food-coach">
                    {tips.slice(0, 6).map((tp, i) => (
                      <div className={`fc-line ${tp.tone}`} key={i}><span className="fc-dot" />{tp.text}</div>
                    ))}
                  </div>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button className="btn ghost sm" onClick={() => { ctx.setSelDate(date); ctx.goto('fuel'); }}>Open Fuel</button>
                  </div>
                </Card>
              </>
            );
          })()}
        </div>

        <div className="split-aside">
          <SectionTitle>Coach insights</SectionTitle>
          <Card><CoachInsights items={insights} /></Card>

          <SectionTitle>Goal & pace</SectionTitle>
          <Card>
            <div className="pbar-row"><span className="lab">Fat lost toward goal</span><span className="val num">{target.lost} / {target.goal} lb</span></div>
            <ProgressBar pct={target.pct} color="var(--green)" />
            {nut.profile ? (
              <div className="hint" style={{ marginTop: 8 }}>
                At your {nut.profile.deficitPct}% cut (~{nut.profile.lbPerWeek} lb/week){nut.profile.weeksToGoal ? `, you'd reach the ${target.goal} lb goal in about ${nut.profile.weeksToGoal} weeks` : ''}. Body fat {latestScan(s)?.bodyFatPct}% → goal {nut.profile.goalBodyFatPct}%.
              </div>
            ) : null}
            <div className="divider" />
            <div className="stat-grid">
              <StatCell k="Next scan in" v={scan ? Math.max(0, scan.days) : '-'} unit="days" />
              <StatCell k="Waist goal" v={s.profile.goalWaistIn} unit="in" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PLAN
// =====================================================================
function PlanTab({ ctx }) {
  const [date, setDate] = useState(ctx.selDate);
  const s = ctx.state;
  // Monday of the week containing date
  const monday = useMemo(() => { const d = dowOf(date); const back = (d + 6) % 7; return addDays(date, -back); }, [date]);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const plan = resolveWorkout(date, s);
  const nut = resolveNutrition(date, s);
  const flags = dayFlags(date, s);

  return (
    <div>
      <div className="page-title">Planner</div>
      <p className="page-sub">Weekly plan built from your Upper / Lower hybrid. Tap a day to see the workout and meals.</p>

      <div className="date-nav">
        <button className="nav-btn" onClick={() => setDate(addDays(monday, -7))} aria-label="Previous week"><ChevronLeft size={18} /></button>
        <div className="dn-mid"><b>Week of {shortDate(monday)}</b><span>{prettyDate(date)}</span></div>
        <button className="nav-btn" onClick={() => setDate(addDays(monday, 7))} aria-label="Next week"><ChevronRight size={18} /></button>
      </div>

      <div className="week-grid">
        {week.map((k) => {
          const wp = resolveWorkout(k, s);
          const f = dayFlags(k, s);
          const cls = `week-day ${k === todayKey() ? 'today' : ''} ${k === date ? 'selected' : ''}`;
          return (
            <button className={cls} key={k} onClick={() => setDate(k)}>
              <div className="wd-top"><span className="wd-dow">{DAY_SHORT[dowOf(k)]}</span><span className="wd-num">{shortDate(k)}</span></div>
              <div className="wd-title">{wp.title}</div>
              <div className="wd-focus">{wp.focus}</div>
              <div className="wd-tags">
                {workoutSwapPartner(k, s) ? <span className="wd-tag swapped">swapped</span> : null}
                {f.swimDay ? <span className="wd-tag">swim</span> : null}
                {f.fastDay ? <span className="wd-tag">fast</span> : null}
                {f.vegDay ? <span className="wd-tag">veg</span> : null}
                {f.badmintonAvailable ? <span className="wd-tag">badm</span> : null}
              </div>
            </button>
          );
        })}
      </div>

      <DayNutritionMode date={date} ctx={ctx} />

      <div className="split" style={{ marginTop: 8 }}>
        <div className="split-main">
          <SectionTitle right={<Chip tone="cyan">{plan.focus}</Chip>}>{plan.title}</SectionTitle>
          {plan.isClassDay ? (
            <Card>
              <div className="card-head"><h3>Saturday choice</h3></div>
              <div className="pill-toggle">
                <button className={(s.saturdayMode[date] || 'class') === 'class' ? 'active' : ''} onClick={() => ctx.setSatMode(date, 'class')}>BodyBalance</button>
                <button className={s.saturdayMode[date] === 'fallback' ? 'active' : ''} onClick={() => ctx.setSatMode(date, 'fallback')}>Full Body fallback</button>
              </div>
              <div className="hint" style={{ marginTop: 8 }}>{plan.usingFallback ? 'Showing the lifting fallback for a missed class.' : 'Showing the mobility class. Switch if you miss it.'}</div>
            </Card>
          ) : null}

          {plan.notes ? <Banner tone={flags.fastDay ? 'amber' : flags.vegDay ? 'green' : 'cyan'} icon={flags.fastDay ? Timer : Info}>{plan.notes}</Banner> : null}

          {plan.blocks.length ? (
            <Card>
              {plan.blocks.map((b) => (
                <div key={b.id} style={{ marginBottom: 12 }}>
                  <div className="block-tag"><span className="bar" />{b.name} <span className={`block-kind ${b.blockType}`} style={{ marginLeft: 6 }}>{b.blockType}</span></div>
                  {b.blockType === 'single' || b.blockType === 'dropset' ? (
                    <div className="target-line">
                      <span className="tt">Sets <b>{b.exercises[0].sets}</b></span>
                      <span className="tt">Reps <b>{b.exercises[0].repLow}-{b.exercises[0].repHigh}</b></span>
                      <span className="tt">RPE <b>{b.exercises[0].rpe}</b></span>
                      <span className="tt rest">Rest <b>{b.exercises[0].restSec}s</b></span>
                      <span className="tt">Tempo <b>{b.exercises[0].tempo}</b></span>
                    </div>
                  ) : (
                    <div>
                      <div className="target-line">
                        <span className="tt">Rounds <b>{b.rounds}</b></span>
                        <span className="tt rest">Rest/round <b>{b.restAfterRoundSec}s</b></span>
                      </div>
                      <ul className="meal-items">
                        {b.exercises.map((e) => <li key={e.name}>{e.name} — {e.targetReps} @ RPE {e.targetRpe}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          ) : null}

          <ActivityRows items={plan.mobility} icon={Activity} />
          {plan.mobility.length ? null : null}
          {(plan.conditioning.length || plan.sport.length) ? (
            <Card><ActivityRows items={plan.conditioning} icon={Waves} /><ActivityRows items={plan.sport} icon={Activity} /></Card>
          ) : null}
        </div>

        <div className="split-aside">
          <SectionTitle>Meal plan</SectionTitle>
          <Card>
            {(() => { const dv = DAY_VARIANTS[nut.dayType] || DAY_VARIANTS.training; return (
              <div className="day-variant">
                <div className={`block-tag ${dv.tone}`}><span className="bar" />{dv.label}</div>
                <p className="dv-why">{dv.why}</p>
              </div>
            ); })()}
            <MacroChips kcal={nut.targets.kcal} p={nut.targets.protein} c={nut.targets.carbs} f={nut.targets.fat} fiber={nut.targets.fiber} waterL={nut.targets.waterL} />
            <div className="hint" style={{ margin: '6px 0 4px' }}>Targets derived from your {nut.profile?.scanDate || 'latest'} scan. First option shown — open Fuel to swap.</div>
            <div style={{ height: 4 }} />
            {nut.meals.map((m, i) => <MealCard key={i} meal={m} index={i} />)}
            <div className="btn-row" style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={() => { ctx.setSelDate(date); ctx.goto('fuel'); }}>Log meals</button></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// TRAIN
// =====================================================================
function TrainTab({ ctx }) {
  const [date, setDate] = useState(ctx.selDate);
  const [collapsed, setCollapsed] = useState({});
  const [adding, setAdding] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapDate, setSwapDate] = useState(addDays(ctx.selDate, 1));
  const [swapNotice, setSwapNotice] = useState('');
  const s = ctx.state;
  const plan = resolveWorkout(date, s);
  const session = ctx.getSession(date);
  const flags = dayFlags(date, s);
  const prog = workoutProgress(session);
  const insights = coachInsights(date, s, new Date());
  const rec = recoveryScore(date, s);
  const balance = muscleBalance(s);
  const balanceTip = balance.hints[0];
  const fastEnd = fastEndTime(date, s);
  const swapPartner = workoutSwapPartner(date, s);
  const targetSwapPartner = swapDate ? workoutSwapPartner(swapDate, s) : '';
  const currentWorkoutStarted = workoutSessionHasData(s.workoutSessions && s.workoutSessions[date]);
  const targetWorkoutStarted = swapDate ? workoutSessionHasData(s.workoutSessions && s.workoutSessions[swapDate]) : false;
  const partnerWorkoutStarted = swapPartner ? workoutSessionHasData(s.workoutSessions && s.workoutSessions[swapPartner]) : false;
  const scheduledTargetPlan = swapDate && swapDate !== date
    ? resolveWorkout(swapDate, { ...s, workoutSwaps: {} })
    : null;
  const targetFlags = swapDate ? dayFlags(swapDate, s) : null;
  const hardFastConflict = !!scheduledTargetPlan && (
    (targetFlags && targetFlags.fastDay && plan.intensity === 'Hard')
    || (flags.fastDay && scheduledTargetPlan.intensity === 'Hard')
  );
  let swapBlockReason = '';
  if (!swapDate || swapDate === date) swapBlockReason = 'Choose a different date.';
  else if (hardFastConflict) swapBlockReason = 'A hard lifting workout cannot be moved onto a fasting day. Choose a non-fasting date or change that date’s nutrition mode first.';
  else if (currentWorkoutStarted) swapBlockReason = 'This workout already has logged data. Finish it here or remove those entries before swapping.';
  else if (targetWorkoutStarted) swapBlockReason = `${prettyDate(swapDate)} already has logged workout data, so it cannot be replaced.`;
  else if (targetSwapPartner && targetSwapPartner !== date) swapBlockReason = `${prettyDate(swapDate)} is already part of another swap. Undo that swap first.`;
  const undoBlockReason = currentWorkoutStarted || partnerWorkoutStarted
    ? 'This swap is locked because one of the two dates now has logged workout data.'
    : '';

  const openSwap = () => {
    setSwapDate(swapPartner || addDays(date, 1));
    setSwapNotice('');
    setSwapping(true);
  };

  const planIds = new Set(plan.blocks.map((b) => b.id));
  const extraIds = Object.keys(session.entries).filter((id) => !planIds.has(id));
  // an added exercise renders right after the block it was inserted at, not
  // always at the end - falls back to the end if that block no longer exists
  // (e.g. the plan changed) or none was chosen.
  const extrasByAfter = {};
  const startExtras = [];
  const endExtras = [];
  extraIds.forEach((id) => {
    const afterId = session.entries[id].afterBlockId;
    if (afterId === '__start__') startExtras.push(id);
    else if (afterId && planIds.has(afterId)) (extrasByAfter[afterId] = extrasByAfter[afterId] || []).push(id);
    else endExtras.push(id);
  });
  const insertPositions = [
    { id: '__start__', label: 'At the start' },
    ...plan.blocks.map((b) => ({ id: b.id, label: `After: ${b.name}` })),
    { id: null, label: 'At the end' },
  ];

  const blockFromEntry = (id, entry) => ({
    id, blockType: 'single', name: entry.name || entry.exName,
    exercises: [{ name: entry.replacedWith || entry.exName, sets: (entry.sets || []).length || 3, repLow: 8, repHigh: 12, rpe: 8, restSec: 90, tempo: '2-1-1' }],
  });

  const renderBlock = (block) => {
    const entry = session.entries[block.id];
    if (!entry) return null;
    const done = blockDone(entry);
    const open = collapsed[block.id] !== true;
    const toggleOpen = () => setCollapsed((c) => ({ ...c, [block.id]: !open ? false : true }));
    return (
      <div className={`block-card ${done ? 'done' : ''}`} key={block.id}>
        <div className="block-head" role="button" tabIndex={0} aria-expanded={open} aria-controls={`block-body-${block.id}`}
          onClick={toggleOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(); } }}>
          <div className="bh-lead">
            <span className={`block-status ${done ? 'on' : ''}`} />
            <div>
              <div className="block-title">{block.name}</div>
              <div style={{ marginTop: 4 }}>
                <span className={`block-kind ${block.blockType}`}>{block.blockType}</span>
                {entry.unplanned ? <span className="block-kind added">added</span> : null}
              </div>
            </div>
          </div>
          <ChevronDown size={18} color="var(--muted)" style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: '0.15s' }} />
        </div>
        {open ? (
          <div className="block-body" id={`block-body-${block.id}`}>
            <BlockLogger block={block} entry={entry} plan={plan} state={s} onMutate={(fn) => ctx.mutateEntry(date, block.id, fn)} setRestart={ctx.setRestart} />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <div className="page-title">Train</div>
      <DateNav date={date} setDate={setDate} />

      {swapNotice ? <Banner tone="cyan" icon={Check} role="status" aria-live="polite">{swapNotice}</Banner> : null}

      {balanceTip ? <Banner tone="amber" icon={AlertTriangle}>Balance check: {balanceTip.text}</Banner> : null}

      {plan.isClassDay ? (
        <Card className="pad-sm">
          <div className="pill-toggle">
            <button className={(s.saturdayMode[date] || 'class') === 'class' ? 'active' : ''} onClick={() => ctx.setSatMode(date, 'class')}>BodyBalance class</button>
            <button className={s.saturdayMode[date] === 'fallback' ? 'active' : ''} onClick={() => ctx.setSatMode(date, 'fallback')}>Full Body fallback</button>
          </div>
        </Card>
      ) : null}

      <div className="split wide-aside">
        <div className="split-main">
          <div className="card-head" style={{ marginBottom: 10 }}>
            <div className="lead"><h3 style={{ margin: 0 }}>{plan.title}</h3><Chip tone="cyan">{plan.focus}</Chip></div>
            <div className="workout-plan-actions">
              <Chip tone={prog.total && prog.done === prog.total ? 'green' : 'amber'}>{prog.done}/{prog.total} done</Chip>
              <button className="btn xs ghost" onClick={openSwap}><ArrowLeftRight size={14} /> Swap day</button>
            </div>
          </div>

          {swapPartner ? (
            <Banner tone="cyan" icon={ArrowLeftRight}>
              <b>Workout days swapped:</b> this is the {prettyDate(plan.sourceDate)} workout. The {prettyDate(date)} workout moved to {prettyDate(swapPartner)}. Nutrition stays on its original calendar date.
            </Banner>
          ) : null}

          <div className="workout-command">
            <div className="workout-command-copy">
              <span className="eyebrow"><Sparkles size={13} /> Build today’s session</span>
              <b>Add your equipment before the first planned movement—or place it exactly where you want.</b>
            </div>
            <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add exercise</button>
          </div>

          {startExtras.map((id) => renderBlock(blockFromEntry(id, session.entries[id])))}

          {plan.blocks.length === 0 ? (
            <Card><EmptyState icon={Waves} title="No lifting scheduled" sub={fastEnd ? `Recovery day: fast until ${fastEnd.label}, then follow the vegetarian plan.` : 'Recovery day. Use the mobility and conditioning below.'} /></Card>
          ) : plan.blocks.map((b) => (
            <React.Fragment key={b.id}>
              {renderBlock(b)}
              {(extrasByAfter[b.id] || []).map((id) => renderBlock(blockFromEntry(id, session.entries[id])))}
            </React.Fragment>
          ))}

          {endExtras.map((id) => renderBlock(blockFromEntry(id, session.entries[id])))}

          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => setAdding(true)}><Plus size={15} /> Add another exercise</button>
            <button className={`btn sm ${session.completed ? 'primary' : ''}`} onClick={() => ctx.patchSession(date, (x) => { x.completed = !x.completed; })}>
              <Check size={15} /> {session.completed ? 'Completed' : 'Mark complete'}
            </button>
          </div>

          {(plan.conditioning.length || plan.mobility.length || plan.sport.length) ? (
            <>
              <SectionTitle>Conditioning · mobility · sport</SectionTitle>
              <Card>
                <ActivityRows items={plan.conditioning} icon={Waves} />
                <ActivityRows items={plan.mobility} icon={Activity} />
                <ActivityRows items={plan.sport} icon={Activity} />
                <div style={{ marginTop: 10 }}><ActivityToggles date={date} ctx={ctx} /></div>
              </Card>
            </>
          ) : null}

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn ghost sm" onClick={() => download(`workout-${date}.csv`, workoutCSV(s), 'text/csv')}><Download size={14} /> Export CSV</button>
            <button className="btn ghost sm" onClick={() => download('recomp-os-backup.json', exportJSON(s))}><Download size={14} /> Export JSON</button>
          </div>
        </div>

        <div className="split-aside">
          <SectionTitle>Coach insights</SectionTitle>
          <Card><CoachInsights items={insights} /></Card>
          <SectionTitle>Recovery</SectionTitle>
          <Card>
            <div className="stat-grid">
              <StatCell k="Recovery" v={rec.pct} unit="%" />
              <StatCell k="Sleep" v={rec.sleep ?? '-'} unit="h" />
              <StatCell k="Resting HR" v={rec.rhr ?? '-'} unit="bpm" />
              <StatCell k="Max pain" v={rec.maxPain} unit="/5" />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>Enter sleep and resting HR in the Body tab Apple Watch panel to sharpen this.</div>
          </Card>
          <SectionTitle>Log activity</SectionTitle>
          <Card><ActivityToggles date={date} ctx={ctx} /></Card>
        </div>
      </div>

      {adding ? (
        <Sheet title="Add an exercise" onClose={() => setAdding(false)}>
          <AddExercisePicker state={s} positions={insertPositions} onPick={(name, afterId) => {
            const { id, entry } = makeUnplannedEntry(name, s, afterId);
            ctx.patchSession(date, (x) => { x.entries[id] = entry; });
            setAdding(false);
          }} />
        </Sheet>
      ) : null}

      {swapping ? (
        <Sheet title="Swap workout days" onClose={() => setSwapping(false)}>
          {swapPartner ? (
            <div className="workout-swap-sheet">
              <Banner tone="cyan" icon={ArrowLeftRight}>
                {prettyDate(date)} and {prettyDate(swapPartner)} exchange workouts. Meals, fasting, activities, and health logs remain on their original dates.
              </Banner>
              {undoBlockReason ? <Banner tone="amber" icon={AlertTriangle} role="alert">{undoBlockReason}</Banner> : null}
              <div className="btn-row">
                <button className="btn sm primary" disabled={!!undoBlockReason} onClick={() => {
                  ctx.clearWorkoutSwap(date);
                  setSwapNotice(`Restored the scheduled workouts for ${prettyDate(date)} and ${prettyDate(swapPartner)}.`);
                  setSwapping(false);
                }}>Undo this swap</button>
                <button className="btn sm ghost" onClick={() => setSwapping(false)}>Keep swap</button>
              </div>
            </div>
          ) : (
            <div className="workout-swap-sheet">
              <p className="sheet-intro">Choose the other date. The two planned workouts trade places, so weekly frequency and volume do not increase.</p>
              <div className="field">
                <label htmlFor="workout-swap-date">Swap {prettyDate(date)} with</label>
                <input id="workout-swap-date" className="input" type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} />
              </div>
              {scheduledTargetPlan ? (
                <div className="swap-preview" aria-live="polite">
                  <div><span>{prettyDate(date)}</span><b>{scheduledTargetPlan.title}</b></div>
                  <ArrowLeftRight size={18} aria-hidden="true" />
                  <div><span>{prettyDate(swapDate)}</span><b>{plan.title}</b></div>
                </div>
              ) : null}
              {swapBlockReason ? <Banner tone="amber" icon={AlertTriangle} role="alert">{swapBlockReason}</Banner> : null}
              <div className="hint">Only the workouts move. Nutrition, fasting, sports, Apple Health data, and completed logs stay attached to their dates.</div>
              <div className="btn-row">
                <button className="btn sm primary" disabled={!!swapBlockReason} onClick={() => {
                  ctx.swapWorkoutDates(date, swapDate);
                  setSwapNotice(`Swapped the workouts for ${prettyDate(date)} and ${prettyDate(swapDate)}.`);
                  setSwapping(false);
                }}><ArrowLeftRight size={14} /> Confirm swap</button>
                <button className="btn sm ghost" onClick={() => setSwapping(false)}>Cancel</button>
              </div>
            </div>
          )}
        </Sheet>
      ) : null}
    </div>
  );
}

// =====================================================================
// FUEL
// =====================================================================
function FuelTab({ ctx }) {
  const [date, setDate] = useState(ctx.selDate);
  const s = ctx.state;
  const nut = resolveNutrition(date, s);
  const flags = dayFlags(date, s);
  const fastEnd = fastEndTime(date, s);
  const a = nutritionActuals(date, s);
  const log = a.log;
  const adher = nutritionAdherence(date, s);
  const t = nut.targets;

  const bars = [
    { k: 'Calories', act: a.kcal, tgt: t.kcal, color: 'var(--amber)' },
    { k: 'Protein', act: a.protein, tgt: t.protein, color: 'var(--cyan)' },
    { k: 'Carbs', act: a.carbs, tgt: t.carbs, color: 'var(--green)' },
    { k: 'Fat', act: a.fat, tgt: t.fat, color: 'var(--violet)' },
  ];

  return (
    <div>
      <div className="page-title">Fuel</div>
      <DateNav date={date} setDate={setDate} />
      <DayNutritionMode date={date} ctx={ctx} />

      {fastEnd ? <Banner tone="amber" icon={Timer}>{fastEnd.noMoon ? 'No-moon fast' : 'Scheduled fast'} until {fastEnd.label}. Water, black coffee and green tea only, then follow the vegetarian plan.</Banner> : null}
      {flags.vegDay ? <Banner tone="green" icon={Leaf}>Vegetarian day. Chicken, fish, whole eggs and egg whites are unavailable. Lean on whey, paneer, tofu, dal and Greek yogurt.</Banner> : null}
      {nut.adjustments.map((adj, i) => <Banner key={i} tone="cyan" icon={Zap}>{adj}</Banner>)}

      <div className="split wide-aside">
        <div className="split-main">
          <TargetsFromScan profile={nut.profile} targets={t} dayLabel={(DAY_VARIANTS[nut.dayType] || DAY_VARIANTS.training).label} />

          {(() => { const dv = DAY_VARIANTS[nut.dayType] || DAY_VARIANTS.training; return (
            <SectionTitle right={<Chip tone={dv.tone}>{dv.label}</Chip>}>Food options for your goal</SectionTitle>
          ); })()}
          {(() => { const dv = DAY_VARIANTS[nut.dayType] || DAY_VARIANTS.training; return (
            <p className="dv-why standalone">{dv.why} Each meal has a few options — tap to swap. Chips show why each fits: high protein for fat loss, LDL-smart, low-GI for HbA1c.</p>
          ); })()}
          {nut.meals.map((m, i) => (
            <MealCard
              key={i}
              meal={m}
              index={i}
              eaten={!!(log.eaten && log.eaten[i])}
              choiceIndex={(log.choices && log.choices[i]) ?? 0}
              onToggleEaten={() => ctx.setMeal(date, (x) => { x.eaten[i] = !x.eaten[i]; })}
              onChoose={(ci) => ctx.setMeal(date, (x) => { if (!x.choices) x.choices = {}; x.choices[i] = ci; })}
            />
          ))}

          <SectionTitle>Quick add</SectionTitle>
          <Card>
            <div className="quick-grid">
              {NUTRITION.quickAdds.map((q, i) => {
                const dim = flags.vegDay && (q.meat || q.egg);
                return (
                  <button key={i} className={dim ? 'dim' : ''} disabled={dim}
                    onClick={() => ctx.setMeal(date, (x) => {
                      if (q.water) x.water = Math.round((x.water + q.water) * 100) / 100;
                      else x.extras.push({ label: q.label, p: q.p, c: q.c, f: q.f, kcal: q.kcal });
                    })}>
                    {q.label}
                  </button>
                );
              })}
            </div>
          </Card>

          {log.extras && log.extras.length ? (
            <Card>
              <div className="block-tag"><span className="bar" />Added foods</div>
              {log.extras.map((e, i) => (
                <div className="row" key={i}>
                  <div className="row-main"><div className="row-title">{e.label}</div><div className="row-sub">{e.kcal} kcal · P {e.p}g · C {e.c}g · F {e.f}g</div></div>
                  <button className="btn xs danger" onClick={() => ctx.setMeal(date, (x) => { x.extras.splice(i, 1); })} aria-label={`Remove ${e.label}`}><Trash2 size={13} /></button>
                </div>
              ))}
            </Card>
          ) : null}

          <SectionTitle>Daily drinks</SectionTitle>
          <Card>
            {DAILY_BEVERAGES.map((drink) => {
              const selected = !!(((s.beverageLogs || {})[date] || {})[drink.key]);
              const sportDay = flags.swimDay || !!((s.activity[date] || {}).badminton);
              return (
                <button type="button" className="row row-action" key={drink.key} onClick={() => ctx.toggleBeverage(date, drink.key)} aria-pressed={selected}>
                  <span className={`check ${selected ? 'on' : ''}`} aria-hidden="true"><Check size={15} /></span>
                  <span className="row-main">
                    <span className="row-title">{drink.label} · {drink.timing}</span>
                    <span className="row-sub">{drink.detail}{drink.sportOption ? ` ${sportDay ? 'Recommended for today’s activity.' : 'Water is the default on a normal day.'}` : ''}</span>
                  </span>
                  {drink.kcal ? <span className="num" style={{ fontSize: 11 }}>{drink.kcal} kcal</span> : null}
                </button>
              );
            })}
            <div className="hint" style={{ marginTop: 8 }}>Green tea is a beverage, not a fat-loss treatment. Coconut water contains carbohydrate and breaks a fast; choose unsweetened products and check the package label.</div>
          </Card>

          {flags.badmintonAvailable ? (
            <>
              <SectionTitle right={<Chip tone="amber">{(s.activity[date] || {}).badminton ? 'Played' : 'Optional'}</Chip>}>Badminton</SectionTitle>
              <Card><FuelPlan plan={BADMINTON_FUEL} accent="var(--amber)" icon={Activity} /></Card>
            </>
          ) : null}

          {flags.swimDay ? (
            <>
              <SectionTitle right={<Chip tone="cyan">{flags.fastDay ? 'Fast + swim' : 'PM class'}</Chip>}>Swimming</SectionTitle>
              <Card><FuelPlan plan={SWIMMING_FUEL} accent="var(--cyan)" icon={Waves} /></Card>
            </>
          ) : null}

          {(() => {
            const supMap = (s.supplementLogs && s.supplementLogs[date]) || {};
            const dtl = daysToLab(s);
            const showBiotinWarn = s.settings.labWarningOn && (dtl == null || dtl >= 0);
            const biotinWarn = showBiotinWarn
              ? (dtl != null && dtl <= 3 && s.settings.pauseBiotinBeforeLabs
                  ? `Blood work in ${dtl} day${dtl === 1 ? '' : 's'}. High-dose biotin can skew results, pause it now and tell the lab.`
                  : 'High-dose biotin can skew some lab tests. Tell your doctor and lab before blood work.')
              : null;
            return (
              <>
                <SectionTitle right={<Chip tone="green">{Object.values(supMap).filter(Boolean).length} today</Chip>}>Supplement timing</SectionTitle>
                <Card>
                  <SupplementTiming
                    items={SUPPLEMENTS}
                    takenMap={supMap}
                    onToggle={(k) => ctx.toggleSupplement(date, k)}
                    adherence={(k) => supplementAdherence(k, s, date)}
                    showConditional={flags.badmintonAvailable || flags.swimDay}
                  />
                </Card>

                <SectionTitle right={<Chip tone="violet">Fat-loss safe</Chip>}>Hair health</SectionTitle>
                <Card><HairHealthCard checks={hairHealthChecks(date, s)} config={HAIR_HEALTH} labWarning={biotinWarn} /></Card>
              </>
            );
          })()}

          <SectionTitle>Compliance</SectionTitle>
          <Card className="pad-sm">
            <div className="toggle-chips">
              <button className={`toggle-chip ${log.flags?.fast ? 'on' : ''}`} onClick={() => ctx.setMeal(date, (x) => { x.flags.fast = !x.flags.fast; })}>Fast done</button>
              <button className={`toggle-chip ${log.flags?.veg ? 'on' : ''}`} onClick={() => ctx.setMeal(date, (x) => { x.flags.veg = !x.flags.veg; })}>Vegetarian kept</button>
              <button className={`toggle-chip ${log.flags?.cheat ? 'on' : ''}`} onClick={() => ctx.setMeal(date, (x) => { x.flags.cheat = !x.flags.cheat; })}>Cheat meal</button>
              <button className={`toggle-chip ${log.flags?.restaurant ? 'on' : ''}`} onClick={() => ctx.setMeal(date, (x) => { x.flags.restaurant = !x.flags.restaurant; })}>Restaurant</button>
            </div>
          </Card>
        </div>

        <div className="split-aside">
          <SectionTitle>Today totals</SectionTitle>
          <Card>
            <div className="score-hero" style={{ marginBottom: 12 }}>
              <MetricRing pct={adher.pct} value={adher.pct} sub="%" label="Nutrition" color="var(--cyan)" size={82} stroke={8} />
              <div className="sh-meta"><h4>Adherence</h4><p>Weighted on protein, calories and water.</p></div>
            </div>
            {bars.map((b) => (
              <div key={b.k} style={{ marginBottom: 10 }}>
                <div className="pbar-row"><span className="lab">{b.k}</span><span className="val num">{Math.round(b.act)} / {b.tgt}</span></div>
                <ProgressBar pct={(b.act / b.tgt) * 100} color={b.color} />
              </div>
            ))}
          </Card>

          <SectionTitle>Water</SectionTitle>
          <Card>
            <div className="stepper">
              <button onClick={() => ctx.setMeal(date, (x) => { x.water = Math.max(0, Math.round((x.water - 0.25) * 100) / 100); })}>-</button>
              <input className="input mono" value={`${a.water} L`} readOnly style={{ textAlign: 'center' }} />
              <button onClick={() => ctx.setMeal(date, (x) => { x.water = Math.round((x.water + 0.25) * 100) / 100; })}>+</button>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>Target {t.waterL} L{flags.swimDay ? ' plus extra around the swim.' : '.'}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// BODY
// =====================================================================
const BLANK_SCAN = () => { const o = { date: todayKey() }; SCAN_FIELDS.forEach((f) => { o[f.key] = ''; }); return o; };

function BodyTab({ ctx }) {
  const s = ctx.state;
  const scans = sortedScans(s);
  const latest = latestScan(s);
  const base = baselineScan(s);
  const prev = scans.length >= 2 ? scans[scans.length - 2] : null;
  const target = monthlyTargetProgress(s);
  const [editing, setEditing] = useState(null); // scan object or null
  const [draft, setDraft] = useState(BLANK_SCAN());

  const series = scans.map((sc) => ({
    label: shortDate(sc.date), weight: sc.weight, bf: sc.bodyFatPct, waist: sc.waist,
    visceral: sc.visceralFatArea, lean: sc.leanMass,
  }));

  const openAdd = () => { setDraft(BLANK_SCAN()); setEditing('new'); };
  const openEdit = (sc) => { setDraft({ ...sc }); setEditing(sc.id); };
  const save = () => {
    const clean = { ...draft };
    SCAN_FIELDS.forEach((f) => { clean[f.key] = clean[f.key] === '' ? 0 : parseFloat(clean[f.key]); });
    if (editing === 'new') ctx.addScan(clean); else ctx.updateScan(editing, clean);
    setEditing(null);
  };

  const cmpRow = (f) => {
    if (!latest || !base) return null;
    const cur = latest[f.key], b0 = base[f.key];
    const d = Math.round((cur - b0) * 100) / 100;
    const improved = (f.good === 'down' && d < 0) || (f.good === 'up' && d > 0);
    const worse = (f.good === 'down' && d > 0) || (f.good === 'up' && d < 0);
    return (
      <div className="cmp" key={f.key}>
        <div className="cmp-lab">{f.label}</div>
        <div className="cmp-v">{b0}{f.unit ? ` ${f.unit}` : ''}</div>
        <div className="cmp-v">{cur}{f.unit ? ` ${f.unit}` : ''}</div>
        <div className={`cmp-d ${improved ? 'delta up' : worse ? 'delta down' : 'faint'}`}>{d > 0 ? '+' : ''}{d}</div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-title">Body</div>
      <p className="page-sub">Your Evolt 360 scans. Three seeded from your result sheets. Add a new scan each month.</p>

      {latest ? (
        <Card>
          <div className="ring-grid">
            <MetricRing pct={100 - (latest.bodyFatPct / 30) * 100} value={latest.bodyFatPct} sub="%" label="Body Fat" color="var(--amber)" size={72} />
            <MetricRing pct={(1 - (latest.waist - 32) / 8) * 100} value={latest.waist} sub="in" label="Waist" color="var(--cyan)" size={72} />
            <MetricRing pct={100 - (latest.visceralFatArea / 120) * 100} value={latest.visceralFatArea} sub="cm2" label="Visceral" color="var(--red)" size={72} />
            <MetricRing pct={(latest.bwi / 10) * 100} value={latest.bwi} sub="/10" label="BWI" color="var(--green)" size={72} />
          </div>
        </Card>
      ) : null}

      <div className="grid-2">
        <div>
          <SectionTitle>Trends</SectionTitle>
          <Card>
            <div className="legend"><span><i style={{ background: '#34d0de' }} />Weight lb</span></div>
            <LineTrend data={series} lines={[{ key: 'weight', color: '#34d0de', name: 'Weight' }]} />
          </Card>
          <Card>
            <div className="legend"><span><i style={{ background: '#f6a623' }} />Body fat %</span><span><i style={{ background: '#34d0de' }} />Waist in</span></div>
            <LineTrend data={series} lines={[{ key: 'bf', color: '#f6a623', name: 'Body fat %' }, { key: 'waist', color: '#34d0de', name: 'Waist' }]} />
          </Card>
          <Card>
            <div className="legend"><span><i style={{ background: '#f0553d' }} />Visceral area</span><span><i style={{ background: '#37c871' }} />Lean mass</span></div>
            <LineTrend data={series} lines={[{ key: 'visceral', color: '#f0553d', name: 'Visceral cm2' }, { key: 'lean', color: '#37c871', name: 'Lean lb' }]} />
          </Card>
        </div>

        <div>
          <SectionTitle right={<button className="btn xs primary" onClick={openAdd}><Plus size={13} /> Scan</button>}>Baseline vs latest</SectionTitle>
          <Card>
            <div className="cmp" style={{ color: 'var(--faint)' }}>
              <div className="cmp-lab" style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase' }}>Metric</div>
              <div className="cmp-v" style={{ fontSize: 10 }}>{base ? shortDate(base.date) : '-'}</div>
              <div className="cmp-v" style={{ fontSize: 10 }}>{latest ? shortDate(latest.date) : '-'}</div>
              <div className="cmp-d" style={{ fontSize: 10 }}>Δ</div>
            </div>
            {SCAN_FIELDS.map(cmpRow)}
          </Card>

          <SectionTitle>Goal progress</SectionTitle>
          <Card>
            <div className="pbar-row"><span className="lab">Fat lost of {target.goal} lb goal</span><span className="val num">{target.lost} lb</span></div>
            <ProgressBar pct={target.pct} color="var(--green)" />
            <div className="hint" style={{ marginTop: 8 }}>{prev && latest ? `Since last scan: ${Math.round((latest.weight - prev.weight) * 10) / 10} lb weight, ${Math.round((latest.bodyFatPct - prev.bodyFatPct) * 10) / 10}% body fat.` : 'Add another scan to see month-over-month change.'}</div>
          </Card>

          <SectionTitle>Labs</SectionTitle>
          <Card><LabsCard labs={LABS} /></Card>

          <SectionTitle>All scans</SectionTitle>
          <Card>
            {scans.slice().reverse().map((sc) => (
              <div className="row" key={sc.id}>
                <div className="row-main"><div className="row-title">{prettyDate(sc.date)}</div><div className="row-sub">{sc.weight} lb · {sc.bodyFatPct}% · waist {sc.waist} · VFA {sc.visceralFatArea}</div></div>
                <button className="btn xs ghost" onClick={() => openEdit(sc)} aria-label={`Edit scan from ${prettyDate(sc.date)}`}><Pencil size={13} /></button>
                <button className="btn xs danger" onClick={() => ctx.deleteScan(sc.id)} aria-label={`Delete scan from ${prettyDate(sc.date)}`}><Trash2 size={13} /></button>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <SectionTitle>Apple Health & Watch</SectionTitle>
      <WatchPanel ctx={ctx} />

      {editing ? (
        <Sheet title={editing === 'new' ? 'Add body scan' : 'Edit scan'} onClose={() => setEditing(null)}>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </div>
          <div className="field-row cols-3">
            {SCAN_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                <input className="input mono" inputMode="decimal" value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <button className="btn primary block" onClick={save} style={{ marginTop: 6 }}><Save size={15} /> Save scan</button>
        </Sheet>
      ) : null}
    </div>
  );
}

function WatchPanel({ ctx }) {
  const [date, setDate] = useState(todayKey());
  const w = watchFor(date, ctx.state);
  const lastSync = ctx.state.lastHealthSync || {};
  const syncedLabels = (lastSync.fields || []).map((key) => WATCH_FIELDS.find((field) => field.key === key)?.label || key);
  return (
    <Card>
      <DateNav date={date} setDate={setDate} />
      {lastSync.at ? (
        <Banner tone="green" icon={Watch}>
          Last Apple Health import: {lastSync.count} value{lastSync.count === 1 ? '' : 's'} for {prettyDate(lastSync.date)} at {new Date(lastSync.at).toLocaleString()}.
          {syncedLabels.length ? ` Imported: ${syncedLabels.join(', ')}.` : ''}
        </Banner>
      ) : (
        <Banner tone="cyan" icon={Watch}>Run your "Health to Recomp" Shortcut (set it up in More) to auto-fill steps, sleep, resting HR and HRV. You can still type or correct any value here.</Banner>
      )}
      <div className="field-row cols-3">
        {WATCH_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
            <input className="input mono" inputMode="decimal" value={w[f.key] ?? ''} onChange={(e) => ctx.setWatch(date, f.key, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="divider" />
      <div className="block-tag"><span className="bar" />CSV import (preview)</div>
      <div className="hint">Import parser ready. Upload a CSV and map columns. Column mapping ships in a later version.</div>
      <label className="btn sm" style={{ marginTop: 8, display: 'inline-flex' }}>
        <Upload size={14} /> Choose CSV
        <input className="file-input" type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) alert(`Loaded ${f.name}. Import parser ready. Column mapping is coming in a later version.`); }} />
      </label>
    </Card>
  );
}

// =====================================================================
// HABITS
// =====================================================================
function HabitsTab({ ctx }) {
  const [date, setDate] = useState(ctx.selDate);
  const s = ctx.state;
  const { status } = habitStatus(date, s);
  const pct = habitPct(date, s);
  const todaysHabits = useMemo(() => HABITS.filter((h) => h.key in status), [status]);
  const groups = useMemo(() => {
    const g = {};
    todaysHabits.forEach((h) => { (g[h.group] = g[h.group] || []).push(h); });
    return g;
  }, [todaysHabits]);

  // streak: consecutive days back from today with habit pct >= 60
  const streak = useMemo(() => {
    let n = 0, d = todayKey();
    for (let i = 0; i < 120; i++) { if (habitPct(d, s) >= 60) { n++; d = addDays(d, -1); } else break; }
    return n;
  }, [s]);

  const missed = todaysHabits.filter((h) => !status[h.key]);
  const allSelected = todaysHabits.length > 0 && missed.length === 0;

  const toggleAll = () => {
    ctx.setHabits(date, todaysHabits.map((h) => h.key), !allSelected);
  };

  return (
    <div>
      <div className="page-title">Habits</div>
      <DateNav date={date} setDate={setDate} />

      <div className="grid-2">
        <Card>
          <div className="score-hero">
            <MetricRing pct={pct} value={pct} sub="%" label="Today" color={pct >= 80 ? 'var(--green)' : 'var(--cyan)'} size={88} stroke={9} />
            <div className="sh-meta">
              <h4>Checklist complete</h4>
              <p>Streak: {streak} day{streak === 1 ? '' : 's'} at 60%+. {missed.length} habit{missed.length === 1 ? '' : 's'} left today.</p>
            </div>
          </div>
        </Card>
        <Card className="pad-sm">
          <div className="block-tag"><span className="bar" />Coach note</div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
            {pct >= 80 ? 'Strong day. Consistency at this level is what moves the scan numbers.'
              : missed.length ? `Close the gaps: ${missed.slice(0, 3).map((m) => m.label.toLowerCase()).join(', ')}.`
                : 'All clear.'}
          </p>
        </Card>
      </div>

      <div className="habit-actions">
        <span className="habit-count">{todaysHabits.length - missed.length} of {todaysHabits.length} selected</span>
        <button className={`btn sm ${allSelected ? '' : 'primary'}`} onClick={toggleAll} aria-pressed={allSelected}>
          <Check size={15} /> {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>

      {Object.keys(groups).map((g) => (
        <div key={g}>
          <SectionTitle>{g}</SectionTitle>
          <Card>
            {groups[g].map((h) => {
              const on = status[h.key];
              return (
                <button type="button" className="row row-action" key={h.key} onClick={() => ctx.toggleHabit(date, h.key, !on)} aria-pressed={on}>
                  <span className={`check ${on ? 'on' : ''}`} aria-hidden="true"><Check size={15} /></span>
                  <span className="row-main"><span className="row-title">{h.label}</span></span>
                </button>
              );
            })}
          </Card>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// STATS
// =====================================================================
function StatsTab({ ctx }) {
  const s = ctx.state;
  const today = todayKey();
  const avg = (n) => {
    let sum = 0, c = 0;
    for (let i = 0; i < n; i++) { const d = addDays(today, -i); sum += dailyScore(d, s).score; c++; }
    return Math.round(sum / c);
  };
  const daily = dailyScore(today, s).score;
  const weekly = avg(7);
  const monthly = avg(30);

  const muscleVol = volumeByMuscle(s);
  const muscleData = Object.keys(muscleVol).filter((k) => k !== 'Other' && k !== 'Conditioning').map((k) => ({ label: k, value: Math.round(muscleVol[k]) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const weekVol = weeklyVolumeSeries(s, 8);

  const ss = supersetStats(s);
  const fs = finisherStats(s);

  const exVol = volumeByExercise(s);
  const topLifts = Object.keys(exVol).map((n) => { const b = getBestPerformance(n, s); return { name: n, e1rm: b ? Math.round(b.e1rm) : 0, vol: Math.round(exVol[n]) }; }).sort((a, b) => b.e1rm - a.e1rm).slice(0, 6);

  const recs = allSetRecords(s);
  const hasData = recs.length > 0;

  // week-over-week improvement + lagging-muscle intelligence
  const trend = volumeTrend(s);
  const balance = muscleBalance(s);
  // real deload signal: the last COMPLETED week actually dropped vs the one before
  const deload = trend.pct != null && trend.pct <= -12;

  return (
    <div>
      <div className="page-title">Stats</div>
      <p className="page-sub">Plan vs reality across training, nutrition, recovery and body composition.</p>

      <Card>
        <div className="ring-grid cols-3">
          <MetricRing pct={daily} value={daily} sub="/100" label="Today" color="var(--cyan)" size={80} />
          <MetricRing pct={weekly} value={weekly} sub="/100" label="7-day" color="var(--amber)" size={80} />
          <MetricRing pct={monthly} value={monthly} sub="/100" label="30-day" color="var(--green)" size={80} />
        </div>
      </Card>

      {deload ? <Banner tone="amber" icon={AlertTriangle}>Last week's volume dropped {Math.abs(trend.pct)}% vs the week before. If that's unplanned, tighten consistency; if you're tired, take a real deload: same lifts, drop sets and load ~40%.</Banner> : null}

      <div className="grid-2">
        <div>
          <SectionTitle right={trend.pct != null ? <Chip tone={trend.up ? 'green' : 'amber'}>{trend.up ? '+' : ''}{trend.pct}% vs last wk</Chip> : null}>Training volume by week</SectionTitle>
          <Card>
            {hasData ? <BarMini data={weekVol} color="#34d0de" /> : <EmptyState icon={TrendingUp} title="No sets logged yet" sub="Log a Train session and volume shows up here." />}
            {hasData && trend.hasData ? (
              <div className="stat-grid cols-3" style={{ marginTop: 10 }}>
                <StatCell k="Last full week" v={fmtVol(trend.lastFull)} delta={trend.pct != null ? `${trend.up ? '+' : ''}${trend.pct}% vs prior` : null} deltaDir={trend.up ? 'up' : 'down'} />
                <StatCell k="This week so far" v={fmtVol(trend.current)} />
                <StatCell k="Best group" v={balance.ranked[0]?.muscle || '-'} />
              </div>
            ) : null}
          </Card>

          {balance.enough ? (
            <>
              <SectionTitle right={<Chip tone={balance.hints.length ? 'amber' : 'green'}>{balance.hints.length ? `${balance.hints.length} to fix` : 'balanced'}</Chip>}>Muscle balance</SectionTitle>
              <Card className="pad-sm">
                {balance.hints.length ? (
                  <div className="food-coach">
                    {balance.hints.map((h, i) => (
                      <div className={`fc-line ${h.tone === 'warn' ? 'amber' : 'cyan'}`} key={i}><span className="fc-dot" />{h.text}</div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>Every muscle group is getting worked in proportion over the last 3 weeks. Keep progressing load and reps.</p>
                )}
              </Card>
            </>
          ) : null}

          <SectionTitle>Volume by muscle group</SectionTitle>
          <Card>{muscleData.length ? <BarMini data={muscleData} color="#8b7bf0" /> : <EmptyState icon={Dumbbell} title="Nothing logged yet" />}</Card>

          <SectionTitle>Muscle volume · week on week</SectionTitle>
          <Card className="pad-sm">
            {(() => {
              const mwt = muscleWeekTrend(s).filter((x) => x.last > 0 || x.prev > 0);
              if (!mwt.length) return <EmptyState icon={TrendingUp} title="Not enough history" sub="Log a couple of weeks and each muscle's change shows here." />;
              return (
                <>
                  {mwt.slice(0, 8).map((x) => (
                    <div className="row" key={x.muscle}>
                      <div className="row-main">
                        <div className="row-title">{x.muscle}</div>
                        <div className="row-sub">last wk {fmtVol(x.last)} · before {fmtVol(x.prev)}</div>
                      </div>
                      {x.pct != null
                        ? <span className={`chip ${x.up ? 'green' : 'red'}`}>{x.up ? '▲ +' : '▼ '}{x.pct}%</span>
                        : <span className="chip cyan">new</span>}
                    </div>
                  ))}
                  <div className="hint" style={{ marginTop: 8 }}>Compares your last full week with the week before, per muscle. Green = more volume, red = less.</div>
                </>
              );
            })()}
          </Card>
        </div>

        <div>
          <SectionTitle>Block completion</SectionTitle>
          <Card>
            <div className="stat-grid">
              <StatCell k="Superset / circuit" v={ss.pct} unit="%" />
              <StatCell k="Cells done" v={`${ss.doneCells}/${ss.plannedCells}`} />
              <StatCell k="Rounds done" v={`${ss.doneRounds}/${ss.plannedRounds}`} />
              <StatCell k="Skipped in sets" v={ss.missed} />
              <StatCell k="Finishers" v={`${fs.done}/${fs.planned}`} />
              <StatCell k="Finisher rate" v={fs.pct} unit="%" />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>Supersets and circuits count every exercise in every round. A block only reads complete when all of them are done.</div>
          </Card>

          <SectionTitle>Top lifts (e1RM)</SectionTitle>
          <Card>
            {topLifts.length && topLifts[0].e1rm > 0 ? (
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Exercise</th><th>e1RM</th><th>Total vol</th></tr></thead>
                  <tbody>{topLifts.map((l) => <tr key={l.name}><td>{l.name}</td><td>{l.e1rm} lb</td><td>{l.vol}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <EmptyState icon={Trophy} title="No PRs yet" sub="Your best lifts appear here after a few sessions." />}
          </Card>
        </div>
      </div>

      <SectionTitle>Body composition</SectionTitle>
      <BodyMiniStats ctx={ctx} />
    </div>
  );
}

function BodyMiniStats({ ctx }) {
  const s = ctx.state;
  const scans = sortedScans(s);
  const latest = latestScan(s), base = baselineScan(s);
  const target = monthlyTargetProgress(s);
  if (!latest) return null;
  return (
    <Card>
      <div className="stat-grid cols-3">
        <StatCell k="Weight" v={latest.weight} unit="lb" delta={base ? `${(latest.weight - base.weight).toFixed(1)}` : null} deltaDir={latest.weight < base.weight ? 'up' : 'down'} />
        <StatCell k="Body fat" v={latest.bodyFatPct} unit="%" delta={base ? `${(latest.bodyFatPct - base.bodyFatPct).toFixed(1)}` : null} deltaDir={latest.bodyFatPct < base.bodyFatPct ? 'up' : 'down'} />
        <StatCell k="Lean mass" v={latest.leanMass} unit="lb" delta={base ? `${(latest.leanMass - base.leanMass).toFixed(1)}` : null} deltaDir={latest.leanMass > base.leanMass ? 'up' : 'down'} />
        <StatCell k="Waist" v={latest.waist} unit="in" delta={base ? `${(latest.waist - base.waist).toFixed(1)}` : null} deltaDir={latest.waist < base.waist ? 'up' : 'down'} />
        <StatCell k="Visceral" v={latest.visceralFatArea} unit="cm2" />
        <StatCell k="Fat to goal" v={`${target.lost}/${target.goal}`} unit="lb" />
      </div>
    </Card>
  );
}

// =====================================================================
// MORE
// =====================================================================
function HealthSyncCard() {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app';
  const template = `${origin}/#health?date=[Date]&steps=[Steps]&sleep=[Sleep Hours]&rhr=[Resting HR]&hrv=[HRV]&sleepScore=[Sleep Score]`;
  const copy = () => {
    try { navigator.clipboard.writeText(template); } catch (e) { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Card>
      <div className="block-tag"><span className="bar" />Auto-fill steps and sleep from your Watch</div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)' }}>
        Safari cannot read Apple Health directly. A one-time Apple Shortcut reduces each Health result to one number, then opens this private fragment link. Values after <span className="num">#health</span> stay on your phone and are not sent to Vercel.
      </p>
      <div className="field">
        <label>Sync link (used inside the Shortcut)</label>
        <input className="input mono" readOnly value={template} onFocus={(e) => e.target.select()} style={{ fontSize: 11 }} />
      </div>
      <div className="btn-row">
        <button className="btn sm" onClick={copy}><Save size={14} /> {copied ? 'Copied' : 'Copy sync link'}</button>
      </div>
      <div className="health-guide">
        <div className="health-step"><b>1</b><span><strong>Date:</strong> Format Current Date as <span className="num">yyyy-MM-dd</span>.</span></div>
        <div className="health-step"><b>2</b><span><strong>Steps:</strong> Find Step Count samples whose Start Date is today, then Calculate Statistics → Sum.</span></div>
        <div className="health-step"><b>3</b><span><strong>Sleep:</strong> search the previous 18 hours—not “Start Date is Today.” Keep only Asleep/Core/Deep/REM periods, total their duration, and convert it to hours.</span></div>
        <div className="health-step"><b>4</b><span><strong>Resting HR:</strong> use the latest numeric sample from the previous 24 hours. <strong>HRV:</strong> average numeric samples from the previous 18 hours.</span></div>
        <div className="health-step"><b>5</b><span>Add Show Result while testing. Each variable must be one plain number such as <span className="num">9412</span>, <span className="num">7.3</span>, or <span className="num">58</span>—no list or unit text.</span></div>
        <div className="health-step"><b>6</b><span>Put those variables into the copied Text link, delete <span className="num">&amp;sleepScore=[Sleep Score]</span> if Shortcuts does not offer Sleep Score, then Open URLs.</span></div>
      </div>
      <div className="hint health-note">
        Automate with the Waking Up trigger or 15–30 minutes after your usual wake time, then choose Run Immediately. After it runs, Body → Apple Health &amp; Watch shows a persistent import receipt and the populated values. Recovery currently uses sleep, resting HR and logged pain. HRV and Sleep Score are stored for tracking but are not scored without a personal baseline.
      </div>
    </Card>
  );
}

function SyncCard({ ctx }) {
  const s = ctx.state;
  const [pass, setPass] = useState(ctx.getSyncSecret());
  const [show, setShow] = useState(false);
  const savePass = (v) => { setPass(v); ctx.setSyncSecret(v); };
  const st = ctx.syncStatus;
  return (
    <Card>
      <div className="block-tag"><span className="bar" />Encrypted sync across your devices</div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)' }}>
        Set the same passphrase on each device. Your data is encrypted on this device before it leaves, so Cloudflare only ever stores an unreadable blob.
      </p>
      <div className="field">
        <label>Sync URL (your Cloudflare Worker)</label>
        <input className="input mono" style={{ fontSize: 12 }} placeholder="https://acp-sync.you.workers.dev" value={s.settings.syncUrl} onChange={(e) => ctx.setSetting('syncUrl', e.target.value.trim())} />
      </div>
      <div className="field">
        <label>Passphrase (stays on this device)</label>
        <input className="input mono" type={show ? 'text' : 'password'} placeholder="a long secret only you know" value={pass} onChange={(e) => savePass(e.target.value)} />
        <button className="btn xs ghost" style={{ marginTop: 6 }} onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'} passphrase</button>
      </div>
      <button type="button" className="row row-action" onClick={() => ctx.setSetting('syncAuto', !s.settings.syncAuto)} aria-pressed={s.settings.syncAuto}>
        <span className={`check ${s.settings.syncAuto ? 'on' : ''}`} aria-hidden="true"><Check size={15} /></span>
        <span className="row-main"><span className="row-title">Auto-sync</span><span className="row-sub">Pull on open, push a few seconds after any change</span></span>
      </button>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn sm primary" disabled={ctx.syncBusy} onClick={ctx.doPush}><Upload size={14} /> Push to cloud</button>
        <button className="btn sm" disabled={ctx.syncBusy} onClick={ctx.doPull}><Download size={14} /> Pull from cloud</button>
      </div>
      {st ? <Banner tone={st.type === 'err' ? 'red' : 'cyan'} icon={st.type === 'err' ? AlertTriangle : st.type === 'ok' ? Check : Info}>{st.msg}</Banner> : null}
      <div className="hint" style={{ marginTop: 8 }}>If you lose the passphrase, the cloud copy can't be decrypted — there is no recovery. Keep exporting a JSON backup too.</div>
    </Card>
  );
}

const EMPTY_MACHINE = {
  name: '', p: '', s: '', eq: 'Machine', use: '', sub: '', cue: '', err: '',
  defaultSets: 3, repLow: 8, repHigh: 12, rpe: 8, restSec: 90, tempo: '2-1-1',
};

function CustomMachineCard({ ctx }) {
  const custom = ctx.state.customExercises || {};
  const [draft, setDraft] = useState(EMPTY_MACHINE);
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');
  const [savedFit, setSavedFit] = useState(null);
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const reset = () => { setDraft(EMPTY_MACHINE); setEditing(''); setError(''); };
  const save = () => {
    const name = draft.name.trim();
    if (!name || !draft.p.trim()) { setError('Add a machine/exercise name and primary muscle.'); return; }
    if (EXERCISES[name]) { setError('That name is already in the built-in exercise library. Choose a distinct name.'); return; }
    if (!editing && custom[name]) { setError('That custom name already exists. Tap Edit to update it.'); return; }
    const meta = {
      p: draft.p.trim(), s: draft.s.trim(), eq: draft.eq.trim() || 'Machine',
      use: draft.use.trim(), sub: draft.sub.trim(), cue: draft.cue.trim(), err: draft.err.trim(),
      defaultSets: Math.max(1, Math.min(10, parseInt(draft.defaultSets, 10) || 3)),
      repLow: Math.max(1, parseInt(draft.repLow, 10) || 8),
      repHigh: Math.max(1, parseInt(draft.repHigh, 10) || 12),
      rpe: Math.max(1, Math.min(10, parseFloat(draft.rpe) || 8)),
      restSec: Math.max(0, parseInt(draft.restSec, 10) || 90),
      tempo: draft.tempo.trim() || '2-1-1', custom: true,
    };
    const previewState = { ...ctx.state, customExercises: { ...custom, [name]: meta } };
    if (editing && editing !== name) delete previewState.customExercises[editing];
    const fits = customExercisePlanFits(name, previewState);
    ctx.saveCustomExercise(editing, name, meta);
    setSavedFit({ name, fits });
    reset();
  };
  const edit = (name) => {
    setDraft({ ...EMPTY_MACHINE, ...custom[name], name });
    setEditing(name);
    setError('');
    setSavedFit(null);
  };

  return (
    <Card>
      <div className="block-tag"><span className="bar" />Your cloud-synced equipment library</div>
      <div className="hint" style={{ marginBottom: 10 }}>Custom equipment is saved with your app data, survives upgrades, and is matched to compatible plan slots by muscle and movement pattern. Matches become recommended alternates, so the app does not silently add unwanted training volume.</div>
      <div className="field"><label>Machine / exercise name</label><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Example: Gym80 Glute Drive" /></div>
      <div className="field-row cols-3">
        <div className="field"><label>Primary muscle</label><input className="input" value={draft.p} onChange={(e) => set('p', e.target.value)} placeholder="Glutes" /></div>
        <div className="field"><label>Secondary muscles</label><input className="input" value={draft.s} onChange={(e) => set('s', e.target.value)} placeholder="Hamstrings" /></div>
        <div className="field"><label>Equipment</label><input className="input" value={draft.eq} onChange={(e) => set('eq', e.target.value)} placeholder="Plate loaded" /></div>
      </div>
      <div className="field-row cols-3">
        <div className="field"><label>Default sets</label><input className="input mono" inputMode="numeric" value={draft.defaultSets} onChange={(e) => set('defaultSets', e.target.value)} /></div>
        <div className="field"><label>Rep range</label><div style={{ display: 'flex', gap: 6 }}><input className="input mono" inputMode="numeric" value={draft.repLow} onChange={(e) => set('repLow', e.target.value)} /><input className="input mono" inputMode="numeric" value={draft.repHigh} onChange={(e) => set('repHigh', e.target.value)} /></div></div>
        <div className="field"><label>RPE / rest seconds</label><div style={{ display: 'flex', gap: 6 }}><input className="input mono" inputMode="decimal" value={draft.rpe} onChange={(e) => set('rpe', e.target.value)} /><input className="input mono" inputMode="numeric" value={draft.restSec} onChange={(e) => set('restSec', e.target.value)} /></div></div>
      </div>
      <div className="field"><label>Best use</label><input className="input" value={draft.use} onChange={(e) => set('use', e.target.value)} placeholder="Glute strength with stable setup" /></div>
      <div className="field"><label>Coaching cue</label><input className="input" value={draft.cue} onChange={(e) => set('cue', e.target.value)} placeholder="Brace, drive through heels" /></div>
      <div className="field-row">
        <div className="field"><label>Substitute</label><input className="input" value={draft.sub} onChange={(e) => set('sub', e.target.value)} placeholder="Barbell Hip Thrust" /></div>
        <div className="field"><label>Avoid</label><input className="input" value={draft.err} onChange={(e) => set('err', e.target.value)} placeholder="Overextending the lower back" /></div>
      </div>
      <div className="field"><label>Tempo</label><input className="input mono" value={draft.tempo} onChange={(e) => set('tempo', e.target.value)} placeholder="2-1-1" /></div>
      {error ? <Banner tone="red" icon={AlertTriangle}>{error}</Banner> : null}
      {savedFit ? (
        <Banner tone="green" icon={Sparkles}>
          <b>{savedFit.name}</b> is ready in Train → Add exercise.
          {savedFit.fits.length
            ? ` It is now recommended as an alternate for ${savedFit.fits.slice(0, 2).map((fit) => `${fit.exerciseName} on ${fit.dayTitle}`).join(' and ')}.`
            : ' No safe plan match was found, so it remains library-only until you choose it.'}
        </Banner>
      ) : null}
      <div className="btn-row">
        <button className="btn sm primary" onClick={save}><Save size={14} /> {editing ? 'Save changes' : 'Add machine'}</button>
        {editing ? <button className="btn sm ghost" onClick={reset}>Cancel</button> : null}
      </div>
      {Object.keys(custom).length ? <div className="divider" /> : null}
      {Object.keys(custom).sort().map((name) => {
        const topFit = customExercisePlanFits(name, ctx.state, 1)[0];
        return (
          <div className="row equipment-row" key={name}>
            <div className="row-main">
              <div className="row-title">{name}</div>
              <div className="row-sub">{custom[name].p || 'Other'} · {custom[name].eq || 'Machine'} · {custom[name].defaultSets || 3} sets</div>
              <div className={`plan-fit ${topFit ? 'matched' : ''}`}><Sparkles size={12} /> {topFit ? `Best plan fit: alternate for ${topFit.exerciseName}` : 'Library only · choose manually in Train'}</div>
            </div>
            <div className="btn-row"><button className="btn xs" onClick={() => edit(name)}>Edit</button><button className="btn xs danger" aria-label={`Delete ${name}`} onClick={() => { if (confirm(`Delete ${name} from your custom library? Existing workout history is kept.`)) ctx.deleteCustomExercise(name); }}><Trash2 size={13} /></button></div>
          </div>
        );
      })}
    </Card>
  );
}

function MoreTab({ ctx }) {
  const s = ctx.state;
  const [importErr, setImportErr] = useState('');

  const doImport = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!validateImport(obj)) { setImportErr('That file does not look like a Recomp OS backup.'); return; }
        ctx.replaceState(obj);
        setImportErr('');
        alert('Backup imported.');
      } catch (e) { setImportErr('Could not read that file. Make sure it is a valid JSON export.'); }
    };
    reader.onerror = () => setImportErr('Could not read that file.');
    reader.readAsText(file);
  };

  const num = (label, key, obj, setter) => (
    <div className="field">
      <label>{label}</label>
      <input className="input mono" inputMode="decimal" value={obj[key]} onChange={(e) => setter(key, e.target.value)} />
    </div>
  );

  return (
    <div>
      <div className="page-title">More</div>

      <div className="grid-2">
        <div>
          <SectionTitle>Profile</SectionTitle>
          <Card>
            <div className="field"><label>Name</label><input className="input" value={s.profile.name} onChange={(e) => ctx.setProfile('name', e.target.value)} /></div>
            <div className="field-row cols-3">
              {num('Height (in)', 'heightIn', s.profile, (k, v) => ctx.setProfile(k, parseFloat(v) || 0))}
              {num('Age', 'age', s.profile, (k, v) => ctx.setProfile(k, parseFloat(v) || 0))}
              {num('Start wt (lb)', 'startWeightLb', s.profile, (k, v) => ctx.setProfile(k, parseFloat(v) || 0))}
            </div>
          </Card>

          <SectionTitle>Goals</SectionTitle>
          <Card>
            <div className="field-row cols-3">
              {num('Fat loss (lb)', 'goalFatLossLb', s.profile, (k, v) => ctx.setProfile(k, parseFloat(v) || 0))}
              {num('Waist goal (in)', 'goalWaistIn', s.profile, (k, v) => ctx.setProfile(k, parseFloat(v) || 0))}
              {num('Body fat goal %', 'goalBodyFatPct', s.profile, (k, v) => ctx.setProfile(k, parseFloat(v) || 0))}
            </div>
          </Card>

          <SectionTitle>Nutrition and targets</SectionTitle>
          <Card>
            {(() => { const p = nutritionProfile(s); return (
              <>
                <div className="block-tag"><span className="bar" />Auto-calculated from your latest scan</div>
                <div className="stat-grid cols-3" style={{ marginBottom: 10 }}>
                  <StatCell k="Maintenance" v={p.tdee} unit="kcal" />
                  <StatCell k="Cut target" v={p.baseCals} unit="kcal" />
                  <StatCell k="Protein" v={p.protein} unit="g" />
                </div>
                <div className="hint" style={{ marginBottom: 10 }}>Calories and macros are derived from your scan (lean mass {p.leanMass} lb, maintenance {p.tdee} kcal) and the deficit below. Lower the deficit to lose slower and protect hair; raise it to lose faster.</div>
              </>
            ); })()}
            <div className="field-row cols-3">
              {num('Deficit %', 'deficitPercent', s.settings, (k, v) => ctx.setSetting(k, parseFloat(v) || 0))}
              {num('Water (L)', 'waterTargetL', s.settings, (k, v) => ctx.setSetting(k, parseFloat(v) || 0))}
              {num('Steps', 'stepsTarget', s.settings, (k, v) => ctx.setSetting(k, parseFloat(v) || 0))}
            </div>
            <div className="hint">Vegetarian days always exclude chicken, fish, whole eggs and egg whites.</div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Units</label>
              <div className="pill-toggle">
                <button className={s.settings.units === 'imperial' ? 'active' : ''} onClick={() => ctx.setSetting('units', 'imperial')}>Imperial</button>
                <button className={s.settings.units === 'metric' ? 'active' : ''} onClick={() => ctx.setSetting('units', 'metric')}>Metric</button>
              </div>
            </div>
          </Card>

          <SectionTitle>Supplements and labs</SectionTitle>
          <Card>
            <div className="field-row cols-3">
              {num('Total daily D3 (IU)', 'd3Dose', s.settings, (k, v) => ctx.setSetting(k, v))}
              {num('Magnesium elemental', 'magElementalMg', s.settings, (k, v) => ctx.setSetting(k, v))}
              {num('Biotin dose', 'biotinDose', s.settings, (k, v) => ctx.setSetting(k, v))}
            </div>
            <div className="hint" style={{ marginBottom: 10 }}>Vitamin D is 50 ng/mL, so D3 + K2 is maintenance. Track total daily IU across all products. Log elemental magnesium, not capsule weight.</div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label>Upcoming lab / blood work date</label>
              <input className="input mono" type="date" value={s.settings.upcomingLabDate || ''} onChange={(e) => ctx.setSetting('upcomingLabDate', e.target.value)} />
            </div>

            <button type="button" className="row row-action" onClick={() => ctx.setSetting('labWarningOn', !s.settings.labWarningOn)} aria-pressed={s.settings.labWarningOn}>
              <span className={`check ${s.settings.labWarningOn ? 'on' : ''}`} aria-hidden="true"><Check size={15} /></span>
              <span className="row-main"><span className="row-title">Show biotin lab-interference warnings</span><span className="row-sub">High-dose biotin can skew thyroid, troponin, vitamin D and hormone assays</span></span>
            </button>
            <button type="button" className="row row-action" onClick={() => ctx.setSetting('pauseBiotinBeforeLabs', !s.settings.pauseBiotinBeforeLabs)} aria-pressed={s.settings.pauseBiotinBeforeLabs}>
              <span className={`check ${s.settings.pauseBiotinBeforeLabs ? 'on' : ''}`} aria-hidden="true"><Check size={15} /></span>
              <span className="row-main"><span className="row-title">Remind to pause biotin before labs</span><span className="row-sub">A stronger reminder appears in Fuel when a lab date is within 3 days</span></span>
            </button>
          </Card>
        </div>

        <div>
          <SectionTitle>Custom equipment & exercises</SectionTitle>
          <CustomMachineCard ctx={ctx} />

          <SectionTitle>Data</SectionTitle>
          <Card>
            <div className="btn-row">
              <button className="btn sm" onClick={() => download('recomp-os-backup.json', exportJSON(s))}><Download size={14} /> Export JSON</button>
              <label className="btn sm"><Upload size={14} /> Import JSON<input className="file-input" type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }} /></label>
              <button className="btn sm ghost" onClick={() => download('workout-history.csv', workoutCSV(s), 'text/csv')}><Download size={14} /> Workout CSV</button>
            </div>
            {importErr ? <Banner tone="red" icon={AlertTriangle}>{importErr}</Banner> : null}
            <div className="divider" />
            <button className="btn primary block" onClick={() => { if (confirm('Load 8 weeks of sample workouts, meals and watch data so the Stats and charts fill in? This overwrites current logs. Reset all data restores the seed scans.')) ctx.loadDemo(); }}>
              <Zap size={15} /> Load sample data
            </button>
            <div className="hint" style={{ margin: '8px 0 12px' }}>Fills Stats, training-volume charts and scores with a realistic upward trend so you can see the app populated. Undo with Reset all data.</div>
            <button className="btn danger block" onClick={() => { if (confirm('Reset all data? This clears every log and restores the three seed scans. Export a backup first if unsure.')) ctx.resetAll(); }}>
              <RotateCcw size={15} /> Reset all data
            </button>
            <div className="hint" style={{ marginTop: 8 }}>Weekly backup reminder: export a JSON on Sundays so your history is safe if Safari clears site storage.</div>
          </Card>

          <SectionTitle>Cloud sync (cross-device)</SectionTitle>
          <SyncCard ctx={ctx} />

          <SectionTitle>Apple Health sync</SectionTitle>
          <HealthSyncCard />

          <SectionTitle>Program dates</SectionTitle>
          <Card className="program-dates">
            <div className="block-tag"><span className="bar" />Week and day recalculate from these. Changing them never deletes logs, scans, PRs or history.</div>
            {(() => { const c = programCalendar(s); return (
              <div className="stat-grid" style={{ marginBottom: 10 }}>
                <StatCell k="Program" v={`W${c.currentProgramWeek} D${c.currentProgramDay}`} />
                <StatCell k="Restart phase" v={`W${c.currentRestartWeek} D${c.currentRestartDay}`} />
                <StatCell k="Next scan in" v={c.daysUntilNextScan} unit="days" />
                <StatCell k="Scan every" v={c.scanFrequencyDays} unit="days" />
              </div>
            ); })()}
            <div className="field"><label>Program start date</label><input className="input" type="date" value={s.settings.programStartDate || ''} onChange={(e) => ctx.setSetting('programStartDate', e.target.value)} /></div>
            <div className="field"><label>Restart phase start date</label><input className="input" type="date" value={s.settings.restartPhaseStartDate || ''} onChange={(e) => ctx.setSetting('restartPhaseStartDate', e.target.value)} /></div>
            <div className="field-row cols-3">
              <div className="field"><label>Next body scan date</label><input className="input" type="date" value={s.settings.nextBodyScanDate || ''} onChange={(e) => ctx.setSetting('nextBodyScanDate', e.target.value)} /></div>
              <div className="field"><label>Scan every (days)</label><input className="input mono" inputMode="numeric" value={s.settings.scanFrequencyDays} onChange={(e) => ctx.setSetting('scanFrequencyDays', parseInt(e.target.value, 10) || 30)} /></div>
              <div className="field"><label>Restart load %</label><input className="input mono" inputMode="numeric" value={s.settings.defaultRestartLoadPercent} onChange={(e) => ctx.setSetting('defaultRestartLoadPercent', parseFloat(e.target.value) || 0)} /></div>
            </div>
            <div className="hint" style={{ marginBottom: 8 }}>Leave scan date blank to auto-use last scan + {s.settings.scanFrequencyDays} days. Manual dates are kept until you tap Auto.</div>
            <div className="btn-row">
              <button className="btn sm" onClick={() => ctx.restartCalendar(todayKey())}><RotateCcw size={14} /> Reset to Week 1 Day 1 (today)</button>
              <button className="btn sm ghost" onClick={() => { const d = prompt('Restart the program calendar from which date? (YYYY-MM-DD). Logs are kept.', todayKey()); if (d) ctx.restartCalendar(d); }}>Keep logs, restart calendar</button>
              <button className="btn sm ghost" onClick={ctx.autoScanDate}>Auto scan date</button>
              <button className="btn sm ghost" onClick={ctx.recalcNow}>Recalculate</button>
            </div>
          </Card>

          <SectionTitle>Calendar debug</SectionTitle>
          <Card>
            {(() => { const c = programCalendar(s); const rows = [
              ['Today', c.today],
              ['Program start', c.programStart],
              ['Restart start', c.restartStart],
              ['Program day / week', `Day ${c.currentProgramDay} · Week ${c.currentProgramWeek}`],
              ['Restart day / week', `Day ${c.currentRestartDay} · Week ${c.currentRestartWeek}`],
              ['Phase', c.currentPhase],
              ['Next scan date', `${c.nextBodyScanDate}${c.nextScanManual ? ' (manual)' : ' (auto)'}`],
              ['Days until scan', String(c.daysUntilNextScan)],
              ['Workout log days', String(Object.keys(s.workoutSessions || {}).length)],
              ['Body scans', String((s.bodyScans || []).length)],
            ]; return rows.map(([k, v]) => (
              <div className="row" key={k} style={{ padding: '7px 0' }}>
                <div className="row-main"><div className="row-sub" style={{ margin: 0 }}>{k}</div></div>
                <span className="num" style={{ fontSize: 12 }}>{v}</span>
              </div>
            )); })()}
          </Card>

          <SectionTitle>Program</SectionTitle>
          <Card>
            <div className="block-tag"><span className="bar" />Why this split</div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)' }}>{PROGRAM_RATIONALE}</p>
          </Card>

          <SectionTitle>Deployment</SectionTitle>
          <Card>
            <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)' }}>Run locally with <span className="num">npm install</span> then <span className="num">npm run dev</span>. Build with <span className="num">npm run build</span>. Deploy the <span className="num">dist</span> folder to Vercel, Netlify, GitHub Pages, StackBlitz or CodeSandbox, then open in iPhone Safari and Add to Home Screen.</p>
            <div className="hint">The app is local-first and has no login. Optional encrypted Cloud sync stores an unreadable backup for your other devices, including custom machine definitions.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ROOT
// =====================================================================
export default function BodyRecompOS() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState('home');
  const [selDate, setSelDate] = useState(todayKey());
  const [healthNotice, setHealthNotice] = useState(null);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  // Apple Health sync: a Shortcut opens #health?steps=..&sleep=.. etc.
  // Read them on initial launch and on later hash changes. iOS may reuse an
  // already-open Safari/PWA window, which changes only the fragment and does
  // not remount React, so listening for hashchange is required for repeat runs.
  useEffect(() => {
    let noticeTimer;
    const ingestHealthLink = () => {
      const healthInput = window.location.hash.startsWith('#health?') ? window.location.hash : window.location.search;
      const isHealthLink = window.location.hash.startsWith('#health?') || /(?:^|[?&])(steps|sleep|rhr|hrv|active)=/i.test(window.location.search);
      if (!isHealthLink) return;
      const res = parseHealthParams(healthInput);
      clearTimeout(noticeTimer);
      if (!res) {
        setHealthNotice({ error: true, message: 'No Apple Health values imported. The Shortcut must send plain numbers without units or lists.' });
        window.history.replaceState({}, '', window.location.pathname);
        noticeTimer = setTimeout(() => setHealthNotice(null), 7000);
        return;
      }
      const at = Date.now();
      const fields = Object.keys(res.patch);
      setState((prev) => ({
        ...prev,
        watchLogs: { ...prev.watchLogs, [res.date]: { ...(prev.watchLogs[res.date] || {}), ...res.patch } },
        lastHealthSync: { at, date: res.date, count: res.count, fields },
      }));
      setHealthNotice({ error: false, message: `Imported ${res.count} Apple Health value${res.count === 1 ? '' : 's'} for ${prettyDate(res.date)}` });
      window.history.replaceState({}, '', window.location.pathname);
      noticeTimer = setTimeout(() => setHealthNotice(null), 4500);
    };

    ingestHealthLink();
    window.addEventListener('hashchange', ingestHealthLink);
    return () => {
      window.removeEventListener('hashchange', ingestHealthLink);
      clearTimeout(noticeTimer);
    };
  }, []);

  const phase = phaseInfo(state);
  const today = todayKey();
  const score = dailyScore(today, state).score;

  // ----- state helpers exposed to tabs -----
  const mutate = (fn) => setState((prev) => { const d = clone(prev); fn(d); return d; });

  const patchSession = (date, producer) => setState((prev) => {
    const plan = resolveWorkout(date, prev);
    const base = prev.workoutSessions[date] ? clone(prev.workoutSessions[date]) : { ...initSession(plan), date };
    producer(base);
    return { ...prev, workoutSessions: { ...prev.workoutSessions, [date]: base } };
  });
  const mutateEntry = (date, id, fn) => patchSession(date, (sess) => { if (sess.entries[id]) fn(sess.entries[id]); });
  const getSession = (date) => (state.workoutSessions[date] ? state.workoutSessions[date] : { ...initSession(resolveWorkout(date, state)), date });

  const setMeal = (date, producer) => setState((prev) => {
    const base = prev.mealLogs[date] ? clone(prev.mealLogs[date]) : { eaten: {}, extras: [], water: 0, flags: {}, choices: {} };
    if (!base.flags) base.flags = {};
    if (!base.choices) base.choices = {};
    producer(base);
    return { ...prev, mealLogs: { ...prev.mealLogs, [date]: base } };
  });

  const setWatch = (date, key, val) => setState((prev) => ({ ...prev, watchLogs: { ...prev.watchLogs, [date]: { ...(prev.watchLogs[date] || {}), [key]: val } } }));
  const toggleHabit = (date, key, val) => setState((prev) => ({ ...prev, habitLogs: { ...prev.habitLogs, [date]: { ...(prev.habitLogs[date] || {}), [key]: val } } }));
  const setHabits = (date, keys, val) => setState((prev) => {
    const day = { ...((prev.habitLogs && prev.habitLogs[date]) || {}) };
    keys.forEach((key) => { day[key] = val; });
    return { ...prev, habitLogs: { ...(prev.habitLogs || {}), [date]: day } };
  });
  const toggleSupplement = (date, key) => setState((prev) => { const cur = (prev.supplementLogs && prev.supplementLogs[date]) || {}; return { ...prev, supplementLogs: { ...(prev.supplementLogs || {}), [date]: { ...cur, [key]: !cur[key] } } }; });
  const toggleBeverage = (date, key) => setState((prev) => { const cur = (prev.beverageLogs && prev.beverageLogs[date]) || {}; return { ...prev, beverageLogs: { ...(prev.beverageLogs || {}), [date]: { ...cur, [key]: !cur[key] } } }; });
  const toggleActivity = (date, key) => setState((prev) => { const cur = (prev.activity[date] || {}); return { ...prev, activity: { ...prev.activity, [date]: { ...cur, [key]: !cur[key] } } }; });
  const setSatMode = (date, mode) => setState((prev) => ({ ...prev, saturdayMode: { ...prev.saturdayMode, [date]: mode } }));
  const setDayOverride = (date, mode) => mutate((d) => {
    if (!d.dayOverrides) d.dayOverrides = {};
    if (mode === 'veg' || mode === 'fast1' || mode === 'fast2') d.dayOverrides[date] = mode;
    else delete d.dayOverrides[date];
  });
  const swapWorkoutDates = (firstDate, secondDate) => setState((prev) => {
    if (!firstDate || !secondDate || firstDate === secondDate) return prev;
    if (workoutSessionHasData(prev.workoutSessions && prev.workoutSessions[firstDate])) return prev;
    if (workoutSessionHasData(prev.workoutSessions && prev.workoutSessions[secondDate])) return prev;
    const firstPartner = workoutSwapPartner(firstDate, prev);
    const secondPartner = workoutSwapPartner(secondDate, prev);
    if (firstPartner || secondPartner) return prev;

    const next = clone(prev);
    if (!next.workoutSwaps) next.workoutSwaps = {};
    next.workoutSwaps[firstDate] = secondDate;
    next.workoutSwaps[secondDate] = firstDate;
    // Empty persisted sessions contain only generated plan rows. Removing
    // them lets each date initialize from its newly swapped plan.
    [firstDate, secondDate].forEach((key) => {
      if (next.workoutSessions[key] && !workoutSessionHasData(next.workoutSessions[key])) delete next.workoutSessions[key];
    });
    return next;
  });
  const clearWorkoutSwap = (date) => setState((prev) => {
    const partner = workoutSwapPartner(date, prev);
    if (!partner) return prev;
    if (workoutSessionHasData(prev.workoutSessions && prev.workoutSessions[date])) return prev;
    if (workoutSessionHasData(prev.workoutSessions && prev.workoutSessions[partner])) return prev;

    const next = clone(prev);
    delete next.workoutSwaps[date];
    if (next.workoutSwaps[partner] === date) delete next.workoutSwaps[partner];
    [date, partner].forEach((key) => {
      if (next.workoutSessions[key] && !workoutSessionHasData(next.workoutSessions[key])) delete next.workoutSessions[key];
    });
    return next;
  });

  const addScan = (scan) => mutate((d) => { d.bodyScans.push({ ...scan, id: 'scan-' + Date.now() }); });
  const updateScan = (id, scan) => mutate((d) => { d.bodyScans = d.bodyScans.map((x) => (x.id === id ? { ...x, ...scan, id } : x)); });
  const deleteScan = (id) => mutate((d) => { d.bodyScans = d.bodyScans.filter((x) => x.id !== id); });

  const setProfile = (k, v) => mutate((d) => { d.profile[k] = v; });
  const setSetting = (k, v) => mutate((d) => { d.settings[k] = v; });
  const setRestart = (name, field, val) => mutate((d) => { if (!d.restartWeights) d.restartWeights = {}; const cur = d.restartWeights[name] || { old: '', pct: '' }; d.restartWeights[name] = { ...cur, [field]: val }; });
  const saveCustomExercise = (oldName, name, meta) => mutate((d) => {
    if (!d.customExercises) d.customExercises = {};
    if (oldName && oldName !== name) delete d.customExercises[oldName];
    d.customExercises[name] = meta;
  });
  const deleteCustomExercise = (name) => mutate((d) => { if (d.customExercises) delete d.customExercises[name]; });
  // change the program calendar without touching any logs, scans, PRs or history
  const restartCalendar = (dateStr) => mutate((d) => { d.settings.programStartDate = dateStr; d.settings.restartPhaseStartDate = dateStr; });
  const autoScanDate = () => mutate((d) => { const c = programCalendar(d); d.settings.nextBodyScanDate = c.autoNextScanDate; });
  const recalcNow = () => mutate((d) => { d.settings.lastRecalc = Date.now(); }); // forces a fresh derive + re-render
  const replaceState = (obj) => setState(() => { const base = defaultState(); const merged = { ...base }; Object.keys(obj).forEach((k) => { merged[k] = obj[k]; }); if (!merged.bodyScans || !merged.bodyScans.length) merged.bodyScans = base.bodyScans; return merged; });
  const resetAll = () => setState(defaultState());
  // Sample data fills only EMPTY days — any real log you already have
  // (today's workout, meals, watch numbers) is kept untouched.
  // ---------- encrypted cross-device sync ----------
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const doPull = async () => {
    const pass = getSyncSecret();
    const url = state.settings.syncUrl;
    if (!pass || !url) { setSyncStatus({ type: 'err', msg: 'Add your sync URL and passphrase first.' }); return; }
    setSyncBusy(true); setSyncStatus({ type: 'info', msg: 'Pulling from cloud…' });
    try {
      const { syncId, key } = await deriveSync(pass);
      const remote = await pullRemote(url, syncId, key);
      if (!remote) { setSyncStatus({ type: 'info', msg: 'No cloud data yet. Push from your main device first.' }); return; }
      setState((local) => mergeSyncedState(local, remote.state));
      localStorage.setItem(SYNC_UPDATED_KEY, String(remote.updatedAt));
      setSyncStatus({ type: 'ok', msg: 'Merged cloud data. Logs already on this device were retained.' });
    } catch (e) {
      setSyncStatus({ type: 'err', msg: `Pull failed (wrong passphrase or URL?): ${e.message}` });
    } finally { setSyncBusy(false); }
  };

  const doPush = async () => {
    const pass = getSyncSecret();
    const url = state.settings.syncUrl;
    if (!pass || !url) { setSyncStatus({ type: 'err', msg: 'Add your sync URL and passphrase first.' }); return; }
    setSyncBusy(true); setSyncStatus({ type: 'info', msg: 'Pushing to cloud…' });
    try {
      const { syncId, key } = await deriveSync(pass);
      const at = await pushRemote(url, syncId, key, state);
      localStorage.setItem(SYNC_UPDATED_KEY, String(at));
      setSyncStatus({ type: 'ok', msg: 'Backed up to cloud. Pull it on your other device.' });
    } catch (e) {
      setSyncStatus({ type: 'err', msg: `Push failed: ${e.message}` });
    } finally { setSyncBusy(false); }
  };

  // auto-sync: pull once on open if the remote copy is newer
  useEffect(() => {
    if (!state.settings.syncAuto) return;
    const pass = getSyncSecret();
    const url = state.settings.syncUrl;
    if (!pass || !url) return;
    (async () => {
      try {
        const { syncId, key } = await deriveSync(pass);
        const remote = await pullRemote(url, syncId, key);
        const localAt = parseInt(localStorage.getItem(SYNC_UPDATED_KEY) || '0', 10);
        if (remote && remote.updatedAt > localAt) {
          setState((local) => mergeSyncedState(local, remote.state));
          localStorage.setItem(SYNC_UPDATED_KEY, String(remote.updatedAt));
        }
      } catch { /* silent on open */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-sync: debounced push a couple seconds after any change
  useEffect(() => {
    if (!state.settings.syncAuto) return;
    const pass = getSyncSecret();
    const url = state.settings.syncUrl;
    if (!pass || !url) return;
    const t = setTimeout(async () => {
      try {
        const { syncId, key } = await deriveSync(pass);
        const at = await pushRemote(url, syncId, key, state);
        localStorage.setItem(SYNC_UPDATED_KEY, String(at));
      } catch { /* silent; manual buttons surface errors */ }
    }, 2500);
    return () => clearTimeout(t);
  }, [state]);

  const loadDemo = () => setState((prev) => {
    const gen = generateDemoData(prev);
    const keep = (existing = {}, demo = {}) => ({ ...demo, ...existing }); // existing (real) wins
    return {
      ...prev,
      workoutSessions: keep(prev.workoutSessions, gen.workoutSessions),
      mealLogs: keep(prev.mealLogs, gen.mealLogs),
      habitLogs: keep(prev.habitLogs, gen.habitLogs),
      watchLogs: keep(prev.watchLogs, gen.watchLogs),
      supplementLogs: keep(prev.supplementLogs, gen.supplementLogs),
    };
  });

  const ctx = {
    state, setState, mutate, patchSession, mutateEntry, getSession,
    setMeal, setWatch, toggleHabit, setHabits, toggleSupplement, toggleBeverage, toggleActivity, setSatMode, setDayOverride, swapWorkoutDates, clearWorkoutSwap,
    addScan, updateScan, deleteScan, setProfile, setSetting, setRestart, saveCustomExercise, deleteCustomExercise, restartCalendar, autoScanDate, recalcNow, replaceState, resetAll, loadDemo,
    doPull, doPush, syncStatus, syncBusy, getSyncSecret, setSyncSecret,
    selDate, setSelDate, goto: setTab,
  };

  const tabTitle = { home: 'Dashboard', plan: 'Planner', train: 'Train', fuel: 'Fuel', body: 'Body', habits: 'Habits', stats: 'Stats', more: 'More' }[tab];

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {healthNotice ? (
        <div className={`sync-toast ${healthNotice.error ? 'error' : ''}`} role={healthNotice.error ? 'alert' : 'status'}>
          {healthNotice.error ? <AlertTriangle size={15} /> : <Watch size={15} />} {healthNotice.message}
        </div>
      ) : null}
      <Sidebar tab={tab} setTab={setTab} phase={phase} />
      <div className="app-body">
        <header className="app-header">
          <div className="brand">
            <div className="brand-mark mobile-only">R</div>
            <div className="hd-title">
              <h1>{tabTitle}</h1>
              <span>{phase.name} · Week {phase.programWeek} · Day {phase.programDay}</span>
            </div>
          </div>
          <div className="score-chip">
            <span className="day-badge" title="Program day (from your start date)">D{phase.programDay}</span>
            <MetricRing pct={score} value={score} color={score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--cyan)' : 'var(--amber)'} size={40} stroke={5} />
          </div>
        </header>

        <main className="app-main" id="main-content" tabIndex="-1">
          {tab === 'home' && <HomeTab ctx={ctx} />}
          {tab === 'plan' && <PlanTab ctx={ctx} />}
          {tab === 'train' && <TrainTab ctx={ctx} />}
          {tab === 'fuel' && <FuelTab ctx={ctx} />}
          {tab === 'body' && <BodyTab ctx={ctx} />}
          {tab === 'habits' && <HabitsTab ctx={ctx} />}
          {tab === 'stats' && <StatsTab ctx={ctx} />}
          {tab === 'more' && <MoreTab ctx={ctx} />}
        </main>
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}
