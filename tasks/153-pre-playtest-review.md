# 153 — Pre-playtest review and hotfixes

Report-first pass before the first real-TV playtest with the new voice and
the first humans reaching stage 4 and the trial. All observations are from a
socket-only bot harness (no browser/Playwright) on a throwaway dev server on
port 3901; the harness lives in the session scratchpad, not the repo.

## 1. Voice integrity

Every one of the 254 `LINE_TAGS` entries hashed with `lineHash(text, tag)`
and looked up in `client/public/voice` (read-only): **254 active, 0 missing.**
`collectVoiceLineEntries()` yields the same 254 hashes — the two sets are
identical in both directions. Real durations via ffprobe (not the generator's
byte-size estimate): **0 active clips over 11000ms.** Longest active clip is
10919ms — `4aa08f1cec71c4fc`, SPLIT_GUESS, 114 chars — 81ms under the
backstop. 11 active clips exceed 10000ms, 28 exceed 9000ms.

## 2. Trial density (short full game, BOT_COUNT=4)

SOCRATES fired 15 times in the whole show:

| stage | fires | what |
|---|---|---|
| 0 (pre-stage) | 1 | GAME_INTRO |
| 1 Η Αγορά | 3 | STAGE_INTRO, ONLY_ONE_CORRECT, HARD_HIT |
| 2 Ζωγραφική | 4 | DRAW_INTRO, NOBODY_GUESSED ×2 (third NOBODY_GUESSED detected, pool exhausted → silent), DRAW_WINNER |
| 3 Εκτίμηση | 2 | WILDLY_OFF ×2 (third detected, silent) |
| 4 Η Συκοφαντία | 3 | STAGE_INTRO, COLD_STREAK_3, SPEED_DEMON |
| 5 Η Δίκη | 2 | TRIAL_INTRO (after its STAGE_ANNOUNCE), WINNER (after the last TRIAL_REVEAL) |

The trial ran 15 TRIAL_QUESTION/TRIAL_REVEAL rounds (129s → 250s) and
**Socrates spoke on 0 of them.** By code, nothing can fire between trial
rounds: `recordRoundAndPickLine` is called only from `endQuestion`
(`phases.ts:482`), and `startSocratesBeat` only takes `GAME_INTRO` /
`STAGE_INTRO` / `WINNER` (`phases.ts:256`). `endTrialQuestion` never picks a
line, and `continueAfterTrialReveal` goes straight to `startTrialQuestion` or
`endTrial` (`phases.ts:1094-1105`). So the only moments that CAN fire during
the trial are TRIAL_INTRO (once, before round 1) and WINNER (once, after the
verdict or pool exhaustion). `MOMENT_FIRE_CAP = 2` (`socrates.ts:66`) is
checked inside `recordRoundAndPickLine` only, so it never applies there —
and it never needs to. Not a finding.

## 3. Hotfix — draw word repeats

`server/src/modes/draw.ts`:
- `DrawState.usedWords: Set<string>` — every target word dealt so far in
  this segment, across cycles.
- `dealAssignment(room, usedWords)` filters `WORD_SETS` to rows containing
  none of those words (so a used word can't come back as a target OR as a
  distractor), shuffles/slices from that pool, and adds each dealt target to
  the set on a successful deal.
- `dealFreshState` builds a fresh empty set before its deal and stores it;
  `advanceToNextCycleOrGameOver` passes `state.usedWords`. `prepareGame` →
  `dealFreshState` still starts with `drawStateByRoom.delete(room)`, so the
  set is cleared with the rest of the state on every fresh deal.

**If the filtered pool runs short** (fewer unused rows than connected
players): it logs `only N unused word set(s) left for M players - allowing
repeats this cycle` and falls back to the full `WORD_SETS` for that cycle.
A repeat beats a stuck or truncated stage. Unreachable in practice: ~680
rows, at most 8 players × 3 rounds = 24 targets, each excluding at most the
rows sharing one of its words.

First long-game verification run was INVALID — its server failed with
EADDRINUSE and the game silently ran against the short run's leftover
pre-hotfix server (the harness killed `npx`, not the `tsx` child). Fixed
the harness (detached spawn, kill the process group) and re-ran on a fresh
server. Long full game, BOT_COUNT=4, 3 draw rounds, 12 assignments:

```
round 0: Γιώργος -> "Χελώνα"     round 1: Γιώργος -> "Μήλο"    round 2: Γιώργος -> "Ελικόπτερο"
round 0: Ελένη   -> "Καπέλο"     round 1: Ελένη   -> "Σκάλα"   round 2: Ελένη   -> "Πυξίδα"
round 0: Νίκος   -> "Δέντρο"     round 1: Νίκος   -> "Χωνί"    round 2: Νίκος   -> "Μοτοσικλέτα"
round 0: Μαρία   -> "Ασπίδα"     round 1: Μαρία   -> "Βιολί"   round 2: Μαρία   -> "Άρμα"
```

12 assignments, 12 distinct words, no "allowing repeats" fallback logged.
Server log confirms `dealt 4 distinct word sets (3 round(s))`, `starting
round 2/3`, `starting round 3/3`. Full typecheck passes.

## 4. Anything else — flags only, no fixes

1. **The trial cannot reach a verdict with full-mode scores.** Both long
   runs played all 16 trial rounds with NOBODY eliminated (final lives
   8418 / 2474 / 2175 / 1377) and ended via `trial pool exhausted after 16
   round(s) — highest score wins` (`phases.ts:882-887`), i.e. a plain
   score-ranked GAME_OVER with `isTrialResult=false`. The short run needed
   15 of 16 rounds to eliminate three. Cause: `DRAIN_PER_SEC = 10` and
   `WRONG_HIT = 150` (`shared/src/index.ts:1856,1860`) against lives in the
   thousands; a fast correct answerer loses ~3 life per round. Expect
   tonight's trial to be a 16-round, 4-5 minute stretch with no elimination
   drama and no survival-order ending. Not retuned — design call.
2. **Long clips have almost no margin under the 11000ms backstop, and the
   host fetches each mp3 on first hearing.** The server arms a flat
   `SOCRATES_MAX_DURATION_MS` (`phases.ts:692`) the instant it emits
   SOCRATES_SHOW; the host then fetches + decodes the clip with no preload
   (`client/src/hooks/useGameAudio.ts:254`). The longest active clip
   (SPLIT_GUESS, 10919ms) leaves 81ms for socket + fetch + decode; 11 clips
   leave under 1s. On a real TV over Wi-Fi the backstop can advance the
   phase before the last words land. Fix would be a lobby-time prefetch of
   the voice dir or shortening those 11 lines (Task 149 style) — neither
   done here.
