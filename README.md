# Body Recomp OS

A personal body-recomposition operating system. Mobile-first for iPhone Safari (Add to Home Screen), fully responsive up to laptop and desktop. Plans, logs, coaches and tracks a fat-loss + lean-muscle phase built around a 4-day Upper / Lower split, swimming, badminton and one mobility class.

Single user, local-first, no login. Data lives on the device in localStorage, with optional end-to-end encrypted Cloudflare KV sync. Export a JSON backup any time. Changing program dates never deletes logs.

## Run and build

```
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the built dist/
```

## Deploy to Vercel

The repo includes vercel.json with an SPA rewrite. Import the project in Vercel (framework preset: Vite) or run vercel. Build command npm run build, output dist. After deploy, open the URL in iPhone Safari, Share, Add to Home Screen. base: './' keeps asset paths relative so it also works on Netlify, GitHub Pages, StackBlitz and CodeSandbox and from the home screen.

## Why this split

4-day Upper / Lower hybrid. After a 40-day layoff and in a fat-loss deficit, recovery is the limiter, so a 6-day PPL is too much volume too soon. Upper / Lower hits every muscle about twice a week at a volume you can recover from, which is what holds muscle while losing fat. Tuesday and Thursday evening swims plus optional morning badminton already cover conditioning. Thursday stays a true fast + recovery day. Saturday is the BodyBalance mobility slot with a full lifting fallback. This is a restart phase: lower load, better form, RPE control, no failure, roughly 70% of old working weight to start. It is not a beginner rehab plan. Every non-fasting lifting day has 7-8 blocks, and both upper days include direct biceps and direct triceps as their own sets plus an arm finisher.

## Restart load

Each single-exercise card has a restart panel: enter your old working weight, set a restart percentage (default 70%), and it shows the suggested restart weight (old x %). Tap Use to drop it into the first working set. No old weight yet shows "Set baseline today". Edit the percentage per exercise; change the default in More.

## Program dates

More has a Program dates panel. Set the program start date, restart-phase start date and next scan date. Week and day recalculate from those. Buttons: Reset to Week 1 Day 1 (today), Keep logs and restart the calendar from a chosen date, and Recalculate. None of these touch your logs; only Reset all data does.

## Workout blocks

Workouts are built from first-class blocks, not flat lists: single, dropset, superset, circuit, finisher. Round-based blocks log weight, reps, RPE, auto-RIR, rest, pain, form and notes per exercise per round, with one-tap Complete Round, Copy Previous Round, Add Round, per-exercise Skip (with reason) and Replace, and a rest timer after each round. A superset or circuit only reads complete once every exercise in every planned round is done. Warm-up sets are tagged and excluded from history, volume and PRs. Exercise history and volume aggregate across single sets and supersets, so a Face Pull inside a superset updates the same Face Pull history as a straight set.

Train → Swap day exchanges the selected date's workout with another date while leaving meals, fasting, activities, Apple Health data and completed logs on their original dates. Swaps are included in JSON backup and encrypted cloud sync. A date cannot be swapped after either workout has logged data, and a hard lifting session cannot be moved onto a fasting day. The weekly planner marks both dates as swapped and the Train tab can undo an untouched swap.

## Data

Seeded from three real Evolt 360 scans. Add, edit, delete and compare scans in Body. Apple Watch numbers can be entered manually or imported through the privacy-safe Apple Shortcut link under More → Apple Health sync. The Shortcut sends one numeric value per metric in a URL fragment, which the app consumes once and removes. A CSV import stub is in place for later column mapping.

## Apple Health Shortcut

The in-app guide uses today’s summed steps, total asleep duration from the previous 18 hours, the latest resting heart rate from the previous 24 hours and average HRV from the previous 18 hours. Sleep Score is optional because Shortcuts availability varies. Run the automation after waking, when overnight Health data is complete. Recovery uses sleep, resting heart rate and logged pain; HRV and Sleep Score remain tracking fields until a personal baseline is available.

## Custom equipment and nutrition logging

Fuel includes separate 3- and 4-egg-white portions in Quick add. Planned non-vegetarian lunch and dinner use a macro-balanced protein trade: 105 g chicken + 4 whites (or about 115 g chicken + 3 whites) in place of 150 g chicken, rather than stacking eggs on top. More → Custom equipment & exercises stores user-owned machine details, default sets and rep targets in normal app state, so JSON backup and encrypted cloud sync preserve them across devices and future releases. Compatible machines appear as recommended replacements for matching plan slots instead of silently adding weekly volume. The built-in Upper Body B plan uses a 3-set Chest-Assisted Dip machine slot in place of the pec fly; the pec fly remains available in the library. Exercise replacement reassigns history and coaching metadata but intentionally keeps existing set rows and weights to avoid overwriting a workout in progress.

Planner and Fuel provide a per-date food-plan switch: Scheduled, Vegetarian, No-moon fast until 1 PM, or No-moon fast until 2 PM. Every vegetarian plan excludes chicken, fish, whole eggs and egg whites. The manual fast is fully vegetarian after the selected end time; the scheduled Thursday fast-plus-swim plan remains distinct. Overrides update meal choices, targets, totals and day labels for that date while preserving the scheduled workout and all existing logs. Overrides are included in JSON backup and encrypted cloud sync.

Fuel → Daily drinks tracks unsweetened green tea at 10 AM and 3 PM without changing meal indices or calories. It also offers 250 ml unsweetened coconut water as a sport-day hydration choice; its estimated 45 kcal, 10.5 g carbohydrate and 0.25 L fluid are included in daily totals. Coconut water is not part of the fasting window.

## Dependencies, warnings and security

Handled, not suppressed:

- Recharts upgraded to v3 (v2 was deprecated). Chart components were verified against the v3 API and build cleanly.
- Vite upgraded to v6 and @vitejs/plugin-react to 4.3.x. This clears the esbuild dev-server advisory that affected Vite 5.
- npm audit reports 0 vulnerabilities (info/low/moderate/high/critical all 0). npm audit fix --force was not needed and was not used.
- Bundle size: the app code is ~115 kB. Recharts is a large but audited charting library, so vite.config.js splits it (and lucide icons) into their own long-term-cached vendor chunks via manualChunks, and sets chunkSizeWarningLimit to 700 for that one known vendor chunk. This is a documented decision, not a hidden warning.
- Install scripts (esbuild, fsevents) are standard postinstall steps for the build toolchain. If your npm version blocks build scripts, run npm install and approve them (npm approve-builds on npm 11+); they are only needed at build time, not at runtime in the deployed app.

## Source layout

```
src/
  data.js           program blocks, exercise library (incl. EOS machines), nutrition, seed scans
  helpers.js        dates from settings, sessions, history, restart load, scoring, analytics
  components.jsx    nav, rings, charts, sheet, rest timer, atoms
  loggers.jsx       single / dropset / superset / circuit / finisher loggers
  BodyRecompOS.jsx  state + the eight tabs
  App.jsx           app wrapper
  main.jsx          entry
  styles.css        dark theme + responsive layout (mobile bottom nav, desktop sidebar)
tests/              Apple Health, scoring, weekly-plan and encrypted-sync regression tests
index.html, vite.config.js, vercel.json, public/manifest.json
```
