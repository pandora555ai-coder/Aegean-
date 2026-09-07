# 188a — Climb finale: phase-machine wiring (no duel yet)

Server-side only. Wires Task 187's climb mechanic (server/src/climb.ts)
into the finale as the trial's alternative. No client work (189/190).

## What was built

- shared/src/index.ts: GamePhase gains exactly CLIMB_QUESTION and
  CLIMB_REVEAL; crowdIntensityFor gets explicit cases (CLIMB_QUESTION
  .3→.75 over the timer, CLIMB_REVEAL .35); `finaleMode: 'trial' | 'climb'`
  on RoomSettings (default 'trial', validated in updateRoomSettings);
  CLIMB_QUESTION_TIME_MS = 22000, CLIMB_MAX_QUESTIONS = 20, the stage card
  words (CLIMB_STAGE_TITLE 'Η Ανάβαση' + tagline); events
  `player:climb_submit`, `climb_question:show`, `climb_reveal:show`; the
  four payload types + four state:sync shapes.
- server/src/state.ts: ClimbState (questions, climberIds, steps Map,
  lockIns, winnerPlayerId, lastResults) on `room.climb`; reset with trial.
- server/src/phases.ts: `startFinale = finaleMode === 'climb' ? startClimb
  : startTrial` at the ONE site that entered startTrial
  (advanceToNextQuestionOrGameOver). startClimb → STAGE_ANNOUNCE (finale
  row) → startClimbQuestion / submitClimbAnswer / endClimbQuestion /
  endClimbReveal / endClimb (WINNER beat → finishGame). Entry steps via
  climbEntryStep from competition ranks among the connected contestants.
  Elapsed is pause-aware (CLIMB_QUESTION_TIME_MS − remainingActiveTimerMs).
  PHASE_CHANGED before the payload at both new emit sites. Two arrivals in
  one reveal: provisional winner = answerRank 1, marked `// TODO(188b)`.
- server/src/modes/quiz.ts: QUIZ_CONTINUATIONS +CLIMB_QUESTION,
  +CLIMB_REVEAL (full merges this table); both phase lists gain the two.
- server/src/payloads.ts: buildStageAnnounce branches on room.climb;
  buildClimbQuestionHost/PlayerPayload, buildClimbRevealHost/PlayerPayload;
  buildGameOver's climb branch — winner first, then final step desc, ties
  by the last round's answerRank, `isTrialResult: true` (no digits).
- server/src/index.ts: climb_submit handler, state:sync for both phases
  (host + player), VIP_NEXT skip of CLIMB_REVEAL, disconnect recheck.
- server/src/bots.ts: answers climb_question:show exactly as a trial
  question (random pick over player:climb_submit after the profile delay).

Note: the branch site is shared by quiz and full, so a standalone quiz with
finaleMode 'climb' gets the climb too. Kept — a mode check inside the phase
machine is against the house rule, and the setting defaults to 'trial'.

## Acceptance criteria

Driver: a scratchpad script booting its own server on 3901 (never 4001),
host socket + one VIP socket playing like a fast bot + `botCount: 3`, mode
full, gameLength short.

1. **FULL BOT GAME** — finaleMode 'climb', ?bot=3: reached GAME_OVER
   through CLIMB phases. Sequence tail: `STAGE_ANNOUNCE > (CLIMB_QUESTION >
   CLIMB_REVEAL) ×20 > SOCRATES > GAME_OVER`, 0 TRIAL_* phases. **20 rounds
   played** (the pool bound): four random-answer players at 25% accuracy
   net about −0.4 step/round, so nobody topped out and the pool-exhausted
   "highest step wins" ending fired — winner Νίκος, **final step 2**
   (entry steps 1/3/4/2 → final 0/1/2/0). GAME_OVER isTrialResult=true,
   standings by step [Νίκος, Γιώργος, Αργύρης, Ελένη]. The TOP-OUT path
   was exercised in-process against the real phase machine (scripted
   lock-ins, since a bot never sees the correct index): a lone climber
   went 2→4→6→8→10 and won in **4 rounds at step 10**; a two-arrival
   reveal (p1 8+2=10 fastest, p0 9+1=10) resolved provisionally to p1 in
   **6 rounds**, standings p1, p0, p2, p3. **Default-settings game**:
   `... STAGE_ANNOUNCE > SOCRATES > TRIAL_QUESTION > TRIAL_REVEAL >
   TRIAL_QUESTION > TRIAL_REVEAL > SOCRATES > GAME_OVER` — contains
   TRIAL_QUESTION: true, CLIMB_*: false. PASS.
2. **LEAK COUNT** — host CLIMB_REVEAL fields: autoAdvanceMs, correctIndex,
   correctOption, paused, pausedByName, results[].{answerRank, avatarId,
   choice, correct, delta, fastest, name, playerId, stepAfter, stepBefore,
   timeMs}, roundIndex, standings[].{…}, top, winnerName, winnerPlayerId.
   Player CLIMB_REVEAL fields: autoAdvanceMs, correctIndex, correctOption,
   paused, pausedByName, roundIndex, top, winnerName, winnerPlayerId,
   yourChoice, yourCorrect, yourDelta, yourStep, yourStepBefore. 20 player
   payloads scanned for any other player's id, name, step, delta or flag:
   **0 leaks**. PASS.
3. **PAUSE** — paused 1s into the first CLIMB_QUESTION, frozen remainingMs
   read via HOST_REJOIN's state:sync = **20998**; resumed after 3302ms,
   GAME_RESUMED.remainingMs = **20998**; difference **0ms** (<150). PASS.
4. **TYPECHECK GATE** — `npm run typecheck` passes in shared, server and
   client. crowdIntensityFor has **19** `case` labels (17 + 2);
   QUIZ_CONTINUATIONS has **11** entries (9 + 2, the diff adds exactly the
   two CLIMB_ lines). PASS.

Server log across both bot games: 0 lines matching error / "no
continuation". Both test servers were killed by exact group PID; nothing
left on 3901.
