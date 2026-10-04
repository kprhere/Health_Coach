# Design system

One system, written for this app. It draws on general principles from the two UI resources listed in
`THIRD_PARTY_NOTICES.md` (both MIT, read only). Where they disagree, this document decides.

## Principles
1. **Logging speed beats decoration.** The Train screen has no entrance animations and no content that moves under a thumb.
2. **Show real data or say it is missing.** Empty, loading, error, offline and insufficient-data states are designed, not blank.
3. **Meaning never rides on colour alone.** Every tone chip carries text or an icon.
4. **One accent per job.** Cyan = measurement, amber = action/coach, green = done, red = warning.

## Conflict resolution
| Topic | Taste-style advice | UX-rule advice | Decision |
|---|---|---|---|
| Layout | Break symmetry, asymmetric grids | Consistent spacing rhythm | Asymmetric split (main + aside) on desktop only; single column on phone; one 4 px spacing scale. |
| Surfaces | Coloured shadows, varied radii | Clear affordances | Two radii (16 / 11), one shadow token, no decorative gradients except the primary button. |
| Motion | Rich hover/transition | Respect reduced motion | 120 ms transitions on state change only; all motion removed under `prefers-reduced-motion`. |

## Tokens (`src/ui/tokens.css`)
Colour: `--bg --surface --surface-2 --surface-3 --line --text --muted --faint --cyan --amber --green --red --violet`.
Type: IBM Plex Sans for text, IBM Plex Mono for numbers and labels (`--fs-xs … --fs-xl`). Space: `--sp-1…6` (4 px steps).
Target size: `--tap: 44px`. Safe areas: `--sat --sab --sal --sar` (installed iPhone PWA).

## Requirements checked in review
- Touch targets ≥ 44 px (`.btn`, `.btn.xs`, inputs).
- Visible `:focus-visible` ring on every control; keyboard reachable; sheets close on Escape.
- Text contrast ≥ 4.5:1 on `--bg`/`--surface` (`--muted` #aab4bd and `--faint` #8996a1 were chosen for this).
- `prefers-reduced-motion` honoured globally.
- Status is announced: toasts use `role="alert"` or `role="status"`.

## Components
Shared in `src/components.jsx`: `Card`, `Chip`, `Banner`, `Sheet`, `EmptyState`, `StatCell`, `MetricRing`, `LineTrend`, `BarMini`.
New screens must compose these before adding another.

## Screen priorities
Home: today's session, recovery inputs, recent load, one next action. Train: exercise blocks, previous
performance and target, quick entry, rest timer. Plan: week, proposed changes, accepted adjustments.
Stats: load, consistency, muscle coverage, trends. Coach: recommendations with evidence and a
current-vs-proposed comparison. Account: sync state, export, recovery, privacy.
