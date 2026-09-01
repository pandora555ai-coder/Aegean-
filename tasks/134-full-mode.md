# Task 134 — modes/full.ts: the merged game (server machine)

Model: Opus. This is the mode merge — the one task that earns it.

## Design, LOCKED

A FOURTH registry mode, id "full". The three existing modes stay
untouched and VIP-selectable — they are the dev harness. The full
mode COMPOSES their builders; numeric.ts and the draw builders were
kept mode-agnostic for exactly this. Do not fork or copy mechanics —
call them.

Show structure (STAGE_ANNOUNCE before each):
  1  Η Αγορά        quiz questions (+POWER_UP per quiz stage config)
  2  Ζωγραφική      ONE draw round (everyone draws, N guess cycles)
  3  Εκτίμηση       3 numeric questions
  4  Η Συκοφαντία   quiz questions WITH steal
  5  Η Δίκη         the trial finale (127), entered with accumulated
                    scores as life, announced as stage 5
  -> GAME_OVER — the ONLY GAME_OVER in the mode

VIP length maps to quiz counts only (draw and numeric fixed):
  short 2+2, medium 3+3, long 5+5.

Rules that bind the implementation:
- Sub-segment end must route to the NEXT stage's STAGE_ANNOUNCE, not
  to that mode's GAME_OVER. One function decides what follows each
  reveal — extend it, don't fork it.
- NUMERIC_QUESTION_COUNT stays 5 for the standalone mode. The count
  becomes a PARAMETER at the call site; full passes 3. Same for
  drawRounds: full passes 1.
- Scores CARRY across stages — no reset at stage boundaries.
- prepareGame of full must delete the DrawState WeakMap entry (the
  Room survives play again) AND the draw stage needs a stage-level
  prepare at ITS start, since it begins mid-game.
- Continuations = merged maps of quiz + draw + numeric + trial.
  Abort loudly at startup on a key collision.
- minPlayers 2 (drawing requires it).
- Payload rule holds everywhere: no answer/score leaks to players.
- STAGE_ANNOUNCE payloads must carry stage 1..5 of 5 (the 128
  denominator fix must not regress) — TV cosmetics are a LATER task,
  but the numbers come from the server.

## Acceptance criteria

Report on EACH one separately, with observed numbers. Under 8 lines.

1. **Full medium run, observed.** BOT_COUNT=4: report the sequence —
   5 STAGE_ANNOUNCEs, 3+3 quiz REVEALs, 1 draw round with 4 GUESS
   cycles, 3 NUMERIC_REVEALs, trial to GAME_OVER, exactly one
   GAME_OVER. Then a short run: report 2+2 quiz counts. Long: report
   the configured counts only.

2. **Scores carry.** Report one bot's total at the end of each of
   the 5 segments — never resets, and trial life at entry equals the
   score after stage 4.

3. **Play again survives the WeakMap.** After GAME_OVER, play again
   into a second full game: report that the second draw stage
   accepts all 4 submissions. Then the inverse: run each of the
   three STANDALONE modes to its own GAME_OVER, one line each —
   unchanged behavior, numeric still asks 5.

4. **Null-payload first render + reconnect.** The house pattern:
   PHASE_CHANGED precedes payloads at ~18 sites. Kill and rejoin the
   HOST socket once during the draw stage and once during a numeric
   question: report that buildStateSyncForHost restores the correct
   phase and stage number both times, no crash.

## Out of scope

TV stage-card cosmetics, Socrates in draw/numeric segments (no lines
exist yet), trial balance numbers, crowd audio, computeCompetitionRanks.
