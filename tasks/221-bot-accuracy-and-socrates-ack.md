# Task 221 — Make bot runs measure the real game

## What changed

`server/src/bots.ts`: each bot now draws its own accuracy once per game,
uniform in `[BOT_ACCURACY_LO, BOT_ACCURACY_HI]` = `[0.5, 0.7]`
(`randomAccuracy()`). `accurateChoice(numOptions, correctIndex, accuracy)`
answers correctly w.p. `accuracy`, else picks a uniform-random WRONG option
— applied to QUESTION (quiz, including the Η Συκοφαντία stage — "steal" in
the task's list has no correctness dimension of its own, only a
target-pick, left random by design), TRIAL_QUESTION (added for consistency
with quiz/climb, not explicitly in the task's list but the same mechanic),
CLIMB_QUESTION, AGORA_QUESTION, GUESS (draw-guess), and BLITZ_SWIPE.
`correctIndex`/true-value are read in-process off `Room`/mode state via four
new tiny accessors (`getAgoraCorrectIndex` in modes/agora.ts,
`getDrawCorrectIndex` in modes/draw.ts, `getBlitzStatementIsTrue` in
modes/blitz.ts, `getNumericTrueAnswer` in modes/numeric.ts) — never over a
socket, so "the correct answer never leaves the server before REVEAL" is
unchanged.

Numeric (Εκτίμηση) has no "correct" — formula used:
`value = clamp(round(trueValue + U(-1,1) * (1-accuracy) * max), 0, max)`.

Socrates ack: only `room.hostSocketId` may emit `SOCRATES_AUDIO_ENDED`
(index.ts's `getHostRoomForSocket`), so a player-bot structurally cannot ack
this — the gap is socket-only test harnesses that open a bare host socket
with no browser/audio behind it. `bots.ts` now exports
`wireHostSocratesAck(hostSocket)`: on `SOCRATES_SHOW`, schedule
`SOCRATES_AUDIO_ENDED` after `payload.totalDurationMs` (the server's own
byte-size mp3 estimate, `resolveSocratesDurationMs` — the same value a real
browser's playback would take). Production is unaffected (a real `?bot=N`
room is always fronted by a real browser that already acks correctly).

`server/scripts/trial-montecarlo.ts`: new `--p-correct-range LO-HI` flag —
each simulated player draws its own `pCorrect` once per run, matching the
real bots' per-bot draw, instead of the flat/leader-vs-others buckets.

New harness: `dev/bot-accuracy-check.ts` — throwaway dev server,
`mode=full, botCount=6` + 1 scripted human (VIP), observes every host-shaped
REVEAL/BLITZ_REVEAL/etc. off the host socket alone (all reach it: host-only
sends plus room-wide broadcasts the host also joined), reads bots' assigned
accuracy back off `bots.ts`'s own stdout log line.

## 1. ACCURACY HELD

`?bot=6` full-mode run (6 bots + 1 scripted human VIP), assigned p range
observed 0.508–0.679. Per (bot, family) pair, observed-vs-assigned:

| family | counts/bot |
|---|---|
| quiz | 10 |
| blitz | 8–12 |
| draw-guess | 18 |
| agora | 3 |
| climb | 8 |

Pooled: 171/294 correct = 0.582 observed vs 0.600 n-weighted assigned mean
(diff −0.018). Per-pair z-scores ((obs−p)/SE) across all 30 pairs: 29 within
±2.2, one at −2.19 (Νίκος/draw-guess, n=18) — consistent with sampling
noise at these counts, not a systematic bias.

## 2. DIVERGENCE

Post-change final bot scores: `[8195, 8182, 8753, 10514, 8785, 5178]` —
spread (top−bottom) = **5336**, a clear leader (10514) and a clear last
(5178). A same-config pre-change run (bots.ts reverted to HEAD: blind 25%
choice, no Socrates ack) **did not reach GAME_OVER within 900s** — it never
produced a comparable number. This is itself evidence of the fix: the old
blind-bot config isn't just less divergent, it may not reliably finish a
6-bot full game at all (consistent with task 220's climb-termination
finding), where the new one finished in 771.9s with a real spread.

## 3. AUDIO ACK

Post-change: 25 Socrates beats fired, `totalDurationMs` (and matching
measured ack delay) ranged **4000–10063ms**; **0/25 rode the
`SOCRATES_MAX_DURATION_MS` (11000ms) backstop**. Total game duration:
**771.9s** (vs Task 214/215's 844.2–870.3s reference at botCount=3, and vs
the pre-change botCount=6 run above, which didn't finish in 900s).

## 4. CLIMB RE-MEASURE (inverse)

`trial-montecarlo.ts --finale climb --players 3 --p-correct-range 0.5-0.7
--runs 400` (two seeds):

- seed 184: cap-hit **6/400 = 1.5%** (median rounds 7, p99 24)
- seed 99: cap-hit **4/400 = 1.0%** (median rounds 7, p99 22)

vs task 220's baseline **84.0% @0.25** (400 runs). The N=3 stall does
**not** exist at realistic (50–70%) accuracy — it's an artifact of the old
blind-25% bots, exactly as task 220 already projected from its flat-0.6
data point (0.3%).

## Not touched

No scoring formula, stage mechanic, phase machine, climb/duel mechanic, or
game constant was changed. `bots.ts`'s STEAL/POWER_UP/DUEL_PICK target
selection stays uniform-random (no correctness dimension applies).
