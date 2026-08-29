# 112 — Move the timer into the score column, slow the counters

Observed on a real TV. The timer sat top-centre and the set cropped it
(there was a `--tv-safe-bottom` but no top equivalent). Space above the
papyrus was wasted; the right column had room.

## What was done

1. The countdown ring moved out of the six phase views that each drew
   their own (QUESTION, POWER_UP, STEAL, DRAW, GUESS, NUMERIC_QUESTION)
   into one `host/TimerRing.tsx`, rendered by `PlayerScoresPanel` above
   the score rows. Each phase keeps its own "nearly out" threshold — the
   only thing that differed between the six copies — and HostScreen's
   `timerForPhase()` is now the single place that maps phase -> ring.
   The three REVEAL phases keep their progress bar; they never had a ring.
2. `--tv-safe-top` added beside `--tv-safe-bottom`, both now in
   `palette-elaiografia.css` (they were in theme.css, which is being
   retired). Applied to the same roots (`gameLayout`, `container`) and
   full-bleed overlays (`pauseOverlay`, `stageOverlay`), plus the two
   viewport-fixed badges at the top edge (`cornerRoomCode`,
   `fullscreenToggle`) — a room code cropped off the top is a room nobody
   can join. `#root` gets `display: flow-root` in the palette file: the
   roots take the top inset as a MARGIN, and a collapsing top margin
   pushed #root itself down and made the page 36px scrollable at 720p.
3. `DEFAULT_DURATION_MS` 900 -> 1800. `REORDER_DELAY_MS` is defined AS
   that constant, so it doubled with it.

## The counter race, checked against Task 107

Task 107 (commit 6adeea8) moved the panel OUT of GameLayout so a phase
change stops unmounting it. That fix still holds: instrumented mount/
unmount logging over a whole game shows the panel mounting 2-3 times, not
once per phase. `git log -S standingsForPhase` returns exactly one commit -
6adeea8 - so the null-standings gap below is not a later regression: 107
introduced it in the same commit as its fix, and nothing has touched it
since. With the gap left open (a runtime flag disabling the fallback) the
panel logged 37 mounts / 36 unmounts in one game and every REVEAL settled
in 0ms; with it filled, 2-3 mounts and 2183-2228ms.

Server ordering: PHASE_CHANGED is emitted before the phase's own payload
at all 18 emit sites (phases.ts 9, modes/draw.ts 4, modes/numeric.ts 3,
index.ts 2). Swapping them is mechanically small - the payload is built
after room.phase is already assigned, so only the emit line moves - but it
changes wire order for every mode and phase, including the reconnect path,
and a state:sync arriving alone would still need the client to cope. The
client-side fallback covers every ordering, so that is where the fix went.

Which reveal phases gap (measured, one game each): only REVEAL. Quiz
logged GAP REVEAL on every reveal (16 renders / 8 reveals) plus QUESTION,
POWER_UP and SOCRATES; draw logged GAP DRAW and GAP GUESS but never
GUESS_REVEAL; numeric logged GAP NUMERIC_QUESTION but never
NUMERIC_REVEAL. Settle times agree: GUESS_REVEAL 2150-2183ms and
NUMERIC_REVEAL 1616-2195ms with no 0ms window, except the very first
GUESS_REVEAL of a game (0ms), where the column has only just mounted.

## The bug this uncovered

The counter tween was dead. `endQuestion` emits PHASE_CHANGED before
REVEAL_SHOW, and `handleQuestionShow` had already cleared the previous
reveal — so `standingsForPhase()` returned null for exactly one render on
every question -> reveal, unmounting the score column and remounting it
with the new scores already in place. Measured: 0ms, one frame, every
reveal. HostScreen now falls back to the last known standings while an
in-game phase's payload is in flight, so the column keeps its identity.

## Measured (1280x720, BOT_COUNT=4)

- reveal:show -> rows at final position: 1281ms before (900 + glide),
  1684-2228ms after over ten reveals — 2183-2228ms whenever the rows
  actually reorder, ~1690ms when only the counters move.
- REVEAL 6000ms, GUESS_REVEAL 8000ms, NUMERIC_REVEAL 8000ms — all fit.
- QUESTION, GUESS, GAME_OVER: shell 36px..684px, innermost content
  58px..662px (GAME_OVER's last row ends at 651px).
- Every phase carrying a ring now draws it in the column: QUESTION,
  POWER_UP, STEAL, DRAW, GUESS, NUMERIC_QUESTION all measured with the
  ring at top 226-232px, inside the column's box.
