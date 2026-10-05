---
name: ui-screen
description: Use when adding or changing a screen or component in Health_Coach. Applies the project design system, accessibility checklist and honest empty/error/offline states.
---

# UI screen

Read `docs/DESIGN_SYSTEM.md` and `src/ui/tokens.css` first. Compose existing components before adding one.

## Checklist
- Tokens only (`var(--...)`); no hardcoded colours, radii or font sizes.
- 44 px touch targets, visible `:focus-visible`, full keyboard path, `Escape` closes sheets.
- Contrast >= 4.5:1; meaning is never carried by colour alone (text or icon too).
- States designed: empty, loading, error, offline, insufficient data. Show real data or say it is missing.
- Phone first (375 px), then desktop split layout. Respect safe-area insets and `prefers-reduced-motion`.
- Train screen: no entrance animations or layout shifts while logging.
- Status text uses `role="status"` or `role="alert"`.

## Verify
Run the app, check 375 px and desktop, tab through it, toggle offline, and run `npm test` and `npx vite build`.
Screenshots and fixtures use synthetic data only.
