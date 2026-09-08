# Task 198 — Anavasis: Socrates must not occlude the question slab

## Root cause

`ClimbQuestionView.tsx`'s `SLAB_WRAP_STYLE` (the question slab wrapper for
Frame A / CLIMB_QUESTION) used `zIndex: 1` — the same value as
`SocratesFigure` (`socrates-figure-root`, `position: absolute; z-index: 1`)
and *below* `AnavasisClimbers` (`anavasis-climbers-root`, `z-index: 2`).
None of these three establish a stacking context that isolates them from
each other (the `anavasis-scene-container` wrapper is a plain, unpositioned
`<div>`), so they all compete in one shared stacking context. On a z-index
tie, CSS falls back to DOM/paint order — and `SocratesFigure` renders as a
HostScreen sibling *after* the scene container in JSX, so it painted over
the slab wherever their boxes overlapped. Socrates' pose for the climb
(`left: 57%`, standing at the temple threshold) genuinely overlaps the
slab's own box (`left: 16%`, `width: 52%` → right edge at 68%) whenever the
slab is tall enough — confirmed below.

## Fix

One-line bump: `SLAB_WRAP_STYLE`'s `zIndex: 1` → `zIndex: 3`, matching the
"always-on-top chrome" tier HostScreen already uses for `Krater`/
`SpeechSlab` (both `zIndex: 3`). This puts the slab above both Socrates
(1) and AnavasisClimbers (2) regardless of DOM order, with no reposition
of Socrates and no change to Frame B or any animation.

## Verification

Real gameplay via a throwaway server+client pair (scratch ports, never
3001/4001/5173) and Playwright: 2 bots, `quiz` mode, `gameLength: 'short'`,
`finaleMode: 'climb'`, driven to CLIMB_QUESTION. A temporary dev-only hook
(reverted before commit — `git diff` at commit time touches only
`ClimbQuestionView.tsx`) forced the climb's first drawn question to
`q0427`, the single longest question text in the bank (100 characters, the
max in `server/src/data/questions.json`), to hit criterion 2's "max slab
height" case.

**Criterion 1** (natural-length question, 51 chars): 5×3 grid of
`document.elementFromPoint` probes across the slab's bounding box —
**15/15** resolved to the slab or a descendant (`question-text` or the
slab's own box). Cross-check: `SocratesFigure`'s bounding box
(left 729.6–816, top 25.9–241.9) *does* geometrically overlap the slab's
box (left 204.8–870.4, top 96.8–648) — `elementFromPoint` at Socrates'
own center (773, 134) resolved to the slab's `question-text` div, not
Socrates, confirming the fix (not just an absence of overlap).

**Criterion 2** (longest question in the pool, 100 chars): **10/15**
resolved to the slab; the other 5 (the bottom probe row) resolved to
nothing (off-canvas). This is a *separate, pre-existing* bug, not caused
by this fix or reintroduced by it: `ClimbQuestionView`'s slab has no
height ceiling for its `useFitFontSize` hook to shrink against (unlike
`TrialQuestionView`, which sits inside `GameLayout`'s determinate-height
column with `flex: '1 1 0'` on its `MarbleSlab`) — so at 100 characters
the slab's `MarbleSlab` grew to 1051px against a 720px viewport, and its
bottom edge (top 96.8 + height 1051 = 1148px) ran off-screen.
`design/anavasis-reference.html`'s own `#qslab` has the same gap (only
`left`/`top`/`width` set, no height ceiling) — it never hit this because
its demo text is a single short fixed string. None of the 5 off-canvas
points resolved to Socrates or any other intruding element — the
stacking fix holds everywhere it's actually visible; the shortfall is a
viewport-overflow gap, out of this task's stated scope (z-order only,
"do not reposition Socrates unless stacking alone cannot work", no
mention of the auto-fit sizing chain). Flagged for a follow-up task
rather than fixed here.

**Criterion 3** — elements intersecting the slab's bounding box in Frame A
(natural-length question, 15/15 case):
- `anavasis-scene` (the AnavasisScene backdrop root, `position: absolute;
  z-index: auto`) and its ~40 SVG primitive descendants (stars, rock
  paths, city windows) — BELOW the slab; this is the scene background
  painted first in DOM order at the base z-index tier, self-evident scene
  art with no z-index of its own.
- `socrates-figure` (`position: absolute; z-index: 1`) — geometrically
  overlaps the slab's box (see above) but is now BELOW it (`zIndex: 3` on
  the slab wrapper beats it outright, independent of DOM order) — this is
  the bug this task fixes.
- No other testid'd element (Krater, room-code corner, AnavasisClimbers'
  individual figures, AnavasisDuel) intersected the slab's box in this
  run: Krater/room-code sit in the top-right corner outside the slab's
  horizontal span (slab's right edge at 68%); AnavasisDuel doesn't render
  during CLIMB_QUESTION; no climber's step happened to fall inside the
  slab's box this run (climbers start at step 4/24 in a fresh climb, far
  from the temple terrace the slab occupies). No intentional-chrome
  exception was needed — the slab is the sole readable element in Frame A.
