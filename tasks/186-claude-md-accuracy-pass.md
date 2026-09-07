# 186 — CLAUDE.md accuracy pass (docs only, zero code changes)

CLAUDE.md had accreted stale claims. Every claim below was verified against
the repo (grep/ls), not memory. `git status --short` shows only CLAUDE.md
changed.

## 1. Colour section

Real filename: `client/src/palette-theatro.css` (renamed off
palette-elaiografia.css in Task 159's Ελαιογραφία → Θέατρο palette swap;
the old file no longer exists). Real token count: **12** :root tokens
(--night-0 --night-1 --marble --marble-2 --marble-3 --carve --wine
--wine-2 --ember --olive --tv-safe-top --tv-safe-bottom) — not the old
"ten". `#ef4444`'s actual home: `client/src/components/Krater.tsx`
(`KRATER_CRITICAL`), not TimerRing — Task 162 replaced TimerRing with
Krater and the literal moved with it. Also found and fixed: a SECOND
sanctioned hex the old text missed entirely, `#BFE6FF` (SophistsRow.tsx's
`ICE_GLOW`, Task 163c) — the doc claimed only one. Rewrote the exemption
list to name the real categories (TheatreScene/SocratesFigure SVG art,
the drawing/canvas literals, /dev routes) instead of an outdated three.
Also fixed the inversion-check's local-var exclusion list: only `--dx
--glow-color --i` are live now, not the old eight-name list.

## 2. Blitz section

GameModeId union, verbatim from shared/src/index.ts:
`'quiz' | 'draw' | 'numeric' | 'full' | 'blitz'`. Blitz IS a registered
mode now (Task 156): server/src/modes/blitz.ts calls registerGameMode,
phases are LOBBY/BLITZ/BLITZ_REVEAL/GAME_OVER, it has real TV views
(host/BlitzView.tsx, host/BlitzRevealView.tsx) and a real phone branch in
ControllerScreen.tsx (BlitzSwipeCard, Task 181's "follows the finger"
rebuild, titled through greekUpper). Rewrote the section to describe both
that real mode AND the still-standalone /dev/blitz prototype (DevBlitzScreen.tsx,
unrelated swipe-card implementation), which the old text conflated as if
only the prototype existed.

## 3. Contradictions

- crowd.ts file-listing entry said "no playback yet (Task 36 not built)"
  while the Crowd mood section two pages later says playback IS built.
  Old → new: dropped the false claim, pointed at the Crowd mood section,
  and fixed "wired into all four modes" → "every mode" (blitz has its own
  crowd wiring from Task 156a, which the "four modes" count missed).
- Screenshot harness: old text said captures were "hardcoded 1920x1080,
  so measuring at 1280x720 needs its own throwaway script." Verified
  against dev/screenshot-phases.ts: the TV context is already
  `{ width: 1280, height: 720 }`. Old → new: the harness already captures
  at 1280x720; no throwaway script is needed.

## 4. Trial addendum + full sweep

Added one sentence to the trial paragraph naming `trialWrongHit`/
`trialDrainPerSec` (shared/src/index.ts) as proportional to `referenceLife`,
the trial's max entry score (Task 185).

Full sweep: extracted every file-path-shaped token in CLAUDE.md and checked
each against the repo. Missing-file count **before the fix: 1**
(`client/src/palette-elaiografia.css`, referenced 6 times) — **after: 0**
(the remaining 2 mentions of that filename are historical, "renamed off X
in Task 159," not live path claims). Also corrected while sweeping:
`PapyrusPanel` renamed to `MarbleSlab` (component deleted, replaced by
Task 159; two mentions fixed — the "Where things live" listing and the TV
layout `flex: 0 0 auto` bullet), and the Stack section's dev-route list was
missing `/dev/crowd` (a real route, DevCrowdScreen.tsx, Task 36a) — added.
