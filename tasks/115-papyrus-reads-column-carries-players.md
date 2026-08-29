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

Every bot answers; elapsed is `*_show` on a player socket → `phase:changed`
away from that phase.

- **QUESTION**, configured `questionTimeMs` 20000ms — 12 questions per game:
  4 players 909–1824ms (median ~1450ms); 5 players 1023–1892ms
  (median ~1730ms).
- **NUMERIC_QUESTION**, `NUMERIC_QUESTION_DURATION_MS` 20000ms —
  4 players 3126ms; 5 players 3465ms.

Both end when the last player acts (bots answer at 200ms/400–1900ms, and
submit numbers at 1500–3500ms), never at the configured 20s.

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

### Findings

- The server still emits `power_up:progress`, `draw:progress` and
  `guess:progress` to the host, which now has no listener for any of them.
  Left in place, exactly as task 114 left `numeric:progress`: the same counts
  drive the early-advance path, and removing the emits is a server/contract
  change, not a TV layout one.
- `optionCard`, `optionLabel`, `optionsGrid`, `playerList`,
  `standingRowDisconnected` and `standingRowLeader` in hostStyles.ts are
  unreferenced too, but they were already dead before this task and are
  unrelated to the rule. Not touched.
