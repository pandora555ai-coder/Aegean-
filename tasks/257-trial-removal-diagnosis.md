# Task 257 — Η Δίκη removal: diagnosis only

DIAGNOSIS ONLY. Zero code changed; this file is the only addition.
Decision taken as given: `finaleMode: 'trial'` will never be played and is
being removed. Η Ανάβασις (climb) has been the default finale since Task 214,
so **no default game path enters the trial today** — every removal step below
leaves a full game playable by construction.

**First correction to the brief: `server/src/modes/trial.ts` does not exist.**
The trial was never a mode (Task 127 made it the quiz's FINALE). `ls
server/src/modes` = agora, blitz, draw, duel, full, numeric, quiz, registry,
types, README. Its only registry-adjacent presence is two phase-array arms
(`modes/quiz.ts:49-50`, `modes/full.ts:98-99`) and two continuation-table arms
(`modes/quiz.ts:76-77`). There is no mode entry to unregister.

---

## A. Trial-only — reachable only from the trial finale

### shared/src/index.ts
| Symbol | Line | Why trial-only |
|---|---|---|
| `ClientEvents.TRIAL_SUBMIT` | 78 | The trial's own lock-in event; climb/agora have their own (CLIMB_SUBMIT, AGORA_SUBMIT). |
| `ServerEvents.TRIAL_QUESTION_SHOW` / `TRIAL_REVEAL_SHOW` | 160, 161 | Emitted only by `broadcastTrialQuestion`/`endTrialQuestion` (phases.ts:1211, 1382). |
| `GamePhase` `'TRIAL_QUESTION'` / `'TRIAL_REVEAL'` | 1001, 1002 | The two phases the trial owns. |
| `crowdIntensityFor` trial arm | 1138-1140 | One `case` pair; the climb has its own at 1143-1150. |
| `TRIAL_WRONG_ANSWER_HIT_PCT`, `TRIAL_NO_ANSWER_HIT_PCT`, `TRIAL_DRAIN_PCT_PER_SEC` | 2953-2955 | The life-drain formula; the climb has no life. |
| `trialWrongHit`, `trialDrainPerSec` | 2960, 2966 | Used only by trial.ts + payloads.ts:631-632/663-664. |
| `TRIAL_MAX_QUESTIONS` | 2974 | Only phases.ts:1118 and trial-montecarlo.ts:35. |
| `TRIAL_STAGE_TITLE`, `TRIAL_STAGE_TAGLINE` | 2982, 2983 | Only payloads.ts:73-74's `room.climb ? CLIMB_… : TRIAL_…`. |
| `TrialSubmitPayload`, `TrialLife`, `TrialQuestionShowHostPayload`, `TrialQuestionShowPlayerPayload`, `TrialQuestionShowPayload`, `isTrialQuestionHostPayload`, `TrialRevealResult`, `TrialRevealShowPayload` | 3299, 3305, 3320, 3341, 3360, 3362, 3371, 3389 | The trial's whole wire contract. The climb has parallel `Climb*` types. |
| `StateSyncTrialQuestionHostPayload` / `…PlayerPayload` / `StateSyncTrialRevealPayload` + union arms | 2433, 2437, 2441, 2488-2490 | Reconnect shapes for the two dying phases. |
| Socket typings for the three events | 4055, 4099, 4100 | Follow their events. |

### server
| Symbol | Line | Why trial-only |
|---|---|---|
| **`server/src/trial.ts` (whole file, 115 lines)** | — | `TrialRoundEntry` :22, `trialDrain` :33, `scoreTrialRound` :44, `TrialNext` :86, `nextAfterTrialRound` :93, `nextAfterSuddenDeath` :109. Sole importer: `phases.ts:54`. |
| `phases.ts` trial section | 1086-1422 | `startTrial` :1104, `trialParticipantIds` :1161, `trialElapsedMs` :1169, `startTrialQuestion` :1178, `broadcastTrialQuestion` :1211, `allConnectedParticipantsLockedIn` :1227, `submitTrialAnswer` :1238, `recheckTrialPhaseOnDisconnect` :1274, `endTrialQuestion` :1287, `endTrialReveal` :1396, `endTrial` :1416. |
| `phases.ts` `QuizTimerKind` trial arms | 131-132 | The two timer kinds; pairs with quiz.ts:76-77. |
| `phases.ts` `endStageAnnounce` trial branch | 291-296 | `if (room.trial)` → TRIAL_INTRO beat → `startTrialQuestion`. |
| `phases.ts` `advanceFromSocrates` STAGE_INTRO trial branch | 1015-1016 | Same beat's other end. |
| `phases.ts` finale pick | 1070 | `finaleMode === 'climb' ? startClimb : startTrial` — collapses to `startClimb`. |
| `payloads.ts` `trialLives` / `buildTrialQuestionHostPayload` / `buildTrialQuestionPlayerPayload` / `buildTrialRevealPayload` | 601, 618, 648, 678 | Build only the dying events. |
| `payloads.ts` `buildGameOver` trial branch | 519-560 | Survival order off `room.trial.eliminationOrder` :524. The climb branch (483-517) is separate and stays. |
| `state.ts` `TrialState` / `Room.trial` / init / reset | 130, 395, 494, 916 | (`TrialLockIn` :120 is NOT trial-only — see B5.) |
| `index.ts` state-sync arms (player, host) | 375-381, 521-527 | Two `case` pairs. |
| `index.ts` `vip:next` TRIAL_REVEAL branch | 1319-1321 | Manual skip; the rejection log string at :1342 lists it too. |
| `index.ts` `TRIAL_SUBMIT` handler | 1475-1487 | |
| `index.ts` disconnect recheck | 1837 | `recheckTrialPhaseOnDisconnect`. |
| `modes/quiz.ts` phase + continuation arms | 49-50, 76-77 | |
| `modes/full.ts` phase arms | 98-99 | |
| `bots.ts` TRIAL_QUESTION_SHOW handler | 351-358 | Bots' trial answering. |
| `socrates.ts` `TRIAL_INTRO_LINES` (5 lines), `pickTrialIntroLine`, collect entry | 578, 1668, 1907 | Only caller phases.ts:292. |
| `server/scripts/trial-montecarlo.ts` **trial half only** | 40, ~263-450 | The file itself SURVIVES — see B2. |
| `package.json:16` `"trial:montecarlo"` | 16 | Rename only if the file is renamed. |

**Voice:** the five TRIAL_INTRO mp3s are `d295dac7a65e30d9`, `3ddebe8b10733d14`,
`6218772f908eaf1e`, `d059880e03c6da1f`, `74674c00d0b43251` — all five verified
present on disk. `collectVoiceLineEntries()` returns **278** active entries
today (276 of them with an mp3 present, 283 files in the dir); removal takes
that to **273 active / 271 with a file**, and those five mp3s become orphans.
Nothing prunes orphans (## Voice), and `client/public/voice` is a symlink into
production — so this is a code-only deletion, no file removal, no regeneration.

### client
| Symbol | Line | Why trial-only |
|---|---|---|
| `host/TrialQuestionView.tsx` (62 lines), `host/TrialRevealView.tsx` (80 lines) | — | Whole files; imported only at HostScreen.tsx:116-117. |
| `hostStyles.ts` `trialOutcomeLine` | 329 | Only TrialRevealView.tsx:61, 66. |
| `HostScreen.tsx` | 27, 87-89, 116-117 (imports); 293-296 (state); 472-475 (`payloadForPhase`); 1070-1073 (countdown); 1304-1313 (state:sync); 1434-1435 / 1475-1476 (on/off); 1759-1785 (timers); 2004 `trialDisplayStandings`, 2028 `trialEliminatedPlayerIds`, 2058 `trialConfirmedOutPlayerIds`; 2104-2107 (standings); 2153 (deltas); 2358-2377 (render); 2520 (krater); 2783-2792 (`isTrialPhase`) | Every arm keyed to the two phases. |
| `ControllerScreen.tsx` | 628-635 (state); 760 `applyTrialQuestion`; 1111 / 1129 (handlers); 1461-1469 (sync); 1548-1549 / 1586-1587 (on/off); 1861 `handleTrialAnswerTap`; 2307-2341 (reveal card); 3119-3180 (question view); 4550 `styles.trialLife` | `trialLife` is used only at 2338 and 3139, both trial. |
| `ControllerScreen.tsx` finale selector | 146-149 (`FINALE_MODE_LABELS`), 3675-3681 | Goes with `FinaleMode` itself (only two options, one survivor). |
| `DevVoiceAbScreen.tsx` two TRIAL_INTRO samples | 107-118 | Hardcoded sample lines. |

**No CSS anywhere** — `grep -arni "trial" client/src/*.css` returns zero hits.

### harnesses (trial-only sections)
`dev/full-lineup-check.ts` `finaleTrialContext` :569-590 + PHASES :57-58 + bot
handler :167-169 · `dev/pause-resume-check.ts` scenario B :314-322 + table :81
· `dev/duel-overlay-check.ts` `runTrialSinkSupplement` :363-424 + :122-124 ·
`dev/bot-accuracy-check.ts` :203-205, :291-292, :347 · `dev/screenshot-phases.ts`
:381-392, :877-880 (+ the 153-156 comment) · `dev/socrates-cutoff-timing-check.ts`
:106-108 · `dev/generate-voice-lines.ts` :31, :118-119.

**Five harnesses set `finaleMode: 'trial'` for an unrelated reason — to make a
SHORT game** and would break behaviourally (not at typecheck) the moment the
setting is gone: `dev/241-name-check.ts:351`, `dev/242-name-clip-check.ts:353`,
`dev/245-name-check.ts:415`, `dev/242-podium-name-check.ts:141`, and
`dev/podium-subtitle-followup-check.ts:228` (which clicks the
`setting-finale-trial` testid). Repoint these first — step E1.

---

## B. "Trial"-named but NOT the trial finale — must survive

1. **`isTrialResult`** (shared:2322) — the no-digits gate for BOTH finales;
   a misnomer since 205b. **Non-trial call sites:** `payloads.ts:513` sets it
   `true` inside the **climb** branch of `buildGameOver`; `HostScreen.tsx:2941`
   (`hideScores`); `ControllerScreen.tsx:2094`; `server/scripts/climb-spear-live-check.ts:271`;
   `dev/climb-ceremony-check.ts:550`; `dev/end-state-timer-subtitles-check.ts:132`;
   `client/src/screens/DevSceneScreen.tsx:270`.
2. **`server/scripts/trial-montecarlo.ts`** — runs the climb via
   `--finale climb` (:28, :150-153, :234-238), importing nine pure functions
   from `../src/climb.js` (:41-53) that have nothing to do with the trial;
   `--spear on|off|auto` (:248) is the Task 203 spear harness. Its VirtualClock
   is cited as the reference shape by `dev/agora-wire-check.ts:366` and
   `server/scripts/climb-spear-live-check.ts:31`. Delete only its trial half.
3. **`StageSegment` `'trial'`** (shared:1219) and **`trialStageRow`**
   (shared:1365) — this is **the finale ROW for the CLIMB too**. Non-trial
   call sites: `modes/quiz.ts:102` and `shared/src/index.ts:1511`
   (`buildFullStages`) append it unconditionally, and `payloads.ts:68-85`
   renders it as **Η Ανάβασις** when `room.climb` is set; `modes/full.ts:185`
   declines `segment === 'trial'` for the climb as well.
4. **`trialStageNumber`** (phases.ts:162) — called by **`startClimb` at
   phases.ts:1485**, as well as by `startTrial` at :1149.
5. **`TrialLockIn`** (state.ts:120) — **`ClimbState.lockIns` at state.ts:172**
   uses it, as does `TrialState.lockIns` at :143.
6. **`stageIntroIdentity`'s `'finale'`** (socrates.ts:497-513) — `segment ===
   'trial'` → `'finale'` is reached for the **climb's** row; the climb's own
   `ANAVASIS_INTRO_SEQUENCE` plays through the `room.climb` branch.
7. **`renderTrialSpectator`** (ControllerScreen:2052) — called for the **climb**
   at :3207 (`'climb-eliminated-title'`), not just at :2310/:3121. Its body,
   `renderSpectatorNotice` :2034, was generalized for exactly this in Task 190.
8. **`sortAndRankResults`** (scoring.ts:36) and its `TrialRevealResult`-naming
   comment (:18-19, :33) — used by `climb.ts:49`, `modes/agora.ts:392` and
   `phases.ts:708`.
9. `ClimbState`'s doc comments citing `trial.eliminationOrder` as the pattern
   (state.ts:196, payloads.ts:483) — prose, but it stops resolving once
   `TrialState` is gone; reword, don't delete the code.

---

## C. Blast radius in the phase machine

**GamePhase goes 24 → 22** (union at shared/src/index.ts:997-1030; removing
`'TRIAL_QUESTION'` :1001 and `'TRIAL_REVEAL'` :1002). Counted, not estimated:
the union has 24 members today.

Every per-phase table that must lose an arm:

| Table | Line | Failure mode if missed |
|---|---|---|
| `crowdIntensityFor` | shared 1138-1140, throwing `default` at 1179-1181 | The `never` check at 1180 is a **compile error** if the arm stays, and the `throw` is what the brief flagged. |
| `StateSyncPayload` union | shared 2488-2490 | Type error. |
| `QuizTimerKind` | phases.ts 131-132 | Must drop **together with** `QUIZ_CONTINUATIONS` :76-77 — the table is `Record<QuizTimerKind, …>`, so dropping either alone is a type error. |
| `QUIZ_PHASES` | modes/quiz.ts 49-50 | `readonly GamePhase[]` — a stale arm is a type error. |
| `FULL_PHASES` | modes/full.ts 98-99 | Same. |
| `QUIZ_CONTINUATIONS` | modes/quiz.ts 76-77 | See QuizTimerKind. |
| player `state:sync` switch | index.ts 375-381 | Type error (switch over GamePhase). |
| host `state:sync` switch | index.ts 521-527 | Type error. |
| **`payloadForPhase`** | HostScreen.tsx 472-475 | **Exhaustive over GamePhase (Task 233b)** — a stale arm is a type error, which is the intended safety net. |
| HostScreen standings switch | 2104-2107 | |
| HostScreen krater switch | 2520 | |
| HostScreen countdown if-chain | 1070-1073 | Not exhaustive — silent if missed. |
| HostScreen state:sync switch | 1304-1313 | |
| ControllerScreen state:sync switch | 1461-1469 | |
| `dev/full-lineup-check.ts` PHASES | 57-58 | Harness's own copy of the phase list. |
| `dev/pause-resume-check.ts` progress table | 81 | |

The `vip:next` rejection log string at index.ts:1342 names TRIAL_REVEAL as a
literal — a runtime string, not an identifier, so it needs an edit but breaks
nothing.

---

## D. Shared between trial and climb — DO NOT DELETE

| Shared code | Trial call site | Climb call site |
|---|---|---|
| `getUnusedQuestionSet` (questions.ts:164) | `startTrial` phases.ts:1115 | `startClimb` phases.ts:1443 |
| `trialStageRow` (shared:1365) | quiz.ts:102 | shared:1511 `buildFullStages` (climb's own card) |
| `trialStageNumber` (phases.ts:162) | phases.ts:1149 | phases.ts:1485 |
| `TrialLockIn` (state.ts:120) | `TrialState.lockIns` :143 | `ClimbState.lockIns` :172 |
| `sortAndRankResults` (scoring.ts:36) | `scoreTrialRound` trial.ts:44 | climb.ts:49 |
| `buildStageAnnounce` finale branch (payloads.ts:68-85) | `room.trial` :73-74 | `room.climb` :73-74, `finale` :85 |
| `isTrialResult` (shared:2322) | payloads.ts:559 | payloads.ts:513 |
| `renderSpectatorNotice`/`renderTrialSpectator` (ControllerScreen:2034/2052) | :2310, :3121 | :3207 |
| `startSocratesBeat('WINNER', pickWinnerBeatLine)` | `endTrial` phases.ts:1417 | `endClimb` (Task 237's temple beat) |
| `armQuizTimer` + `QuizTimerKind` machinery (phases.ts:120-147) | TRIAL_* kinds | CLIMB_*/DUEL_* kinds |
| `advanceToNextQuestionOrGameOver` (phases.ts:1046) | :1070 `startTrial` | :1070 `startClimb` |
| `'finale'` StageIntroIdentity (socrates.ts:497-513) | trial row | climb row |
| `StageAnnouncePayload.finale` / `SocratesShowPayload.finale` (shared:1550, 2080) | `'trial'` | `'climb'` — Task 244's `isClimbFinale`; narrow the type, keep the field |

---

## E. Recommended removal order

Each step compiles and leaves a full game playable. The climb is already the
default, so no step changes what a default room plays.

1. **Harnesses first, no product code.** Repoint the five `finaleMode: 'trial'`
   shorteners (A, last paragraph) to plain short games, and delete the
   trial-only harness sections. Nothing in server/client/shared is touched, so
   a regression here can't hide behind a later step.
2. **Remove the VIP finale choice.** ControllerScreen :146-149, :3675-3681;
   shared `FinaleMode` :1879, `FINALE_MODE_OPTIONS` :1880, `RoomSettings.finaleMode`
   :1876, `DEFAULT_ROOM_SETTINGS.finaleMode` :1891; collapse phases.ts:1070 to
   `startClimb`. **Narrow, don't delete,** `StageAnnouncePayload.finale`/
   `SocratesShowPayload.finale` to `'climb' | null` (payloads.ts:85, :293) —
   HostScreen's `isClimbFinale` reads them (Task 244). After this the trial is
   unreachable at runtime while still compiling.
3. **Delete the server phase machine.** phases.ts:1086-1422, QuizTimerKind
   :131-132, endStageAnnounce :291-296, advanceFromSocrates :1015-1016;
   quiz.ts :49-50/:76-77; full.ts :98-99; index.ts :375-381/:521-527/:1319-1321/
   :1342/:1475-1487/:1837; bots.ts :351-358; payloads.ts :601-694 + buildGameOver
   trial branch :519-560; state.ts `TrialState` :130, `Room.trial` :395/:494/:916;
   **delete `server/src/trial.ts`.** Keep every D row.
4. **Delete the client views and state.** TrialQuestionView.tsx,
   TrialRevealView.tsx, hostStyles :329, and the HostScreen/ControllerScreen
   arms listed in A. Keep `renderTrialSpectator` (B7) and `isTrialResult`
   consumption (B1).
5. **Delete the shared contract.** The two GamePhase values (→ 22), the
   crowdIntensityFor arm, TRIAL_* constants/functions, payload + state-sync
   types, event names and socket typings. `payloadForPhase` and the `never`
   check make an omission a compile error, not a silent gap.
6. **Socrates/voice.** `TRIAL_INTRO_LINES` :578, `pickTrialIntroLine` :1668,
   `collectVoiceLineEntries` add :1907, DevVoiceAbScreen :107-118. Active
   entries 278 → 273. Do **not** touch `client/public/voice` (production
   symlink); the five mp3s simply join the existing orphan set.
7. **Optional, separate commit — renames only, zero behaviour.**
   `isTrialResult` → `isPositionResult`, `trialStageRow`/`trialStageNumber` →
   `finaleStageRow`/`finaleStageNumber`, `StageSegment 'trial'` → `'finale'`,
   `TrialLockIn` → `FinaleLockIn`, `renderTrialSpectator` → fold into
   `renderSpectatorNotice`, `trial-montecarlo.ts` → `finale-montecarlo.ts`
   (+ package.json:16). Worth its own task: `'trial'` is a wire-visible
   StageSegment value and `isTrialResult` is a payload field, so the rename
   touches the contract even though nothing behaves differently.

**Not covered by any step, flag for the implementing task:** `dev/screenshot-phases.ts`
already has no trial captures (:153-156 explains why), so phase-shot counts
(21 TV / 12 phone) are unaffected by this removal.
