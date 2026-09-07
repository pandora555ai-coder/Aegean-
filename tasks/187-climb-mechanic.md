# 187 — Climb finale mechanic (pure module) + Monte Carlo validation

Pure mechanic only, per spec: no phase-machine wiring, no UI, no change to
the live trial path.

## What was built

- shared/src/index.ts: `CLIMB_TOP` (12), `CLIMB_ENTRY_GAP` (3),
  `CLIMB_ENTRY_BASE` (1), `climbEntryStep(rank, playerCount)`, and the
  `ClimbRevealResult` type.
- server/src/climb.ts (new): `applyClimbRound` (scores one round via
  `sortAndRankResults`, the same ranking function trial/quiz reveals use),
  `nextAfterClimbRound` (WINNER / DUEL / CONTINUE, holds 3+-way arrivals at
  `CLIMB_TOP - 1`), `applyClimbDuelResult` (validates and returns the
  winner; the duel itself is out of scope). No Room, no io, no timers.
- server/scripts/trial-montecarlo.ts: `--finale trial|climb` flag (default
  `trial`, unchanged path). Climb has no phase machine to drive, so
  `--finale climb` calls `climb.ts`'s pure functions directly instead of
  reusing the injected `VirtualClock` — there are no timers in this
  mechanic to inject one into; it DOES reuse the trial sim's player-
  behavior shape (RNG lock-ins, gaussian timing, leader/other skill split).

## Acceptance criteria

1. **Harness extension**: flag is `--finale trial|climb`. `--finale trial`
   (seed 185, entry 400-1500, leader/other 0.7/0.5) reproduces 185c's exact
   numbers: 71/400 comebacks, 54 leader deaths, median 3 wrong hits
   absorbed, 49.5% drain share, 42 sudden-death fires across 37 runs — all
   identical. PASS.
2. **Rounds-to-verdict** (400 runs/batch, seed 187, 4 players, leader 0.7 /
   others 0.5): median **10, 10, 10** across the three entry scales
   (400-1500 / 1500-3000 / 5000-9000) — confirmed identical across scales
   (entry is genuinely ordinal, as designed; verified against a
   deterministic edge case: leader always-correct-and-fastest resolves in
   exactly 4 rounds, matching 4 + 2×4 = 12 by hand). Required band was
   4-9. **FAIL** — every batch lands one round over.
3. **Player-count sweep**: N=2 median **9** (in-band, at the boundary),
   N=8 median **12** (out of band, worse than N=4). Comebacks: N=4 batches
   all 26.3% (105/400, in the required 10-35% band — PASS), N=2 10.5%
   (42/400, calibration only), N=8 35.0% (140/400, calibration only,
   sitting right at that same band's edge). 2-way duels: 9/400, 9/400,
   9/400 (N=4), 3/400 (N=2), 10/400 (N=8) — all 2-way. **3+-way arrivals:
   0 across all 2000 runs.** Rounds-to-verdict misses its band in 4 of 5
   batches, so this criterion **FAILS** too.
4. **No live-path drift**: `git diff --stat -- server/src` shows only
   `climb.ts` as new, 0 modified files. The harness script that changed
   lives at `server/scripts/trial-montecarlo.ts`, outside `server/src`
   (the spec's wording assumed it was inside); `shared/src/index.ts` also
   changed (climb constants/types), the same pattern Task 185 used for
   `trialWrongHit`/`trialDrainPerSec`. `trial_reveal:show` appears once,
   unchanged, in a fresh `npm run build -w @game/client`.

## Stop condition hit

Criterion 2 fails in every batch (median 10 vs. required 4-9) and
criterion 3's N=8 batch fails the same way (median 12). The mechanic
itself is verified correct (hand-checked against a deterministic
all-leader edge case), so this is a real pacing finding, not a bug: at
`CLIMB_TOP = 12` with the specified deltas and the 0.7/0.5 skill split,
the race runs about one round long. Per the task's own instruction,
stopping here rather than adjusting `CLIMB_TOP` or the `+2` rule — those
are design calls.
