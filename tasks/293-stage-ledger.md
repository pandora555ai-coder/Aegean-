# Task 293 — Per-stage performance ledger (Opus, branch `speech-policy`)

Branch `speech-policy`, started at HEAD `21ca46c` (Task 292), tree clean. No deploy.

Naming (binding): quiz-stage = display **«Η Αγορά»**; `modes/agora.ts` = display **«Η Λήθη»**.

**DATA ONLY.** No beat, no speech, no behaviour change. v1 runs untouched — nothing
reads the ledger back; it is written, and dumped in `?bot=N` runs.

## What landed

`server/src/stageLedger.ts` (new, pure — its only `@game/shared` import is a TYPE,
erased at runtime, so it loads with no server at all). One struct per stage per
player, six recorders, one selector, one dev-only dump. Hung on `SocratesState`
so play-again clears it for free through the existing `resetSocratesState`.

---

## 1. Ledger type + reset site, and the reset count

**Type:** `StageLedgerEntry` — `server/src/stageLedger.ts:58`; the stage wrapper
`StageLedger` — `:84`. Per player per stage: `correct` / `wrong` / `noAnswer`, `points` (the
stage's true score delta), `fastestCount`, `firstHalf` / `secondHalf`,
`blitzRounds[]`, `drawRounds[]`, `numericMisses[]`, `stealTaken` / `stealGiven`.

**Reset site:** `server/src/phases.ts:219` —
`resetStageLedger(room.socrates.ledger, stage, title, definition ? stageSegment(definition) : null)`
inside `recordStageStart`, i.e. 291 §4's clear point, the function every stage
transition already goes through. The outgoing stage is dumped one line earlier
(`phases.ts:217`) so a dump always describes a stage that is **over**. The last
stage has no successor to close it, so `finishGame` dumps it too
(`phases.ts:1875`), exactly where Task 239's `stageTimings` closes its final entry.
Play-again clears it via `socrates.ts:158`.

**Reset fires between every stage — observed 7:** a `?bot=5&mode=full` show
(room 0897) produced **7 stage cards, 7 resets, 7 dumps**, one per stage, in order:

```
stage 1 "Γύρος 1 — Η Αγορά"       (quiz)    5 players, 5 quiz questions
stage 2 "Γύρος 2 — Η Παλαίστρα"   (blitz)   5 players, 0 quiz questions
stage 3 "Γύρος 3 — Ζωγραφική"     (draw)    5 players, 0 quiz questions
stage 4 "Γύρος 4 — Εκτίμηση"      (numeric) 5 players, 0 quiz questions
stage 5 "Γύρος 5 — Η Λήθη"        (agora)   5 players, 3 quiz questions
stage 6 "Γύρος 6 — Η Συκοφαντία"  (quiz)    5 players, 5 quiz questions
stage 7 "Η Ανάβαση"               (trial)   0 players, 0 quiz questions
```

Stage 7 closing with **0 players is correct, not a miss**: the climb scores in
STEPS, not points, and routes through none of the five capture sites. Confirmed
arithmetically in criterion 3 — the six scoring stages already sum to the exact
final scores, leaving nothing for the climb to contribute.

## 2. The six capture sites, one line each

| # | Site | Quote |
|---|---|---|
| 1 | quiz | `phases.ts:793` `recordLedgerQuizRound(room.socrates.ledger, socratesInputs, definition.questionCount)` — same per-player inputs the v1 picker gets |
| 2 | blitz | `blitz.ts:293` `recordLedgerBlitzRound(room.socrates.ledger, state.roundIndex + 1, results)` — **capture-before-null**: placed in `endBlitz` above `state.lastReveal = {...}`, because `startNextBlitzRound` nulls that snapshot (`:129` pre-293) the moment the stage's next window opens |
| 3 | draw | `draw.ts:883` `recordLedgerDrawRound(room.socrates.ledger, {...guessers: results})` — at the call site, so `DrawGuessRoundContext` (counts + one NAME, no ids) is untouched and the v1 detector it feeds is unchanged |
| 4 | steal | `phases.ts:948` `recordLedgerSteal(room.socrates.ledger, {...})` — from the payload `applySteal` just returned; nothing accumulated theft before this |
| 5 | numeric | `numeric.ts:339` `recordLedgerNumericRound(room.socrates.ledger, state.questionIndex, results)` — **the playerId rescue**: `NumericRoundContext` is `{answer, values}` with no id at all, so a numeric moment structurally could not name anyone; `results` still carries `playerId` AND `distance` one frame before that call discards them |
| 6 | agora | `agora.ts:411` `recordLedgerQuizRound(room.socrates.ledger, socratesInputs, state.questions.length)` — Η Λήθη's round shape IS `SocratesPlayerRoundInput`, so it needs no recorder of its own (count from its own tuple, since every agora stage row carries `questionCount: 0`) |

**Selector:** `stageExtremes(ledger)` — `stageLedger.ts:348`. Returns
`{stage, title, segment, best, worst}`, each extreme carrying the values that
justify it (`points`, `correct`, `wrong`, `noAnswer`). Ranked on the stage's score
delta, the one measure every segment kind produces. **Ties leave `null`**, so a
slot that cannot name one person falls back rather than picking arbitrarily. It
takes the ledger rather than a stage number because only ONE stage is alive at a
time by construction — the reset is the whole point.

Pure probe (no server, no port), all as expected: half split **3+2** over 5
questions and **2+1** over 3; blitz accumulating **13/10/1, 60 pts** across both
windows; steal **+120 / −120** on both sides; numeric keeping the id and the
distance (non-submitter → `null`, not `0`); drawer outcome 2/3; ties →
`null`/`null`; single player → best only.

## 3. Two dumped stages from a full bot run

`?bot=5&mode=full`, room 0897. **Blitz** (stage 2) — per-round `r1`/`r2` tallies,
which nothing spanned before:

```
[ledger] room 0897 stage 2 "Γύρος 2 — Η Παλαίστρα" (blitz) closed — 5 players, 0 quiz questions
[ledger]   Ξανθίππη pts=+425 c/w/-=11/5/8 r1=6/2/4(250) r2=5/3/4(175)
[ledger]   Χρυσάνθη pts=+675 c/w/-=17/7/0 r1=10/2/0(450) r2=7/5/0(225)
[ledger]   Μαρκέλλα pts=+600 c/w/-=16/8/0 r1=8/4/0(300) r2=8/4/0(300)
[ledger]   Σμαράγδα pts=+350 c/w/-=10/6/8 r1=6/2/4(250) r2=4/4/4(100)
[ledger]   Παρθένα pts=+450 c/w/-=14/10/0 r1=7/5/0(225) r2=7/5/0(225)
[ledger]   best=Χρυσάνθη (675) worst=Σμαράγδα (350)
```

**Quiz-stage** (stage 6, Η Συκοφαντία — quiz + STEAL), per-half split visible as
`halves=first-correct/first-wrong|second-correct/second-wrong`:

```
[ledger] room 0897 stage 6 "Γύρος 6 — Η Συκοφαντία" (quiz) closed — 5 players, 5 quiz questions
[ledger]   Ξανθίππη pts=+749 c/w/-=2/3/0 halves=1/2|1/1
[ledger]   Χρυσάνθη pts=+1584 c/w/-=4/1/0 fastest=2 halves=2/1|2/0 stole=790 robbed=793
[ledger]   Μαρκέλλα pts=+2381 c/w/-=4/1/0 fastest=2 halves=3/0|1/1 stole=793
[ledger]   Σμαράγδα pts=+356 c/w/-=2/3/0 halves=1/2|1/1 robbed=397
[ledger]   Παρθένα pts=+1586 c/w/-=5/0/0 fastest=1 halves=3/0|2/0 stole=397 robbed=790
[ledger]   best=Μαρκέλλα (2381) worst=Σμαράγδα (356)
```

Stage 1 (Η Αγορά) likewise: `best=Μαρκέλλα (1986) worst=Ξανθίππη (373)`, splits
`3/0|2/0` for a 5/5 player and `1/2|0/2` for a 1/4 one — 3+2, the odd-count rule.

**Plausible against the run's final scores — exactly.** Summing each player's
per-stage ledger points across all seven dumps reproduces their GAME_OVER score
to the point, with no residue:

| Player | ledger sum | GAME_OVER score |
|---|---|---|
| Μαρκέλλα | 9837 | 9837 |
| Παρθένα | 7739 | 7739 |
| Ξανθίππη | 5586 | 5586 |
| Σμαράγδα | 5497 | 5497 |
| Χρυσάνθη | 4999 | 4999 |

That is also what proves the steal is booked on both sides (Χρυσάνθη
`stole=790 robbed=793` nets −3) and that the climb adds no points.

## 4. INVERSE — v1 default unchanged

`speechPolicy` stays at its default `'v1'` (Task 292); nothing added here reads it.

**Beat kinds and counts — three `?bot=5&mode=full` shows.** One PRE-change (all six
modified files stashed; verified mid-run: **0** `recordLedger` occurrences in the
working tree and **0** ledger dumps in its log) and TWO POST-change, the second run
purely as a variance control.

| Beat kind | pre | post 1 | post 2 |
|---|---|---|---|
| GAME_INTRO | 10 | 10 | 10 |
| STAGE_INTRO | 9 | 9 | 9 |
| REVEAL | 10 | 10 | 10 |
| WINNER | 3 | 3 | 3 |
| AGORA_MOMENT | 3 | 3 | 3 |
| DRAW_INTRO | 2 | 2 | 2 |
| DRAW_WINNER | 1 | 1 | 1 |
| DRAW_MOMENT | 4 | 2 | 3 |
| NUMERIC_MOMENT | 3 | 1 | 2 |
| **total beats** | **45** | **41** | **43** |

**Seven of the nine kinds are identical across all three runs**, in identical order.
The two that move are `DRAW_MOMENT` and `NUMERIC_MOMENT` — the outcome-dependent
detectors, which fire only when a round's own shape trips them AND the pool still
holds an unused line (the Task 138 pattern). They differ **between the two
POST-change runs as well** (2 vs 3, 1 vs 2) on byte-identical code, so this is
inherent run-to-run variance from the question draw and the bots' accuracy rolls,
not an effect of this task. A bare pre-vs-post diff would have read as a
regression; the control run is what rules that out.

**Unchanged BY CONSTRUCTION, not only by observation:** `stageExtremes` has **0**
call sites outside its own file, and every `.ledger` reference in the tree is a
void statement — never a branch condition, never an argument to a picker. No v1
decision can read the ledger, so no beat can change.

**Typecheck ×3:** shared, server and client clean on all three runs (plus a fourth
after the stash/pop, confirming the restored tree still compiles).

**Harness counts unchanged:** `npm run agora:validate` — "no category exceeds 2x
uniform skew"; `npm run blitz:draw-check` — pool 218, 15 + 15, overlap 0.

**Stage timings, pre vs post** (stages 1–6, the ones the ledger writes in): 53.0/79.5/
124.6/38.3/45.4/74.2s vs 53.4/79.5/122.7/39.4/45.9/74.7s — within ~2%, no
measurable cost. Only the climb moved (130.2 → 105.9s), which CLAUDE.md already
records as varying hugely run to run.

**`main` and the tag are untouched:** `main` = `c87443a`, tag `v1.0-playtest` =
`c87443a`. All work is on `speech-policy`. No deploy.

**Diff:** 6 files modified (+93/−2) plus 2 new — `server/src/stageLedger.ts` and
`dev/293-ledger-check.ts` (the socket-level harness these runs used: in-process
real server on a throwaway port, so the server's own `[ledger]` lines land in the
harness's stdout).

## Notes for the v2 slot engine (Task 294+)

- The climb stage closes with **0 players** by design — it scores in steps, not
  points, and touches none of the capture sites. A finale slot needs `room.climb`,
  not the ledger.
- `stageExtremes` takes the LEDGER, not a stage number: only one stage is alive at
  a time, which is the whole point of the boundary reset. A slot wanting history
  would need the ledger archived at the boundary instead of cleared.
- The no-repeat-target set (`targetedThisStage`) and the `spearBeatPlayed` /
  `duelBeatPlayed` latches from 291 §4 are **not** in this task — it is data only.
