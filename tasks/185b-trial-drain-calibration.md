# 185b — addendum: drain calibration + restated criterion 2

## What changed vs. 42c21ea

- shared/src/index.ts: `TRIAL_DRAIN_PCT_PER_SEC` 0.01 → 0.0065. Penalties
  (11% / 23%) untouched.
- server/scripts/trial-montecarlo.ts: added instrumentation only (three new
  `RunResult` fields, populated from `TrialRevealResult` fields the reveal
  already computes) to produce the two numbers criterion 2 asks for, which
  the harness had no way to report before. No simulation/scoring logic
  touched — `git diff --stat 42c21ea` shows exactly these two files.

## Correction

The brief's "locked-in-wrong (23%-tier)" mislabels the tiers as built (and
as derived from task 185's own anchor math): locked-in-wrong is the
**11%**-tier (`TRIAL_WRONG_ANSWER_HIT_PCT`); never-locking-in is the
**23%**-tier (`TRIAL_NO_ANSWER_HIT_PCT`). Criterion 2 is reported against
the literal description - locked-in-wrong hits - not the parenthetical
percentage.

## Results (400 runs/batch, seed 185)

1. **Verdicts**: 100.0% / 100.0% / 100.0%. PASS.
2. **Leader resilience** (dead-leader runs only): median locked-in-wrong
   hits absorbed = **4 / 4 / 4** (≥3 required). Mean drain share of the
   dead leader's total life loss = **47.0% / 46.8% / 47.0%** (<50%
   required). PASS.
3. **Comebacks**: **37.3% / 45.5% / 48.5%** — required 10-35% in every
   batch. FAIL, all three, all above the ceiling.
4. **Diff vs. 42c21ea**: `shared/src/index.ts` (1 line, the constant) +
   `server/scripts/trial-montecarlo.ts` (29 lines, instrumentation for
   criterion 2's new metrics, described above) - not shared-only, but the
   only other diff is the harness gaining a reporting capability it lacked,
   not a behavior change.

## Stop condition hit

Criterion 3 fails in every batch, comebacks running 2-14 points over the
35% ceiling. Reducing drain to fix criterion 2 (leader resilience) left
rounds-to-verdict slightly longer (8-9 vs. 7-8) and gave the field more
opportunities to overturn the entry leader than the ceiling allows.
Reporting the numbers and stopping - the next knob is explicitly not mine
to turn.
