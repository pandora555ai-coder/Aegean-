# Task 136 — Full mode: draw GUESS points on the 400 scale

Model: Sonnet.

FINDING (task 135, failed criterion 3): trial entry hit 10097. The
agent's own numbers expose the cause: quiz+steal was 3986, so stages
2-3 paid ~6111 — and the structural ceiling of stages 2-3 is 3
guesses x ~1500 + drawer 400 + numeric 1200 = 6100. Correct GUESSES
in the draw stage pay on the ~1500 scale while the DRAWER caps at
400. Task 135 scaled quiz; this closes the guess path.

DECIDED: in full mode ONLY, draw guess points are scaled so a fast
correct guess lands at ~400. Same road as FULL_QUIZ_SCORE_SCALE:
a parameter defaulting to 1, NOT a mode check inside the scoring.
Standalone draw is playtested and UNTOUCHED.

## Acceptance criteria

Report on EACH one separately, with observed numbers. Under 8 lines.

1. **Full run, guesses scaled.** Medium full run, BOT_COUNT=4: from
   GUESS_REVEAL payloads report one fast correct guess (≈400) and
   one slow correct guess (below it).

2. **Drawer reward NOT double-scaled.** Same run: report one
   drawer's reward and the correct/eligible behind it — it must
   equal round(400 * correct / eligible) exactly, untouched by the
   new scale.

3. **Standalone draw before/after.** Same harness, bots with FIXED
   answer delays, one guess payout BEFORE the change (stash) and
   AFTER — identical numbers.

4. **Trial entry, per segment.** From the run in (1): the top bot's
   points per segment (quiz s1, draw, numeric, quiz s4, steals).
   No segment above ~1700, and top trial-entry life in the low
   thousands — this re-runs 135's failed criterion 3.

## Out of scope

Numeric scoring (already 400-scale), steal, trial constants,
standalone modes' behavior.
