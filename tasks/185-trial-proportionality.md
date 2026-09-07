# 185 — Trial proportionality (fix)

Note: the task brief pointed at MASTER-PLAN.md step 7 for context; that file
is intentionally not in the repo, so this ran from the task text alone.

## What changed

- shared/src/index.ts: `DRAIN_PER_SEC` (10) and `WRONG_HIT` (150) — flat,
  documented as placeholders since Task 127 — replaced with
  `TRIAL_WRONG_ANSWER_HIT_PCT` (0.11), `TRIAL_NO_ANSWER_HIT_PCT` (0.23),
  `TRIAL_DRAIN_PCT_PER_SEC` (0.01), and two functions, `trialWrongHit
  (referenceLife, answered)` and `trialDrainPerSec(referenceLife)`.
- server/src/state.ts: `TrialState.referenceLife` — the highest entry score
  among trial contestants, fixed once at `startTrial` (server/src/
  phases.ts), so a later round's drain can never move its own yardstick.
- server/src/trial.ts: `trialDrain` and `scoreTrialRound` now take
  `referenceLife` and call the two shared functions instead of the old flat
  constants.
- server/src/payloads.ts: the two trial-question payload builders compute
  `drainPerSec`/`wrongHit` from `trial.referenceLife` instead of importing
  the removed constants.

Pre-existing code had ONE flat `WRONG_HIT`, not two literal tiers — the
"165 / 350" figures in the brief are what that flat 150 plus the
elapsed-time drain add up to at reference 1504, for a fast wrong lock-in
vs. a full-timer non-answer. I read "keep trigger conditions as they are"
as: keep that same distinction (locked in wrong vs. never locked in at
all — the only two conditions the code already told apart, via drain) and
formalize it into two explicit hit tiers.

## Acceptance criteria

1. **Verdicts at every scale** (400 runs/batch, seed 185, entries
   400-1500 / 1500-3000 / 5000-9000): **100.0% / 100.0% / 100.0%**. All
   ≥90%. PASS.
2. **Leader mortality**: leader died in 128/400, 148/400, 161/400 runs
   respectively; median consecutive misses at death was **1, 1, 1**.
   Exists in every batch, but the high-scale median (1) does **not** land
   in the required 3-5 band. FAIL.
   Why: `trialWrongHit`/`trialDrainPerSec` scale off a FIXED reference, so
   the fraction of life one miss costs is identical at every scale by
   construction — the leader dies from a handful of misses total, but they
   rarely land in an unbroken run, at any scale, because pCorrect (0.6)
   keeps resetting the streak. Pure proportionality removes the exact
   scale-dependence the 3-5-at-high-scale bar assumes.
3. **Comebacks**: 164/400 (41.0%), 191/400 (47.8%), 201/400 (50.3%) — all
   > 0. PASS.
4. **Formula in shared + live path**: `trialWrongHit`/`trialDrainPerSec`
   in shared/src/index.ts; `grep -na '165\|350\|DRAIN_PER_SEC\|WRONG_HIT'
   server/src/trial.ts server/src/phases.ts server/src/payloads.ts
   server/src/state.ts` → 0 hits in trial logic (one unrelated "Task 165"
   comment only). `trial_reveal:show` still present in the built client
   bundle. PASS.

Sanity anchor at reference 1504: `trialWrongHit` gives 165 (answered) and
346 (no answer); `trialDrainPerSec` gives 15.04/s vs. the old flat 10/s —
both within the stated ±10.

## Stop condition hit

Criterion 2 fails at the high scale as specified. Per the task's own
instruction, stopping here rather than tuning the 11/23/1 percentages —
that's a design call (proportionality vs. scale-dependent mortality are in
tension) for a person to make, not something to fix by adjusting numbers
until a report looks clean.
