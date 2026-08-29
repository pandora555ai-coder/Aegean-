# 115 — One layout rule: the papyrus reads, the column carries players

LEFT (papyrus) = what is READ. RIGHT (column) = anything about PLAYERS.
Nothing under the papyrus names a player or counts them. One exception,
kept: the drawer heading above the drawing in GUESS.

## 1. Every phase view — was there a player name, avatar or counter under the papyrus?

| view | under the papyrus before | changed |
| --- | --- | --- |
| QuestionView | yes — `N/M απάντησαν` + an avatar+name per player | yes |
| RevealView | yes — a row per player: avatar, name, answer rank, time, `+N (total)`, plus a divider | yes |
| PowerUpView | yes — `N/M διάλεξαν` + an avatar+name per player | yes |
| DrawView | yes — `N/M υπέβαλαν` + an avatar+name per player | yes |
| GuessView | yes — `N/M μάντεψαν` | yes |
| GuessRevealView | yes — `Name: +N (total)` for the drawer, and `N/M μάντεψαν σωστά` | yes |
| StealView | no — the thief/victim names are ON the papyrus, they ARE the phase's text | no |
| SocratesView | no — one quote, no score column on this phase at all | no |
| NumericQuestionView | no — task 114 removed `N/M κλείδωσαν` and its strip | no |
| NumericRevealView | no — task 114 removed the beeswarm number line | no |
| GameOverView | no — its standings list is the phase, and GAME_OVER renders with NO score column (HostScreen: `showShell` is false for it) | no |
| LobbyView | no — no papyrus panel and no score column; the player list is the screen | no |
| StageAnnounceOverlay | no — renders alone, no papyrus, no column | no |
| GameLayout / PapyrusPanel / PlayerScoresPanel / TimerRing / SceneLayer | not phase views — shell/chrome | no |

Judgment calls, stated plainly:

- **RevealView was not on the task's list.** It was the largest violation on
  the TV: up to eight rows of avatar + name + `+N (total)` directly under the
  papyrus, beside a column carrying the same eight names with the same `+N`.
  Deleted under the rule. The per-option answer COUNTS stay — they sit ON the
  papyrus and count answers, not players.
- **GUESS_REVEAL's `X ζωγράφισε:` heading stays**, on the same reasoning as
  the GUESS exception: it is above the drawing and says whose sketch it is.
  Only the drawer's bonus line and the aggregate below the options went.

## 2. What was deleted, and the bottom-most content pixel at 1280x720

Line ranges are pre-edit line numbers.

| view | file | deleted | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| QUESTION | QuestionView.tsx | 87–106 (counter + name strip), props `answerProgress`/`players`/`connectedCount` | 662 → 662 | 662 → 662 |
| REVEAL | RevealView.tsx | 128–168 (results list), styles 50–73 | 588 → 495 | 611 → 474 |
| POWER_UP | PowerUpView.tsx | 69–88, props `progress`/`players`/`connectedCount` | 600 → 550 | 600 → 550 |
| DRAW | DrawView.tsx | 66–85, props `progress`/`players` | 540 → 490 | 540 → 490 |
| GUESS | GuessView.tsx | 75–77, prop `progress` | 652 → 623 | 652 → 623 |
| GUESS_REVEAL | GuessRevealView.tsx | 154–159, styles 67–78 | 649 → 618 | 649 → 618 |

Measured over real games at 1280x720 (bot-driven, real sockets), as the
bottom-most laid-out pixel of any visible element inside GameLayout's left
column. The column's own box is 662px in every in-game phase, before and
after — nothing overflowed and nothing does now.

QUESTION reads 662 → 662 because its papyrus is `flex: 1 1 0`: the freed
height went into the question text, not into a shorter column. Same
behaviour task 114 measured on NUMERIC_QUESTION. Unchanged phases at the
same two counts, for reference: SOCRATES 496/528, STEAL 506/506, GAME_OVER
641/672 (column box 684), NUMERIC_QUESTION 662/662, NUMERIC_REVEAL 662/662.

## 3. The early-advance path, observed after the counters were gone

First run made every bot answer inside 2s of a 20000ms phase, which cannot
tell "ended on the last player" from "ended fast". Re-run with the last
player answering LATE: every other bot answers at 400ms, the last at
13000ms — past the halfway mark of both phases. Elapsed is `*_show` on the
HOST socket -> `phase:changed` away from that phase.

| mode | players | configured | last answer at | elapsed |
| --- | --- | --- | --- | --- |
| QUESTION | 4 | 20000ms | 13000ms | 13016, 13007, 13006ms |
| QUESTION | 5 | 20000ms | 13000ms | 13018, 13015, 13008ms |
| NUMERIC_QUESTION | 4 | 20000ms | 13000ms | 13008, 13012ms |
| NUMERIC_QUESTION | 5 | 20000ms | 13000ms | 13009, 13006ms |

6-18ms after the last answer lands, 7 seconds before the timer would have
fired. The phase tracks the last player, not a short fuse.

For reference, the original all-bots-answer-fast run: QUESTION 4p
909-1824ms / 5p 1023-1892ms over 12 questions each; NUMERIC_QUESTION 4p
3126ms / 5p 3465ms.

## 4. Deleted because nothing referenced them any more

hostStyles.ts 902 → 802 lines: `answerCounter`, `answeredNames`,
`nameAnswered`, `nameNotAnswered`, `resultsList`, `resultRow`,
`resultRowFastest`, `resultNameText`, and the helpers
`answeredNamesSizeStyle`, `answeredAvatarSize`, `resultRowSizeStyle`,
`resultAvatarSize`, `resultsListGap`.

HostScreen.tsx: the `answerProgress`, `powerUpProgress`, `drawProgress` and
`guessProgress` state, every `set*Progress` call, the handlers
`handlePowerUpProgress`/`handleDrawProgress`/`handleGuessProgress` and their
`power_up:progress` / `draw:progress` / `guess:progress` subscriptions, plus
the `PowerUpProgressPayload`/`DrawProgressPayload`/`GuessProgressPayload`
imports. `answer:progress` KEEPS its subscription and handler — it plays the
per-answer blip; only the state it set is gone.

Views lost the props that fed the deleted blocks; the two call sites
(HostScreen.tsx, DevSceneScreen.tsx) are updated. Imports of `Avatar`,
`Fragment`, `CSSVars` and the sizing helpers went with them.

GUESS's drawer heading still renders: observed live, `Μαρία ζωγράφισε αυτό`
at y=97. GUESS_REVEAL's kept heading, `Μαρία ζωγράφισε:`, at y=102.

Typecheck clean across shared, server and client.

### `answer:progress`'s remaining consumer — observed

There is NO `CUES_ENABLED` flag anywhere in the repo (nor any `CUE_*` /
`cuesEnabled` constant, and no tasks/090 file); nothing gates the cues as a
set. The blip's only gate is the host mute toggle, `mutedRef` in `playToneAt`
(useGameAudio.ts:197), whose stored default is unmuted
(hostAudioPreference.ts: `getStoredHostMuted()` is `=== 'true'`, so an unset
key is false).

Observed on a real host at 1280x720, `AudioContext.prototype.createOscillator`
instrumented, 4 players answering 1.5s apart:

```
MUTE localStorage hostMuted=null        (unmuted)
CTX  state=running
OSC 440Hz, 554.37Hz, 739.99Hz  t=-471ms   question-start cue (A4/C#5/F#5)
OSC 659.25Hz  t=1017ms                    blip 1  (E5)
OSC 739.99Hz  t=2516ms                    blip 2  (F#5)
OSC 880Hz     t=4017ms                    blip 3  (A5)
OSC 987.77Hz  t=5517ms                    blip 4  (B5)
OSC 440Hz, 554.37Hz, 659.25Hz  t=5523ms   reveal chord
```

Four blips for four answers, ascending the first four notes of
`ANSWER_BLIP_SCALE`, on a running context. It sounds. QUESTION's answered
indicator is audible, not visual.

### `answer:progress` — what it feeds

Nothing renders from it. It feeds ONE thing: `playAnswerBlip`
(client/src/hooks/useGameAudio.ts:292-295, called at
client/src/screens/HostScreen.tsx:341) — a 55ms sine tone at peakGain 0.08
on the host's AudioContext, pitched up the 8-note `ANSWER_BLIP_SCALE`
(useGameAudio.ts:27) by the running answered count, so the room hears the
answers land. Audible output on the TV, no DOM. Muted by `mutedRef`
(playToneAt, useGameAudio.ts:197). The count is used for pitch only.

### The five progress events — every consumer

All five are emitted to the host socket alone (`io.to(room.hostSocketId)`),
never to a phone. Repo-wide listeners:

| event | server emit sites | client listeners | other route to the host |
| --- | --- | --- | --- |
| `answer:progress` | index.ts:772 | HostScreen.tsx:625/649 — `playAnswerBlip` only | none |
| `power_up:progress` | index.ts:545, 845, 1251 | NONE | `buildPowerUpProgress` is also spread into the POWER_UP show payload (payloads.ts:234) |
| `draw:progress` | modes/draw.ts:373 (from :358) | NONE | `DrawShowHostPayload` carries submittedCount/totalPlayers/submittedPlayerIds |
| `guess:progress` | modes/draw.ts:584 (from :624) | NONE | `GuessShowHostPayload` carries guessedCount/totalGuessers |
| `numeric:progress` | modes/numeric.ts:206 (from :189) | NONE | `NumericQuestionShowHostPayload` carries submittedCount/totalPlayers/submittedPlayerIds (shared:1617-1619) |

No phone listener for any of the five (ControllerScreen references none).
The early-advance path does NOT read these emits: it goes through
`haveAllConnectedPlayersAnswered` / `haveAllConnectedPlayersChosenPowerUp`
(state.ts:447/457, called at index.ts:777/849/1243/1253) and the modes' own
equivalents.

### The four listener-less events, deleted

`answer:progress` kept. Deleted symbol by symbol:

shared/src/index.ts (-40 lines)
- `ServerEvents.POWER_UP_PROGRESS` (`'power_up:progress'`)
- `ServerEvents.DRAW_PROGRESS` (`'draw:progress'`)
- `ServerEvents.GUESS_PROGRESS` (`'guess:progress'`)
- `ServerEvents.NUMERIC_PROGRESS` (`'numeric:progress'`)
- `interface PowerUpProgressPayload`, `interface DrawProgressPayload`,
  `interface GuessProgressPayload`, `interface NumericProgressPayload`
- their four `ServerToClientEvents` entries

server/src/index.ts (-18)
- the three `POWER_UP_PROGRESS` emits: the reconnect re-tick (old :542-546,
  the whole `if` block), the one after `POWER_UP_CHOICE_ACCEPTED`
  (old :844-846), and the one in the disconnect handler (old :1250-1252 —
  the surrounding `if (room && room.phase === 'POWER_UP')` collapsed into the
  `haveAllConnectedPlayersChosenPowerUp` check it wrapped)
- the `buildPowerUpProgress` import

server/src/payloads.ts (-19/+9)
- `export function buildPowerUpProgress` — its last caller was
  `buildPowerUpHostPayload`'s own spread, so its three fields are inlined
  there; `PowerUpShowHostPayload` already declares them
- the `PowerUpProgressPayload` import

server/src/modes/draw.ts (-25)
- `function broadcastDrawProgress` and its call in the draw:submit path
- `function broadcastGuessProgress` and its call in the draw:guess path

server/src/modes/numeric.ts (-14)
- `function broadcastNumericProgress` and its call in the numeric submit path

`guesserCount` survives (still used at draw.ts:500 and :520). No import
became unused beyond the two named above (checked by usage count, since no
tsconfig here sets `noUnusedLocals`). Typecheck clean across all three
workspaces.

### Early advance after the deletion — one run per mode, late last actor

Every participant but one acts at 400ms; the last acts past the halfway mark.

| mode | phase | configured | last action | elapsed |
| --- | --- | --- | --- | --- |
| quiz | QUESTION | 20000ms | 13000ms | 13017, 13015ms |
| numeric | NUMERIC_QUESTION | 20000ms | 13000ms | 13010, 13011ms |
| draw | DRAW | 75000ms | 45000ms | 45002ms |
| draw | GUESS | 20000ms | 13000ms | 13011, 13004, 13001ms |

One GUESS round read 402ms: that is the round whose DRAWER is the late bot,
so the three early guessers were the whole set. Correct, not a miss.
- `optionCard`, `optionLabel`, `optionsGrid`, `playerList`,
  `standingRowDisconnected` and `standingRowLeader` in hostStyles.ts are
  unreferenced too, but they were already dead before this task and are
  unrelated to the rule. Not touched.
