---
name: coach-engine
description: Use when changing adaptive coaching in Health_Coach - metrics, rules, proposals, overrides, plan generation or the optional AI layer. Keeps the engine deterministic, conservative and reversible.
---

# Coach engine

Flow: confirmed data -> metrics -> constrained proposal -> validation -> acceptance (or permitted automatic action) -> versioned override.
Code: `src/coach/{constants,metrics,rules,proposals,overrides,effective}.js`. Docs: `docs/COACHING.md`.

## Rules of the road
- Pure functions. No clock reads inside calculations: pass `asOf` and `nowMs`. Only data dated <= `asOf` may be used.
- A new or changed rule bumps `RULE_VERSION` and adds tests for: fires, does not fire, missing data, future data ignored.
- Ops vocabulary is closed (`OPS`). Automatic mode may only use `AUTO_OPS` (reductions, recovery). Increases and moves always need acceptance.
- Never add missed volume to later sessions. Never touch completed or in-progress sessions. Validate every affected date again right before applying.
- Missing is not zero: unlogged days are "not logged"; HRV is ignored without a personal baseline; session load needs both RPE and minutes.
- Pain: block progression, suggest qualified evaluation, never name a condition.
- Models never mutate state or invent measurements: model output must pass the schema and the deterministic validator or be dropped.

## Done when
`node --test tests/coach-*.test.mjs tests/plan-generator.test.mjs` pass, precedence in `docs/COACHING.md` still holds
(base < swap < manual edit < adaptive override), and undo works for an untouched future session.
