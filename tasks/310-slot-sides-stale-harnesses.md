# Task 310 — slot side selection + stale harness repair

## 1. How each v2 slot picks best vs worst (read-only, at 8d95648)
`pickSpeechSlot` (server/src/speechSlots.ts:188) routes three ways:
- **SYKO_FIRST_STEAL / SYKO_CLOSE** -> `stealCandidates` (speechSlots.ts:141): thief (max `stealTaken`) then victim
  (max `stealGiven`) — the data names the side; the close tries both.
- **QUIZ_MID, QUIZ_CLOSE, BLITZ_MID, BLITZ_CLOSE, LETHE_CLOSE** -> `candidatesFor` (speechSlots.ts:120): the ledger's
  score-delta `stageExtremes` (stageLedger.ts, best = unique max, worst = unique min) ordered by the spec's `prefer`
  (QUIZ_MID worst, QUIZ_CLOSE best, BLITZ_MID best, BLITZ_CLOSE worst, LETHE_CLOSE best), falling through to the
  other end on a tie / already-targeted / spent pool. Two-sided.
- **DRAW_MID (`prefer: 'best'`) and NUMERIC_CLOSE (`prefer: 'worst'`)** — also `candidatesFor` before this task, so
  they picked the SAME preferred side every time (309's probe: 20/20 one pool) AND picked by the wrong measure: the
  score leader is not "the drawer everyone understood", and the score loser is not "the farthest estimator".
  **These two were the defect.** No other slot was one-sided.

## Fix
- DRAW_MID -> `drawCandidates`: per drawer, sum `drawRounds` (correct/eligible). correct === eligible -> BEST,
  correct === 0 -> WORST, else neither. Several qualifiers on a side -> one at random; both sides -> random order;
  neither -> skip.
- NUMERIC_CLOSE -> `numericCandidates`: per player mean of `numericMisses[].relative` (distance / question max, new
  field, recorded by numeric.ts:347 which now passes `question.max`; raw distances are not comparable across
  questions). Closest = BEST, farthest = WORST, tied end dropped, the MORE EXTREME (1 − closestMiss vs farthestMiss)
  is spoken about, equal extremes / everyone equal / <2 answerers -> skip. Non-submitters are absent, not far.
- Alternation + `targetedThisStage` unchanged (checked below).
- v1 reservoirs, SLOT_SPECS for the other 5 slots: untouched.

## 2. Probe (`npx tsx dev/310-side-check.ts`, pure, 20/20; 24 builds per case)
DRAW_MID: everyone-got -> BEST 24/24; nobody-got -> WORST 24/24 (target = the unguessed drawer, not the score
leader); both present -> BEST 14 / WORST 10; several qualifiers -> BEST 24, 3 different targets; no extreme -> SKIP
24/24; empty ledger -> SKIP 24/24. NUMERIC_CLOSE: closest more extreme -> BEST 24/24; farthest more extreme -> WORST
24/24; equal extremes -> SKIP; tied closest -> WORST; everyone equal / one answerer -> SKIP; 40 random fields ->
BEST 17 / WORST 23; best already targeted -> falls to WORST. Other five slots, 60 random ledgers each: both pools
reached every time.

## 3. Stale harnesses (bank untouched)
New dev-only server hook `AEGEAN_DEV_HIDE_CLIPS` (socratesAudio.ts, NODE_ENV-guarded like AEGEAN_DEV_VOICE_DIR):
comma-separated lineHash values `resolveSocratesClip` reports as `known: false`. Browser half = a `page.route` 404 for
the same hashes. It is the inverse of 263's search-path hook: a clip can now be pretended absent.
- **dev/263-coronation-check.ts** 44/5 -> **52 passed, 0 failed**. D asserts all six coronation clips exist
  (306/307) instead of zero. Held-time check is now "over 1000 ms and 1000 ms inside its backstop" (real audio, not a
  404's instant ack). A hides Νίκος's vocative (server + browser) so the without-vocative branch is still exercised.
  B drops the 8000-byte dummy and uses the real bank clip. New in A/B/C: the TV's own AudioBufferSourceNode starts are
  recorded, and the vocative clip must have SOUNDED (B) / must NOT have (A, C) — proved by playback, not by payload.
- **dev/303-hold-check.ts** (was "found 166/0", could not start) -> **23 passed, 0 failed** (B 8, C 4, D 3, E 2, A 6).
  Clip-less lines are two synthetic TEST-only lines. B hides SKIP_INTERRUPTED's four clips (server only, socket host);
  A hides all 66 slot/reservoir clips from server + browser in a live v2 show, so QUIZ_MID/QUIZ_CLOSE are again beats
  with no audio held for their computed 7273 / 6455 ms. Also fixed: B/C/D left an armed beat timer that fired into
  E (advanceFromSocrates -> startQuestion on a never-started room -> TypeError killing the run); `retire(room)` now
  clears it. C (pause mid-hold) is meaningful again: frozen 7696 -> 7696 ms, resumed remainder 7743 vs 7696.
- dev/308-vocative-slot-check.ts W: its hand-built ledger had no draw/numeric data, so those two slots correctly
  skipped; it now seeds drawRounds / numericMisses. 18/18.
- dev/294-slot-probe.ts 16/16 unchanged.

## Inverse
typecheck x3 clean; 277 24/24; 308 W 18/18, T 3/3, P 3/3; 263 52/0; 303 23/0.

## Live confirmation (`SCENARIO=L dev/308-vocative-slot-check.ts`, `?bot=4&mode=full&policy=v2`, 758 s, 33 beats)
Real recorders on the live path: stage 3 DRAW_MID -> `DRAW_MID_BEST` (target Χρυσάνθη); stage 4 NUMERIC_CLOSE ->
`NUMERIC_CLOSE_BEST` (target Παρθένα; 309's game drew WORST for the same slot — the side now follows the estimates).
Every other slot fired from its own pool; none skipped.
