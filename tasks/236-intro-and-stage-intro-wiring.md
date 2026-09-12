# Task 236 — wire the voice lines: game intro, five stage intros, three Ανάβασις lines

A comprehension fix, not polish. A player led on points all game and
finished 4th; nothing in the game ever said that points only buy your
STARTING STEP in Η Ανάβασις. The Ανάβασις lines are the only place that
rule is stated, and they were not wired.

Observed with `dev/intro-lines-check.ts` (new, committed here): a real
`?bot=3&mode=full` room over the real socket protocol against a throwaway
server, with a PAUSE-AWARE Socrates audio ack on the host socket. Baseline
and after are two full runs to GAME_OVER (605.3s / 773.1s).

## Diagnosis (before any edit)

**The gate.** `endStageAnnounce` (phases.ts) called
`modeForRoom(room).beginStage?.(room)` BEFORE `pickStageIntroLine`. For any
non-quiz stage full.ts's hook starts that stage's mechanic and returns
true, so `pickStageIntroLine` was never reached at all — the pools were not
merely empty, they were unreachable. Fixed by ORDER only: the intro line is
asked for first (`resumeAfterStageAnnounce`), the hook is untouched.

Selection is BY STAGE TAG, as required: `stageIntroIdentity(definition)`,
with the definition resolved by `room.stage` via a new
`definitionForCurrentStage`. The old code used
`stageOfQuestion(room, room.currentQuestionIndex)`, which maps a QUESTION
INDEX to a stage — every non-quiz stage has `questionCount: 0` and is
invisible to it, so that would have picked a neighbouring quiz stage's
lines. Same resolution `buildStageAnnounce` already uses for the card.

**The finale special-case.** `phases.ts:249-252` (pre-change):
`if (room.climb) { startClimbQuestion(room); return; }` — before any line
was picked, which is why the finale was silent. The CARD was never the
problem: `startClimb` → `enterStageAnnounce` already emitted it
(`buildStageAnnounce` reads `room.climb` for the words, payloads.ts:68-81).
Only the line was missing.

**The 22 lines.** All 22 are in `client/public/voice` (a symlink into
production's voice dir). Verified 22/22 that `lineHash(text, tag)` equals
the filename Task 230 generated, then re-verified through the real wiring
(`collectVoiceLineEntries`, tags read from `LINE_TAGS`): 276 active lines,
**0 missing mp3s, 22/22 wired, 0 untagged**. No audio file was written,
moved or generated — `voice:generate` reports 0 API calls when every line
already has audio.

## What changed

- **A.** `GAME_INTRO_SEQUENCE` (10 lines) plays in `full`. `GAME_INTRO_LINES`
  (the old 8) is KEPT for the standalone modes — which is also what keeps
  Task 231's "filtered out of full, kept for standalone" true of the lines
  it filtered. The new lines describe full's lineup by content ("σε γνώση,
  σε ταχύτητα, σε μνήμη"; #9 sets up Η Ανάβασις) and would misdescribe a
  standalone quiz exactly as the round count 231 had to filter out did.
- **A/C. Sequences, not pools.** Both Εισαγωγή and Ανάβασις are sequential
  prose — #3 ("Απόψε ήρθαν για το δεύτερο") only means anything after #2,
  #8 only after #7 — so a random pick would emit nonsense. For Ανάβασις it
  also matters that #20 alone does NOT state the rule: picking one of three
  would leave a third of games never stating it, defeating the task. All
  three play; #21 carries the rule outright. New `startSocratesSequence` +
  `room.pendingSocratesQueue`; `advanceFromSocrates` drains the queue before
  routing, so each line gets its own held phase and its own audio ack.
- **B.** `STAGE_INTRO_LINES` gains `blitz` (3), `draw` (2), `numeric` (2),
  `agora` (2), and the line pick moves ahead of `beginStage`.
- **C.** The climb branch plays `ANAVASIS_INTRO_SEQUENCE`, and
  `advanceFromSocrates`'s STAGE_INTRO case routes `room.climb` →
  `startClimbQuestion`.
- **D.** GAME_INTRO moved out of `enterQuestionOrPowerUp` into
  `endStageAnnounce`, i.e. AFTER the first stage card.

### D — which option, and why

Chosen: **card first, then intro** (not "card under the intro"). During
SOCRATES the TV renders `SocratesView`, which is `GameLayout` with `{null}`
content — there is no read slab to put a card under, so "card visible
under the intro" needs new client work on the 233b phase/payload path. With
a 66.9s narration the round indicator must precede it regardless, and
announcing the card first achieves that with a server-only reorder and no
new phase. Result: the card is the FIRST thing on screen, at 0.0s.

## Acceptance criteria

### 1. Every stage announced AND voiced (baseline: 5 of 7 silent)

Attributed by beat KIND from the server log, not by timestamp — the socket
payload carries no kind, and timestamp attribution wrongly credits a stage
with a mid-round moment or the end-of-game WINNER beat.

| stage | baseline | after: line id | group | tag | t(card) → t(line) |
|---|---|---|---|---|---|
| 1 Η Αγορά | STAGE_INTRO | `c879c061df601c57` (quiz pool) | quiz | `[dry]`→`[amused]` | 0.0s → 75.2s |
| 2 Η Παλαίστρα | **SILENT** | `4171b462473d2c7c` | Παλαίστρα#11 | `[serious]` | 157.8s → 161.3s |
| 3 Ζωγραφική | DRAW_INTRO only | `4b9a56cfe96d3269` | Ζωγραφική#14 | `[curious]` | 210.3s → 213.9s |
| 4 Εκτίμηση | **SILENT** | `e4529417379f1c98` | Εκτίμηση#16 | `[curious]` | 412.2s → 415.7s |
| 5 Η Λήθη | **SILENT** | `9e4102d2b03800ba` | Λήθη#18 | `[serious]` | 474.8s → 478.3s |
| 6 Η Συκοφαντία | STAGE_INTRO | `9a11add071f1faa3` (steal pool) | steal | `[sarcastic]` | 542.2s → 545.7s |
| 7 Η Ανάβαση | **SILENT** (WINNER only) | `36ae9a28048b61c5` +#21 +#22 | Ανάβασις#20-22 | `[serious]` | 654.2s → 657.7s |

Baseline beat kinds: `GAME_INTRO 1, STAGE_INTRO 2, DRAW_INTRO 3,
DRAW_MOMENT 3, DRAW_WINNER 1, NUMERIC_MOMENT 2, AGORA_MOMENT 3, WINNER 1`.
Stages 2/4/5/7 had NO intro beat of any kind; stage 3 was voiced only by
the draw mode's own per-round `DRAW_INTRO`, not a stage intro — so 5 of 7
lacked a `STAGE_INTRO`. After: `STAGE_INTRO 9` (7 stages, the finale
contributing 3), every tag matching its own stage, finale included.

Stage 3 now plays its stage intro AND then the draw mode's own
`DRAW_INTRO` — two beats back to back. Correct but chatty; noted, not
changed (it is the draw mode's existing per-round beat, not this wiring).

### 2. Round-1 open

| event | baseline | after |
|---|---|---|
| game start | 0.0s | 0.0s |
| **stage-1 card shown** | **7.3s** | **0.0s** (log 1109ms) |
| GAME_INTRO first line | 0.0s (`0b3e026f0ee0fbe8`) | 3.5s (`35e4fb8b4163c1f6`) |
| GAME_INTRO last line ack | 7.3s (1 line) | 75.2s (10 lines) |
| first question shown | 19.1s | 80.7s |

Baseline: 7.3s of intro with no round indicator, then the card. After: the
card is first and no question ever counts down without the round having
been indicated — the indicator precedes the first spoken word by 3.5s.

**Finding (not fixed):** the cold open is now 80.7s to the first question
(was 19.1s) — 66.9s of narration plus the stage-1 intro line. Trimming is
a one-line edit (drop entries from `GAME_INTRO_SEQUENCE`), and suppressing
stage 1's own STAGE_INTRO when the game intro just played would save ~6s
more. Left for a human call; the task asked for the lines to be wired.

### 3. The rule is now stated

All three Ανάβασις lines fire, in order, as the finale's STAGE_INTRO:

| id | audio | start | end |
|---|---|---|---|
| `36ae9a28048b61c5` (#20) | 4159ms | 658826ms | ack 662990ms |
| `a8ec509e4513305d` (#21) — **states the rule** | 9359ms | 662991ms | ack 672349ms |
| `b8399492286a98e1` (#22) | 11006ms observed | 672350ms | 683356ms |

First `CLIMB_QUESTION` at 683356ms — after the last line ended, never
during. Harness check `climb starts after audio ack? YES`.

**Finding (not fixed):** #22's real audio is 13.9s but
`SOCRATES_MAX_DURATION_MS` is 11000ms, so the backstop cut it at 11006ms —
~2.9s lost. Four wired lines exceed the cap (#9 12.4s, #11 11.2s, #15
11.0s, #22 13.9s). CLAUDE.md forbids raising the cap ("shorten the line
instead"), and this task must not generate audio, so they stay truncated
until someone shortens and regenerates them. The rule still lands: #21
(9.3s, complete) states it outright.

### 4. Inverse

- **Moment lines still fire:** 25 non-Task-230 lines, e.g.
  `a478d6a1e9d414be` "Άλλαξε η κορυφή…" at 105.3s (lead change),
  `195970871b620871` "Τρεις συνεχόμενες αστοχίες…" at 152.0s (streak),
  `f14e01b86a916871` "Ο καθένας είδε κάτι διαφορετικό…" at 239.1s
  (SPLIT_GUESS). Kinds unchanged: DRAW_MOMENT 3, NUMERIC_MOMENT 2,
  AGORA_MOMENT 3, DRAW_WINNER 1, WINNER 1.
- **Task 231 filtered lines: 0 occurrences** in both runs (harness greps
  all four line texts against every beat).
- **Pause mid-SOCRATES:** paused 403ms into the first intro beat at
  5020ms, resumed 6524ms — a 1504ms freeze, `resumed, remainingMs=10594`,
  and the run continued cleanly to GAME_OVER at 773.1s.

## The bug this task introduced, and fixed

The first after-run showed intro line #10 playing for **2ms**. Cause: #9's
real audio (12.4s) exceeds the 11s backstop, so the backstop advanced to
#10 and #9's now-stale ack arrived ~1ms later and advanced AGAIN. Before
sequencing this was harmless — the next phase was not SOCRATES, so the
handler's phase check rejected the stale ack. Beats that follow one another
directly made it reachable.

Fixed with a beat IDENTITY, not a timing guard: `room.socratesBeatId`
(monotonic, incremented in `enterSocratesBeat`), sent as
`SocratesShowPayload.beatId`, echoed by the TV on `socrates:audio_ended`,
and checked server-side. A time-based guard would have been wrong — a
missing clip legitimately acks at ~0ms (Task 154), and that ack carries the
CURRENT id, so it still ends the beat immediately. After: `stale beat 9,
current is 10` rejected once, and #10 plays its full 6226ms.

## Terminal paths of Η Ανάβασις

C touches only the climb's ENTRY (`endStageAnnounce`/`resumeAfterStageAnnounce`);
no terminal path changed. All five still end at `finishGame` unchanged:
CLIMB_TOP arrival, duel verdict (`endDuelReveal`), round cap
`CLIMB_MAX_ROUNDS` (`resolveClimbAtCap`), pool exhaustion, and spear
last-survivor — each reaching `endClimb` → WINNER beat → `finishGame` →
GAME_OVER with `isTrialResult: true`. The observed run ended via the normal
climb path with the WINNER beat intact (1 WINNER beat, GAME_OVER 773.1s).

## Out of scope, found on the way

- `dev/stage-intro-check.ts` (Task 218) is **broken**: its human joins as
  `sphinx`, but bots take avatars from the END of `AVATAR_CATALOGUE`
  (bots.ts:466, Task 223), so with `?bot=3` one bot is rejected
  AVATAR_TAKEN and its own `players.length >= 4` wait times out after 20s.
  Task 236's harness joins as `minotaur` (catalogue index 0) instead.
  Not fixed here.
- The climb GAME_OVER ranks by steps, not score — the baseline run ended
  with rank 2 on 3421 points and rank 3 on 4188, which is exactly the
  confusion this task exists to explain.

## Typecheck

`npm run typecheck` (shared + server + client) — clean.
