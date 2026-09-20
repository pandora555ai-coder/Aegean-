# Task 291 — Diagnosis: where the speech-policy slot engine will live

READ-ONLY. No behaviour changed. Branch `speech-policy`, HEAD `c87443a`.

v2 target: Socrates speaks only at fixed per-stage slots (stage close everywhere;
mid-stage for agora, blitz between rounds, draw between rounds, sykophantia first
steal; spear-out and duel one-shots), always ABOUT a specific player, never the
same target twice per stage. v1 (per-reveal picker) stays selectable per room.

---

## 0. Three CLAUDE.md claims that are STALE at this HEAD

Found while answering the criteria; each verified, not inferred.

1. **`finaleMode` does not exist.** `grep -arn "FinaleMode|finaleMode"` over
   `shared/src server/src client/src` returns **zero hits**. `RoomSettings`
   (shared/src/index.ts:1885-1896) has exactly five fields: `questionTimeMs`,
   `difficultyMix`, `gameLength`, `drawRounds`, `powerUpsEnabled`. CLAUDE.md
   documents a VIP finale-mode selector at ControllerScreen.tsx:3216-3218 — that
   selector is not there.
2. **Η Δίκη is fully removed (Task 258).** `server/src/trial.ts` is not on disk;
   `TRIAL_QUESTION` has 0 hits in shared/src/index.ts (`grep -a`, so the NUL trap
   does not apply); no `trial.js` import anywhere in server/src; zero references
   to `startTrial`/`room.trial` in phases.ts or modes/full.ts. phases.ts:1119-1121
   states it outright. The climb is the ONLY finale, and `advanceToNextQuestion
   OrGameOver` (phases.ts:1099) no longer branches on anything.
3. **The agora round is 3 questions, not 5** — see §3 structural counts.

---

## 1. Room settings: where `speechPolicy: 'v1'|'v2'` lives and flows

`powerUpsEnabled` is the right template, and the whole round trip is six touch
points. Note the lobby payload needs **no new field** — it carries `RoomSettings`
wholesale, so the setting reaches every phone for free.

| # | What | File:line |
|---|---|---|
| 1 | Type — add the field | `shared/src/index.ts:1885-1896` (`powerUpsEnabled` at :1895) |
| 2 | Default — add `'v1'` | `shared/src/index.ts:1898-1905` (`powerUpsEnabled: false` at :1904) |
| 3 | Server validation | `server/src/state.ts:576-601`; `powerUpsEnabled`'s `typeof === 'boolean'` check at :597-599. A `'v1'\|'v2'` enum should instead copy `gameLength`'s options-list check at :586-588 |
| 4 | Lobby payload | `shared/src/index.ts:938` — `LobbyUpdatePayload.settings: RoomSettings`. Free. |
| 5 | VIP set-path | `server/src/index.ts:969-995` — `VIP_UPDATE_SETTINGS` handler, LOBBY-only guard at :977, paused guard at :985, `SETTINGS_UPDATED` emit at :995 |
| 6 | Phone | `ControllerScreen.tsx:521` state init, `:873` (lobby) / `:887` (settings_updated) receive, `:1884` `handleSettingChange`, UI clone of the `SegmentedRow` at `:3428-3436`, options const beside `POWER_UPS_ENABLED_OPTIONS` at `:139` |

Settings are LOBBY-only by construction (index.ts:977), so the policy is frozen
for the whole game the instant it starts — which is what lets every v2 slot read
it without a mid-game-change guard.

---

## 2. Cumulative per-stage per-player state

### Already exists

- **`SocratesState.players`** — `socrates.ts:106-118`, allocated at `:1350-1372`:
  `correctStreak`, `wrongStreak`, `fastestAnswerCount`, `previousRank`,
  `timesInLast`, `noAnswerCount`, `totalCorrect`, `totalRounds`,
  `lastTargetedAtQuestionIndex`. **Per GAME, not per stage** — the only reset is
  `resetSocratesState` (socrates.ts:143) called once from `state.ts:875` on play-
  again. `lastTargetedAtQuestionIndex` (:117) is a 3-question cooldown, NOT a
  per-stage no-repeat rule.
- **`SocratesPlayerRoundInput`** — `socrates.ts:83-91`: `playerId`, `name`,
  `answered`, `correct`, `answerRank`, `scoreBefore`, `scoreAfter`. This is the
  richest per-round per-player shape in the codebase and already carries the score
  delta. Fed by the quiz (`phases.ts:771`) and agora (`modes/agora.ts:409`).
- **`DrawState.drawerPointsByPlayer`** — `modes/draw.ts:112-115`: cumulative
  drawer points across every cycle of the segment, consumed by `bestDrawer`
  (:582-593). **The only existing per-stage cumulative tally in the game.**
- `player.score` (`shared/src/index.ts:909`) — running total, no per-stage baseline.
- `Room.stageTimings` (`state.ts:351`, written `phases.ts:195-201`) — stage
  boundaries with timestamps, no scores. Useful as the reset trigger, not as data.

### Needs recording fresh

- **blitz per-round per-player** — the data is computed (`modes/blitz.ts:272-286`:
  `correct`/`wrong`/`unanswered`/`pointsAwarded` per player) but lives only in
  `state.lastReveal`, which `startNextBlitzRound` nulls at `:129`. Nothing spans
  the stage's two rounds.
- **draw per-guesser outcome** — `drawerPointsByPlayer` covers drawers only.
  `DrawGuessRoundContext` (`socrates.ts:1790-1795`) carries `correctGuessers`,
  `eligibleGuessers`, `distractorsHit`, `drawerName` — **counts and one name, no
  playerIds**, so no guesser can be named.
- **steal totals** — nothing accumulates. `room.steal` is nulled at
  `phases.ts:943`; `StealResolvedPayload` (`shared:1775-1786`) is fire-and-forget.
- **numeric closest/farthest** — `NumericRoundContext` (`socrates.ts:1839-1842`)
  is `{ answer, values: number[] }`, **no playerId at all**, so numeric moments
  structurally cannot name anyone today. The per-player data exists one frame
  earlier in `NumericRevealResult` (`modes/numeric.ts:298-314`: `playerId`,
  `distance`, `rank`, `exact`) and is simply never passed to socrates.ts.

---

## 3. Fire-site census — everything that speaks in v1

Eleven sites. "Gate" = wrap in `speechPolicy === 'v1'`.

| Site | File:line | v2 |
|---|---|---|
| Question-intro text | `phases.ts:657` `pickQuestionIntro` → host `socratesIntro` (:672) | **Not a beat** — host-payload text, unvoiced, no phase. Keep or retire independently |
| **Per-reveal picker (THE v1 engine)** | `phases.ts:771` `recordRoundAndPickLine` → `:958` `continueAfterReveal` → `:971-1019` `startSocratesIfLineFired` | **Gate** |
| STAGE_INTRO | `phases.ts:291` `pickStageIntroLine` | Keep (stage open) |
| Anavasis intro | `phases.ts:276` `pickAnavasisIntroSequence` | Keep |
| GAME_INTRO | `phases.ts:334` `startGameIntro` | Keep |
| WINNER coronation ×2 | `phases.ts:1126` (quiz tail) and `:1814` (`endClimb`), both `pickWinnerBeatSequence` (:476) | Keep |
| DUEL_LOCKED | `phases.ts:1652` `recordDuelLockedAndPickLine`; pool empty by design (`socrates.ts:752`) | **v2 duel one-shot rides here** |
| agora round beat | `modes/agora.ts:409` → `:543-553` `continueAfterAgoraReveal` | Gate + mid-stage slot |
| draw round beat | `modes/draw.ts:878` → `:941-945` | Gate + between-rounds slot |
| draw one-shots | `modes/draw.ts:354/356` DRAW_INTRO, `:569/571` DRAW_WINNER | Keep/retire |
| numeric round beat | `modes/numeric.ts:334` → `:409-419` | Gate |

Generic beat entry for all of them: `enterSocratesBeat` (`phases.ts:349-419`),
with `startSocratesBeat` (:428-439) for one-shots and `startSocratesSequence`
(:506-545) for prose. **v2 injects at the callers, never inside these three.**

### The two structural counts

- **Agora — the brief says 5→10; it is actually 3.**
  `AGORA_QUESTIONS_PER_ROUND = 3` (`shared/src/index.ts:3878`), and
  `buildAgoraQuestions` (`shared/src/agora.ts:313-319`) is hard-typed
  `[AgoraQuestion, AgoraQuestion, AgoraQuestion]`, built from exactly three
  builders (existence / colour / count) off one scene. The shell already counts
  from the tuple (`state.questions.length`, `modes/agora.ts:213`), so the shell
  needs nothing — but **10 questions is generator work (new question kinds or
  sanctioned repeats), not a constant bump.** Slots "Q5/Q10" do not exist yet.
- **Draw 3→2** — `FULL_DRAW_ROUNDS_BY_LENGTH` (`shared/src/index.ts:1422-1426`),
  `long: 3` → `2`. One line, read once at `modes/full.ts:146`. Standalone draw's
  own `drawRounds` / `DRAW_ROUNDS_OPTIONS` (`shared:1883`) is a different knob and
  stays untouched.

---

## 4. Slot mechanics — the hook each v2 slot rides

| Slot | Hook | Status |
|---|---|---|
| Stage close (every stage) | `phases.ts:195-201` `recordStageStart` already fires on every stage entry AND `finishGame` closes the last at `:1830`. Cleaner seam: `modes/full.ts` `advanceAfterSegment` (:203-209) / `enterStageAnnounce` (`phases.ts:204`) | **Exists** (boundary is detectable; no beat is emitted there today) |
| Agora mid-stage | `modes/agora.ts:211` `startAgoraQuestion` (index increment) and `:543` `continueAfterAgoraReveal` | **Exists** |
| Blitz between rounds | `modes/blitz.ts:382-385` — `endBlitzReveal`'s `startNextBlitzRound` branch | **Exists, exact** |
| Draw between rounds | `modes/draw.ts:557-558` → `maybeStartDrawIntroThenPhase` (:353) | **Exists** |
| Sykophantia first steal | `phases.ts:909-944` `resolveSteal`; beat slots between the emit (:925) and `continueAfterReveal` (:944) | **Exists** |
| Spear-out | Strike block `phases.ts:1407-1420`; reveal entered `:1494`, sole exit `endClimbReveal` (:1522) → `startClimbQuestion` (:1539) | **NO hook** — needs a new branch in `endClimbReveal` |
| Duel | `phases.ts:1652` DUEL_LOCKED, pool empty (`socrates.ts:752`) | **Exists** |

**No-repeat-target state and the one-shot latches** belong on `SocratesState`
(`socrates.ts:120-137`) beside `usedLines`/`momentFireCounts`: a
`targetedThisStage: Set<string>` cleared at the stage boundary
(`phases.ts:195-201`), plus `spearBeatPlayed` / `duelBeatPlayed` booleans. They
then reset for free with `resetSocratesState` (`socrates.ts:143`) on play-again,
which is the one place game-scoped Socrates state is already cleared
(`state.ts:875`).

### Smallest-change plan, ordered and sized

1. **(Sonnet)** `speechPolicy` setting — the six touch points in §1, default
   `'v1'`. Zero behaviour change; ships and deploys safely on its own.
2. **(Sonnet)** Draw `long: 3 → 2` (one line). **Agora 3→10 is NOT in this
   bucket** — raise it as its own task with a generator decision first.
3. **(Opus)** *The load-bearing new thing:* a per-stage ledger —
   `Map<playerId, {correct, wrong, points, fastest}>` on the Room, written at the
   five existing scoring sites (`phases.ts:771`, `modes/blitz.ts:272-286`,
   `modes/draw.ts:878`, `modes/numeric.ts:298-314`, `modes/agora.ts:409`) and
   cleared at `recordStageStart`. Everything in §2's "needs recording" list is
   this one structure. Also fixes numeric's no-playerId gap.
4. **(Opus)** The slot engine itself: `pickStageCloseLine(ledger)` + the
   no-repeat target set, and gating the v1 sites behind `speechPolicy === 'v1'`.
5. **(Sonnet)** Wire the five hooks that already exist (agora, blitz, draw,
   first-steal, duel) to the engine.
6. **(Opus)** The spear branch in `endClimbReveal` — the only genuinely new
   control flow in the whole feature.
7. **(Sonnet, optional)** Agora generator work, if 10 questions stays in scope.

Steps 1–2 are independently shippable. Step 3 is the gate everything else waits
on, and is where the design risk actually sits.
