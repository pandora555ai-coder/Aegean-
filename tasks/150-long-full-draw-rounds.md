# 150 — Long full game: 3 draw rounds, and prove words don't repeat

## 1. Length-dependent draw round count

`FULL_DRAW_ROUNDS_BY_LENGTH: Record<GameLength, number>` (`shared/src/index.ts:595`,
replacing the old flat `FULL_DRAW_ROUNDS = 1`): `short: 1, medium: 1, long: 3`.
`server/src/modes/full.ts`'s new `drawRoundCount(room)` reads
`FULL_DRAW_ROUNDS_BY_LENGTH[room.settings.gameLength]` and is passed into
`startDrawSegment` in `beginStage`.

Standalone draw mode is unchanged: it uses `room.settings.drawRounds`
(`DRAW_ROUNDS_OPTIONS = [1, 2]`, `shared/src/index.ts:971`), a VIP lobby
setting read by `roundsFromSettings` in `server/src/modes/draw.ts:233-235`.
That constant and code path were not touched.

## 2. Observation — long full game, BOT_COUNT=4

Ran a socket-only bot harness (no browser/Playwright) against a throwaway
dev server, mode `full`, default `gameLength: 'long'`. Log confirmed
`3 drawing round(s)`. All 12 word assignments:

```
round 0: Γιώργος -> "Ανεμόμυλος"   round 1: Γιώργος -> "Πεπόνι"      round 2: Γιώργος -> "Μήλο"
round 0: Ελένη   -> "Περιστέρι"    round 1: Ελένη   -> "Σταφύλι"     round 2: Ελένη   -> "Ρόδα"
round 0: Νίκος   -> "Μανιτάρι"     round 1: Νίκος   -> "Κρεμάστρα"   round 2: Νίκος   -> "Αμφορέας"
round 0: Μαρία   -> "Παπιγιόν"     round 1: Μαρία   -> "Καπέλο"      round 2: Μαρία   -> "Πένσα"
```

No player got the same word twice; no word appeared in more than one round,
in this run.

## 3. Cause (not fixed)

`dealAssignment` (`server/src/modes/draw.ts:189-228`) has no memory of
previously-dealt rows. Every cycle — the first deal (`dealFreshState`) and
every subsequent one (`advanceToNextCycleOrGameOver`, `draw.ts:488-511`) —
independently shuffles the *entire* `WORD_SETS` pool and slices fresh.
`assignTargets` only guarantees distinct target words *within* one cycle's
deal, never across cycles. With ~680 `WORD_SETS` rows and only 4 players ×
3 rounds, collision is unlikely per run (none occurred above) but not
prevented — it's chance, not design, that this run repeated nothing.

Smallest fix: thread a `usedWords: Set<string>` through `DrawState`
(defaulting empty at `dealFreshState`, carried forward — not reset — by
`advanceToNextCycleOrGameOver`), pass it into `dealAssignment` as an
`excludeWords` param, filter the shuffled `WORD_SETS` copy to drop any row
containing an already-used word before slicing, and add each cycle's dealt
target words into it after a successful deal. Not applied — report only,
per task instructions.

## 4. Timing

First `DRAW` phase to the last `GUESS_REVEAL` ending: **169.6s** (~2m50s)
for the 3-round long draw stage, BOT_COUNT=4.
