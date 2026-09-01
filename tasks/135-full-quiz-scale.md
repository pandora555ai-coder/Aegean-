# Task 135 — Full mode: quiz points on the 400 scale

Model: Sonnet.

FINDING (task 134 follow-up): in the full mode, one correct quiz
answer pays ~1485 while an ENTIRE draw or numeric stage pays
~900-1600. Six quiz answers gave one bot 7425; draw+numeric combined
gave it 1333. Stages 2-3 barely move the ranking and trial life is
effectively quiz-only (entries of ~9500 vs ~1300).

DECIDED: in full mode ONLY, quiz question points are multiplied by a
scale so that a max-speed correct answer lands at ~400 — the same
scale draw and numeric already use. Standalone quiz is UNTOUCHED.

## Implementation rules

- The scale travels the same road as NUMERIC_QUESTION_COUNT did in
  134: a parameter with default 1 (stage config or call-site), NOT a
  mode check inside the scoring function.
- One constant, FULL_QUIZ_SCORE_SCALE, in shared/. Derive its value
  from the actual quiz formula so that max-speed correct ≈ 400;
  report the derivation. Round per-question points after scaling.
- STEAL amounts (200-400, clamped to victim) are ALREADY on the 400
  scale — do not scale them, and make sure they are not scaled
  indirectly through a shared code path. Trial constants
  (DRAIN_PER_SEC, WRONG_HIT) untouched.

## Acceptance criteria

Report on EACH one separately, with observed numbers. Under 8 lines.

1. **Full run, scaled.** Medium full run, BOT_COUNT=4: report the
   points paid for one fast correct and one slow correct quiz answer
   — fast ≈ 400, slow below it, both from the reveal payload.

2. **Standalone before/after.** Run a standalone quiz with the SAME
   harness and a pinned question BEFORE the change (stash) and
   AFTER: report both numbers for one correct answer — identical.

3. **Trial entry in the new scale.** From the full run in (1):
   report every bot's life at trial entry. Top entry should sit in
   the low thousands, not ~9500.

4. **Steal not double-scaled.** From the same run: report one
   observed steal amount in stage 4 — inside 200-400 (before the
   victim clamp), not ~54-108.

## Out of scope

The exact final balance (playtest decides), trial drain numbers,
draw/numeric scoring, computeCompetitionRanks.
