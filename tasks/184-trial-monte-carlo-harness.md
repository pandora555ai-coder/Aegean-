# 184 — Trial Monte Carlo harness (measurement tool, NO formula changes)

Read MASTER-PLAN.md step 7 first. This task builds the measurement
instrument only. Do NOT change any trial constant, penalty, or drain
value — the current behavior is the baseline we must reproduce.

## What to build

A script (e.g. `server/scripts/trial-montecarlo.ts`, run via tsx)
that simulates ONLY the trial stage (Η Δίκη) N times, in-process:

- It must import and drive the SAME production modules the live game
  uses for the trial (state transitions, drain, elimination at
  reveal, sudden death via nextSuddenDeath). Copying or reimplementing
  the trial logic inside the script is FORBIDDEN — if the logic is
  not importable without sockets, extract it into a module both the
  server and the script import, with zero behavior change.
- Compressed clock: the trial's pause-aware clock must accept an
  injected/scaled time source so 1000 runs finish in minutes. The
  live path must default to real time (prove: the time-source default
  is unchanged where the server constructs it).
- Simulated players: configurable count (default 4), entry scores
  drawn from a given scale, per-round correct probability, answer
  timing spread. Seeded RNG so a run is reproducible.
- Per-run outputs, aggregated: verdict reached (yes/no), rounds to
  verdict, consecutive misses before the leader dies (if he dies),
  comeback (winner ≠ entry leader), sudden-death triggered count.
- Round cap per run: 16 (matches the known 9k data point).

## Acceptance criteria (report each separately, with numbers)

1. REPRODUCE HIGH-SCALE FAILURE: 200 runs, entry scores ~9000
   (leader), realistic spread: report verdict %. Expected near 0%.
   Report the actual number, not "pass".
2. REPRODUCE LOW-SCALE SUCCESS: 200 runs, bot-scale entries
   (~400–1500): report verdict %, and median rounds-to-verdict.
   Expected: most runs reach verdict, median in the 6–9 band.
   Report both numbers.
3. SUDDEN DEATH EXERCISED: across all runs above, report how many
   times nextSuddenDeath fired and confirm no run ended with every
   duelist flagged eliminated and no winner (the 137 trap). Report
   the count and 0 anomalies, or describe the anomaly.
4. NO LIVE-PATH DRIFT: `git diff --stat` on server/src — list every
   touched file and one line each on why. Any extraction must be
   import-shuffling only; report a runtime literal from the trial
   payload path that still appears in the built output unchanged.

Total wall-clock for the 400 runs: report it. If any expected value
is missed, report the measured value and STOP — do not tune constants
to make it pass; the mismatch is the finding.

Report under 8 lines. Commit this task file together with the work,
push.
