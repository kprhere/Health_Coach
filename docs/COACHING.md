# Coaching

The coach is a set of conservative rules over your own logs. It is not medical advice, never diagnoses, and its
numbers are not clearance to train. Every threshold is a configurable heuristic, not a validated injury predictor.

Code: `src/coach/` (`metrics`, `rules`, `proposals`, `overrides`, `effective`, `constants`). Rule set id: `coach-rules-1`.

## Flow

confirmed data -> metrics -> rules -> constrained proposal -> validation -> your acceptance (or a permitted automatic
action) -> versioned override. Optional AI can reword an explanation from the numbers; it cannot change anything.

When it runs: when you open the app, when relevant data changes (a workout, recovery numbers, availability), and
when you tap **Reassess my plan**. It does not run while the app is closed; there is no background infrastructure
for that, and the app does not claim one.

## Measures

Windows: 3, 7, 14 and 28 days ending on the as-of date. Only data dated on or before that date is used.

- **Working set**: not a warm-up, not skipped, not unfinished, with reps > 0 and a numeric weight (or a bodyweight
  exercise with a blank weight) or seconds > 0. A superset, circuit or finisher cell counts once; a replaced
  exercise counts under the replacement; drop-set drops count as sets and are flagged.
- **Resistance, timed and conditioning work are kept separate.** Weights are only compared within the same exercise
  name (never across different machines).
- **Per-muscle sets**, average RPE, top-set trend per exercise.
- **Recovery**: 7-day average sleep. Resting HR is compared with your own baseline (median of the 28 days before the
  last 3), only with at least 7 values. HRV is ignored without 14 baseline values.
- **Pain**: exposures per exercise (pain >= 3 on a set) in 14 days.
- **Session load** = session RPE x minutes, only when you entered both. Otherwise it is listed as missing.
- **Missing vs inactive**: a planned day with no log is "not logged" (unknown). It counts as missed only if you marked
  it (`dayStatus`).

## Rules and defaults (`constants.js`)

| Setting | Default |
|---|---|
| painBlockLevel / painRepeatCount | 3 / 2 exposures in 14 d |
| sleepLowH | 6 h (7-day average) |
| rhrElevatedBpm | 7 above personal baseline |
| loadSpikeRatio | 1.5 x prior weekly average (needs >= 2 prior weeks) |
| restartGapDays | 14 |
| maxReductionPct / autoMaxReductionPct | 25 / 20 |
| cooldownDays / maxAppliedPer7Days | 3 / 3 |

Rules: pain-block, low-recovery, load-spike, restart, progression, availability, fasting. Pain blocks progression and
suggests evaluation by a qualified clinician. Missed volume is never added to later sessions.

## Operations (closed list)

`scale-sets`, `drop-block` (finishers or blocks named optional), `substitute`, `move` (uses the existing swap
mechanism), `recovery-day`, `increase`. Automatic mode may only use the first four and never `increase` or `move`.

## Modes and safety

- **Recommend (default)**: every change waits for Accept. You can Keep current plan or Edit (smaller reduction, pick
  which parts).
- **Automatic conservative** (off; enabled per person): validated reductions and recovery swaps within the caps.
- Completed and in-progress sessions are never altered. Every affected date is validated again immediately before
  applying, and multi-day changes apply atomically. Stale proposals (inputs changed) and duplicates are rejected.
  A declined proposal is not re-offered during the cooldown.
- **Undo** works for an untouched future session. Each change has an audit entry with the time, rule version and
  evidence.

## Precedence

base program < workout swap < manual edits and added exercises < accepted adaptive override.
A date whose session already has data is never changed. Nutrition, fasting, activity and health logs stay on their
original dates. The per-person restriction "no hard lifting on fasting days" is honoured when set.

## Optional AI (`src/coach/ai.js`)

Off unless enabled in settings by the person. Only a minimal payload (rule name, numeric evidence, window sizes,
missing list; dates as day offsets) is sent. Output must pass a strict schema and numeric check or it is discarded and
the rule-based text is shown. A local Ollama model needs no key; a hosted endpoint needs a server-side key (an edge
function), never a key in the browser. The core app works with no model.

## Limits

Heuristics, not predictions. Estimates of load and recovery depend on how complete your logging is, and the coach says
what is missing instead of guessing.
