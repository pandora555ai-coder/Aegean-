# Task 138 — SOCRATES phase in draw and numeric (detection only)

Model: Sonnet. This fills an established pattern — the quiz SOCRATES
machinery (moments, LINE_TAGS side-table, rarity tiers, cap 2 per
moment per game from task 62) extends to the two modes that lack it.
NO LINES ARE WRITTEN in this task — task 139 writes them. A moment
with ZERO lines in the table must never fire as a phase; detection
still logs. This matters mechanically: phase length follows
source.onended, so firing without an mp3 means 11s of silence
(SOCRATES_MAX_DURATION_MS backstop).

## Moments and hooks

Draw (SOCRATES hooks after GUESS_REVEAL; DRAW_INTRO before DRAW):
  DRAW_INTRO, NOBODY_GUESSED (0 correct in a guess round),
  EVERYBODY_GUESSED (all eligible correct), SPLIT_GUESS (correct <=
  half and wrong guesses spread over 2+ distractors), DRAW_WINNER
  (after the stage's last GUESS_REVEAL, best drawer reward).
Numeric (hooks after NUMERIC_REVEAL):
  EXACT_HIT (someone exact), WILDLY_OFF (a submission >= 3x or <=
  1/3 of the answer), ALL_CLUSTERED (all submissions within 10% of
  each other), NOBODY_CLOSE (best submission off by >= 50%).
Thresholds are STARTING VALUES — report observed firing frequency sothe 61/62 rebalance method can tune them later.

Both modes gain the phase in their own phases + continuations (the
modes/README checklist); the FULL mode must inherit it through the
composed segments with no separate wiring — if separate wiring turns
out to be required, STOP and report why instead of forking.

## Acceptance criteria

Report on EACH one separately, with observed numbers. Under 8 lines.

1. **Detection observed, phase skipped.** Standalone draw and
   numeric runs with engineered outcomes (a 0-correct guess round,
   an all-correct one, an exact numeric hit, a 3x-off submission):
   report each detected moment WITH the numbers that triggered it,
   and that the phase sequence contains ZERO SOCRATES entries (no
   lines exist).

2. **Before/after identical.** The SAME harness command before the
   change (stash) and after: identical phase sequences and total
   run duration within noise — detection must cost no round time.

3. **Full inherits.** One medium full run: report moments detected
   inside the draw and numeric segments, zero SOCRATES phases fired,
   and the quiz segments' SOCRATES behavior unchanged (report one
   fired quiz moment as proof).

4. **The gate is the line table.** Add ONE throwaway test line to
   one draw moment, run, report that ONLY that moment now fires as
   a real SOCRATES phase (with the 11s backstop since no mp3), then
   REMOVE the test line and confirm zero firings again. Report the
   count of lines added to LINE_TAGS at task end: zero.

## Out of scope

Writing lines (139), TTS, moment rarity retuning, crowd audio, the
trial's own moments.
