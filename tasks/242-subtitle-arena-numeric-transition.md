# Task 242 — subtitles placement, arena name clipping, estimation label collision, phase-transition zoom (diagnosis only)

Context check: `/root/Aegean-`, clean tree, HEAD `37b9c6b` (Task 239) — confirmed
before starting. Client-side only; no phase-machine or server-timing change.

Verified with four real in-process-server + real-Vite-client + real-Playwright
harnesses (no screenshots): `dev/242-subtitle-check.ts` (A + D),
`dev/242-numeric-check.ts` (C), `dev/242-name-clip-check.ts` (B, duel + climb +
plaques baseline), `dev/242-podium-name-check.ts` (B, podium surface, split out
because the quiz+trial game it drives is slow and doesn't need to share a
browser session with the fast duel/climb sections). All four are kept as
regression checks.

## A — SOCRATES subtitle repositioning

`client/src/components/SocratesSubtitle.tsx`: moved the bar from
`bottom:3.5cqh` to `top:2cqh` (same safe-area-bound root), and strengthened
readability: background 78%→90% night-0, added a 1px marble-3 border (the
same "chip" treatment the corner controls use) + a box-shadow, and bumped
font-size 3cqh→3.4cqh.

**Why this zone**: `AEGEAN_DESIGN.md` does not exist in this repo (checked;
only `DESIGN.md`, a high-level concept doc with no readability guidance) — the
zone choice is justified against CLAUDE.md's own TV-layout rules and measured
geometry instead. `StageAnnounceOverlay` centers its card in the safe-area
container (measured content box y=261.6..458.4 px at 1280×720);
`SophistsRow` occupies the FULL-viewport container's bottom band (measured
y=457.2..673.2 px). The only band clear of both is ABOVE the card — the
literal upper third of the screen — so the bar now pins to the top of the
safe area instead of the bottom, which is exactly where it used to collide
with the sophists' plaques.

**Criterion 1 — measured, `dev/242-subtitle-check.ts`:**
| beat | subtitle box | SophistsRow box | stage-card box | overlap? |
|---|---|---|---|---|
| (i) GAME_INTRO | x153.6 y14.4 w972.8 h56.9 | x128 y457.2 w1024 h216 | x196.5 y261.6 w886.9 h196.8 | **none, either** |
| (ii) STAGE_INTRO | x153.6 y14.4 w972.8 h88.7 | (same) | (same) | **none, either** |

Bar computed style: `fontSize=24.48px`, `color=rgb(237,230,214)` (marble),
`background=night-0 @ 90%`, `border=1px marble-3 @ 55%` — all 7/7 checks pass.
(One test-authoring note, not a bug: the harness first asserted GAME_INTRO
shows no stage card, which failed — Task 236 wires the stage-1 card up
*before* GAME_INTRO plays, contradicting Task 235's pre-236 finding; fixed the
assertion to check overlap instead, which is what actually matters.)

## B — "the arena" name clipping

**Which component, and why Task 235 missed it**: neither the reported bug nor
"the arena" is `SophistsRow` (Task 224/235's own "plaques", `.plaque .n`,
`client/src/components/SophistsRow.tsx`) — that one already has a
length-based shrink AND an ellipsis backstop, confirmed still clean at 4/8/12
chars (`dev/242-name-clip-check.ts` §0). "The arena" is the DUEL,
`client/src/components/AnavasisScene.tsx`'s `AnavasisDuel`
(`data-testid="anavasis-duelist-a"/"-b"`, class `.anavasis-duelist .nm`) —
thematically the closest match to "arena" (single combat), a different file,
a different CSS class, and a NARROWER fixed lane (17cqh ≈ 122.4px at 720p)
than SophistsRow's plaque. It had **no shrink mechanism and no
overflow:hidden at all** — a flat `font-size:2.5cqh` regardless of name
length. Measured before any fix: `ΔΗΜΗΤΡΗΣ` (8 chars) rendered 129.5px wide
against a 122.4px lane (spills), `ΝΞΟΠΡΣΤΥΦΧΨΩ` (12 chars) rendered 185.6px
(spills by 63px) — baseline reproduced live, matching "clipped in 3/3 live
runs."

**A second surface has the identical defect, contradicting the task's own
premise**: `AnavasisClimbers` (`.anavasis-soph .nm`, "the finale steps") was
ALSO measured spilling its own (much narrower, 8cqh ≈ 57.6px) lane at 8
chars — `ΔΗΜΗΤΡΗΣ` rendered 79.1px (37% over), `ΝΞΟΠΡΣΤΥΦΧΨΩ` 114.5px (99%
over) — *worse*, proportionally, than the duel. "Finale steps render it in
full" does not hold for the live climb; it may hold specifically at the
frozen GAME_OVER ceremony (fewer/wider-spaced figures there), which this task
did not separately re-test. Documented here rather than treated as
out-of-scope, since fixing only the duel while leaving a freshly-measured
identical overflow in its sibling component would be an inconsistent
half-fix — same file, same shrink helper, one extra call site.

**Fix**: `client/src/components/AnavasisScene.tsx` — added
`laneNameFontSizeCqh(name, baseCqh, baseChars, minCqh)`, the same
shrink-by-length shape `SophistsRow.nameFontSizeCqh` already uses, applied at
both call sites (`AnavasisClimbers`' `.nm`, `Duelist`'s `.nm`), PLUS a hard
`max-width` (8cqh / 17cqh, matching each lane) + `overflow:hidden;
text-overflow:ellipsis;white-space:nowrap` backstop on both CSS rules — the
same two-layer defence (shrink first, ellipsis for whatever still doesn't
fit) `SophistsRow`'s own plaque and `PodiumView`'s podium-name already use.

**Criterion 2 — measured, `dev/242-name-clip-check.ts` + `dev/242-podium-name-check.ts`, all three surfaces:**
| surface | file | 4 chars | 8 chars (ΔΗΜΗΤΡΗΣ) | 12 chars |
|---|---|---|---|---|
| plaques (224) | SophistsRow.tsx | 15.84px, no clip | 13.86px, no clip | 8.13px, no clip |
| **arena (this fix)** | AnavasisScene.tsx (duel) | n/a (2-player duel) | 115.9px fits in 122.4px lane, no ellipsis needed | 116.7px fits in 122.4px lane, no ellipsis needed |
| **arena/finale steps (this fix)** | AnavasisScene.tsx (climb) | 43.0px in 57.6px lane | 53.2px in 57.6px lane, no ellipsis needed | 57.6px (floor+ellipsis backstop caught this extreme case, capped exactly at the lane) |
| finale/ΤΕΛΙΚΗ ΚΑΤΑΤΑΞΗ | PodiumView.tsx (unchanged, verify only) | 69px, no clip | 121px, no clip | 180px, no clip |

`ΔΗΜΗΤΡΗΣ` full, un-clipped, on all four surfaces now (11/11 checks pass
across the two harnesses). Baseline (pre-fix) was clipped/spilling on both
the duel and the climb, confirmed live before the fix landed.

## C — Εκτίμηση (numeric) reveal label collision

`client/src/screens/host/NumericRevealView.tsx` — `Numline`'s depth-stacking
placement put an exact guesser's label and the truth's own label on opposite
sides (`above`/`below`) of the SAME anchor line with **zero px of intentional
gap** between them (both anchored at `calc(100% + depth*step)`, which
resolves to literally the same point when depth=0). At an exact hit both
labels share the same X, so this reads as one label sitting directly on the
other. Added a fixed `NUMLINE_LABEL_GAP_CQH = 1.2` constant to both sides of
the offset formula.

**Criterion 3 — measured, `dev/242-numeric-check.ts` (forced via direct
`prepareNumericGame`/`submitNumericAnswer` calls, since the question and
values are otherwise random):**
- Exact hit (before fix): `"Μαρία 116"` box bottom = 239.21875, truth `"116"`
  box top = 239.21875 → **gap = 0px, touching**.
- Exact hit (after fix): same shape, → **gap = 17.25px**, both legible, zero
  overlap.
- Inverse (nobody exact, unchanged case): the two guesser labels don't share
  an X range with the truth label at all (side-by-side, not stacked) — no
  gap to measure, zero overlap. Confirmed unchanged.

4/4 checks pass.

## D — phase-transition "zoom" (DIAGNOSIS ONLY, no fix)

`git diff --stat` confirms only the three files above (A/B/C) changed —
nothing for D.

**Mechanism**: `palette-theatro.css`'s `.enter-pop` class/keyframes
(`transform: scale(0.94) → scale(1)`, 420ms cubic-bezier,
`animation-fill-mode: backwards`), applied via `className="enter-pop"` on
each phase view's `MarbleSlab` (e.g. `QuestionView.tsx:61`,
`RevealView.tsx:93`, `NumericRevealView.tsx:186`) and its category chip. A
fresh instance mounts on every phase transition (each phase is a different
React component), so the animation replays every time.

**Measured, `dev/242-subtitle-check.ts`**, a real QUESTION→REVEAL transition,
sampled via a `MutationObserver` + `requestAnimationFrame` loop installed
*before* triggering the transition (a fixed-interval poll from outside
reliably missed the 420ms window — confirmed by a first pass that only ever
saw `transform:none`, i.e. post-animation):
- t=19.4ms: `transform=matrix(0.94,0,0,0.94,0,0)`, rect
  866.3×118.3px
- …progressing smoothly through intermediate scale values…
- t≈504ms: `transform=matrix(1,0,0,1,0,0)`, rect 921.6×125.8px (settled)
- t≥554ms: `transform=none` (animation finished, fill-mode released)

The box visibly grows ~6.4% in width and height over ~500ms — a real,
measured "zoom."

**Verdict: INTENTIONAL**, not an accident — `palette-theatro.css`'s own
"entrances" section header, a deliberate pop-in transition applied
consistently across every phase view. Not fixed here per the task's own
instruction; the decision to keep, soften, or remove it is separate.

## Findings outside scope (documented, not fixed)

- Same-question re-verifying `PodiumView` at the frozen GAME_OVER ceremony
  for `AnavasisClimbers` specifically (as opposed to the live climb, which
  *was* re-tested and fixed) — not separately isolated; the task's premise
  ("finale steps render it in full") may or may not hold there, only the
  live view was proven broken.
- `SocratesView.tsx`'s own comment (lines ~25-38) describing a "chrome-level
  Socrates caption via SpeechSlab" from Task 196 is stale — Task 239 actually
  added `SocratesSubtitle` as a new, separate component rendered inside
  `SocratesView` itself, not through that older mechanism. Not touched here
  (comment-only, out of this task's scope).
