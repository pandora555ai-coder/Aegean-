# 119 — ControllerScreen: fix the two pre-existing 360px failures

Scope: client/src/screens/ControllerScreen.tsx only. Both failures were
measured and proven pre-existing in task 118 (baseline: settings-panel
segmented row 366.19px wide at a 360px viewport; setting-mode-quiz
button 62.1×31.8px).

## Fix

- `settingsRow`: added `flexWrap: 'wrap'` so a label + segmented group
  that don't fit on one line drop the group to its own line instead of
  overflowing the panel.
- `segmentedGroup`: added `flexWrap: 'wrap'` (root cause — as a flex
  child with no wrap, its min-content width was the sum of every button,
  which pushed past the panel and the viewport) and
  `justifyContent: 'flex-end'` so wrapped buttons stay aligned to the
  panel's right edge.
- `segmentActive`/`segmentInactive`: added `minHeight: '44px'`,
  `boxSizing: 'border-box'`, and switched to
  `display: 'inline-flex'` with centered content so the taller button
  still centers its label.

## Acceptance criteria — results

1. 360px Playwright (localhost:5173, VIP join flow, lobby settings
   panel open): `document.documentElement.scrollWidth` ==
   `clientWidth` == 360px — zero horizontal overflow. Widest row
   (`settings-panel` children) is 289.22px, well inside the 320px
   panel.
2. Same run: every button in the settings panel is 44×44px or larger.
   Smallest is `setting-time-10000`/`-20000`/`-30000` at
   50.56×44px (height was 31.78px before the fix).
3. Inverse palette check (fallback-form-aware, 11 animation vars
   excluded), same command as 118: 0 → 0 (unchanged, still clean).
