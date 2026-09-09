# Task 214 — Compose the locked full-game lineup

Composition only. No stage's internal mechanics were touched:
`shared/src/agora.ts`, `server/src/blitz.ts` (and its scoring),
`server/src/climb.ts` and `server/src/trial.ts` are byte-identical to
before this task.

## The lineup

| # | Stage | Segment | Where it runs |
|---|-------|---------|---------------|
| 1 | Η Αγορά | `quiz` | `phases.ts` (POWER_UP per the row, gated by `powerUpsEnabled`) |
| 2 | Η Παλαίστρα | `blitz` | `modes/blitz.ts` — `prepareBlitzGame` / `startBlitzSegment` |
| 3 | Ζωγραφική | `draw` | `modes/draw.ts` — `startDrawSegment` (advance-when-all-submitted, unchanged) |
| 4 | Εκτίμηση | `numeric` | `modes/numeric.ts` — `prepareNumericGame` / `startNumericSegment` |
| 5 | Η Μνήμη της Αγοράς | `agora` | `modes/agora.ts` — `prepareAgoraRound` / `startAgoraSegment` |
| 6 | Η Συκοφαντία | `quiz` | `phases.ts` (STEAL after every question) |
| 7 | Η Ανάβασις | `trial` row | `phases.ts` `startClimb` — or `startTrial` when `finaleMode` is `'trial'` |

## What changed

- `shared/src/index.ts`
  - `StageSegment` gained `'blitz'` and `'agora'`.
  - `FULL_STAGES` is the six-row table above (the finale is still appended by
    `fullStagesForLength` as `trialStageRow(FULL_STAGES.length + 1)` = stage 7,
    so `totalStages` is the table's length in every mode, unchanged).
  - `DEFAULT_ROOM_SETTINGS.finaleMode`: `'trial'` → `'climb'`.
- `server/src/modes/full.ts`
  - `FULL_PHASES` gained `BLITZ`, `BLITZ_REVEAL`, `AGORA_EXPOSE`,
    `AGORA_QUESTION`, `AGORA_REVEAL`.
  - `FULL_CONTINUATIONS` merges `BLITZ_CONTINUATIONS` and
    `AGORA_CONTINUATIONS` alongside the three it already had. The merge's
    startup collision guard passes: the blitz kinds are `BLITZ`/`BLITZ_REVEAL`
    and the agora's are `AGORA_*` (including its mode-local `AGORA_SOCRATES`),
    none of which any other composed table claims.
  - `prepareGame` also calls `prepareBlitzGame(room, BLITZ_STATEMENT_COUNT)`
    and `prepareAgoraRound(room)` — each of which deletes its own prior state
    first, so "play again" carries nothing over.
  - `beginStage` gained a `'blitz'` and an `'agora'` case, two lines each.
- Docs: `CLAUDE.md` (Phases → Full, and the finale-default line),
  `server/src/modes/README.md`.
- New harness: `dev/full-lineup-check.ts` (socket-level, no Playwright).

No change was needed in `phases.ts`, `payloads.ts`, `crowd.ts`, `state.ts`,
`timers.ts` or any client file: the finale row, the STAGE_ANNOUNCE beat, the
`advanceAfterSegment` hook and the mode-generic
`continuationForActiveTimer` dispatch were all already in place, and
`crowdIntensityFor` already had an explicit case for all 24 phases.

## Deliberately NOT done (out of scope per the task)

- Per-stage lengths were not retuned. `FULL_DRAW_ROUNDS_BY_LENGTH` is still
  short 1 / medium 1 / long 3, `FULL_NUMERIC_QUESTION_COUNT` still 3,
  `FULL_QUIZ_QUESTION_COUNTS` still 2/3/5. The lineup's "Ζωγραφική ×2 rounds"
  is therefore NOT what the composed stage runs today — changing it is a
  one-line edit to that record when someone decides to retune.
- The agora segment scores through `calculatePoints` at scale 1 (the
  standalone quiz's up-to-1500 band), not full's ~400 `FULL_QUIZ_SCORE_SCALE`
  band. Adding a `scale` parameter to `startAgoraSegment` would be modifying
  a stage's internals, which this task forbids. It is a real balance
  imbalance and should be its own task. Blitz's flat
  `BLITZ_CORRECT_POINTS`/`BLITZ_WRONG_POINTS` are likewise untouched.

## Verification

`npx tsx dev/full-lineup-check.ts` — see `tasks/214-report.md` for the run's
numbers.
