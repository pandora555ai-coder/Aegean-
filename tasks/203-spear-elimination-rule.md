# 203 — Spear elimination rule: mechanics + Monte Carlo (no UI, no wiring)

Pure mechanic only, per spec: no phase-machine wiring, no server socket
changes, no UI. `applyClimbRound`/`nextAfterClimbRound`/`resolveClimbAtCap`
(already live in phases.ts for the climb finale) are untouched.

## What was built

- server/src/climb.ts: `CLIMB_SPEAR_MIN_PLAYERS` (4), `CLIMB_SPEAR_LIMIT`
  (2), `climbSpearRuleActive(playerCount)` (the N-gate, baked into
  `applyClimbSpearRound` itself so a caller can't forget it),
  `applyClimbSpearRound` (counter increment/reset over one already-scored
  climb round), `nextAfterSpearRound` (NONE / OUT / DUEL — 2+ struck in the
  same round duel by fastest-REACTING, i.e. lock-in time with a non-answer
  sorting last, not `answerRank`), `nextAfterSpearEliminations` (the
  last-survivor win). Reuses `applyClimbDuelResult` for the spear duel's own
  resolution — same "was the winner one of the two" check either duel needs.
- server/scripts/climb-spear-check.ts (new, `npm run climb:spear-check`):
  17 unit checks against the pure functions directly — counter
  increment/reset (correct, wrong, no-answer, leaving step 0), the N-gate,
  the duel-only-on-a-double trigger (1 struck vs. 2 vs. 3+), the duel
  resolver's validation, and the last-survivor win.
- server/scripts/trial-montecarlo.ts: `--spear auto|on|off` (climb only;
  default `auto` follows `climbSpearRuleActive`). Also resolves the
  top-of-ladder duel to an actual winner now (random weapon per side,
  re-drawn on a tie) — the pre-203 harness stopped at "reached a duel"; the
  new comeback/step-zero/behind-by-3 stats need a real winner for every run.
  Reports, per run: `verdictType` (`top` / `top-duel` / `last-survivor` /
  `bottom-duel-survivor`), `eliminationsCount`, `capHit`,
  `winnerEverAtStepZero`, `winnerEverBehindBy3` (the then-current leader's
  step minus the winner's, at any point >= 3).

## Acceptance criteria

1. **Unit tests**: `npm run climb:spear-check` — **17/17 passed.**
2. **All-random (p=0.25), N>=4, 500 runs/batch, seed 203**: median rounds
   and 24-round cap rate, spear OFF -> ON:
   - N=4: 24 -> 12 rounds, cap 88.0% -> 6.2%
   - N=5: 24 -> 14 rounds, cap 86.2% -> 8.0%
   - N=6: 24 -> 15 rounds, cap 87.6% -> 8.6%
   - N=8: 24 -> 17 rounds, cap 90.8% -> 18.2%

   Every N shows a materially lower median and a large cap-rate drop.
   **PASS.**
3. **Comeback preservation** (mixed 0.25/0.6 leader-other split, skilled
   0.4/0.7), % of wins where the winner was ever >= 3 steps behind the
   then-current leader, OFF -> ON:
   - N=4 mixed: 22.0% -> 16.6% (-24.6%); skilled: 21.8% -> 20.8% (-4.6%)
   - N=5 mixed: 27.0% -> 19.0% (-29.6%); skilled: 29.2% -> 27.8% (-4.8%)
   - N=6 mixed: 31.0% -> 22.8% (-26.5%); skilled: 27.4% -> 29.0% (+5.8%)
   - N=8 mixed: 40.6% -> 32.8% (-19.2%); skilled: 34.2% -> 32.4% (-5.3%)

   Largest reduction is 29.6% (N=5 mixed), under the one-third flag
   threshold everywhere. **No flag — comeback preservation holds**, report
   only per the task.
4. **Invariant (inverse)**: across all 27 batches run for this task
   (13,500 total simulated climbs: the N=4/5/6/8 x 3-profile x on/off
   matrix, 500 runs each, plus the N=3 x 3-profile spear-off control),
   `eliminationInvariantViolations` (an eliminated player later moved,
   answered, or won) and `negativeStepViolations` (any emitted step < 0)
   were **0 in every batch** — no exceptions.

## Matrix run (N=3 control + N=4/5/6/8, 500 runs each, seed 203)

`node`/`npx tsx server/scripts/trial-montecarlo.ts --finale climb --spear
on|off --p-correct[-leader/-others] ... --json`, N=3 spear off only per
spec. Full table (rounds median, cap%, verdict-type counts, eliminations,
comeback%, everAtStepZero%, everBehindBy3%, both invariant-violation
counts) captured during the session; the numbers quoted in criteria 2-4
above are pulled directly from it.

## Report

All four acceptance criteria pass (criterion 3 explicitly flags nothing,
as designed — reported, not tuned). No live-path files changed:
`git diff --stat` touches only `server/src/climb.ts` (new spear section,
additive), `server/scripts/trial-montecarlo.ts` (harness only),
`server/scripts/climb-spear-check.ts` (new), and `package.json` (new npm
script). `phases.ts`, `payloads.ts`, and every client file are untouched.
