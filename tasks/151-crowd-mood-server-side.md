# 151 — Crowd mood, server side, no assets

Correction to the task's framing: the crowd-mood subsystem is not new. It
shipped in an earlier task (commit `c80a03c`, "feat: crowd mood, server
side (35)") — `shared/src/index.ts`'s `CrowdMood`/`CROWD_MOOD`,
`server/src/crowd.ts`, `Room.crowdMood`, and full wiring through the quiz
phase machine (`server/src/phases.ts`). It was **not** wired into `draw.ts`
or `numeric.ts` at all, so standalone draw/numeric games (and the full
show's stages 2-3, since `full` composes those same functions) emitted zero
crowd moods. That gap is what this task closes.

## 1. Payload shape / host-only

`CrowdMoodPayload = { mood: CrowdMood }` (`shared/src/index.ts`, unchanged
from Task 35). `CrowdMood = 'calm' | 'tension' | 'cheer' | 'boo'`. This is
"enough context" for bed-vs-one-shot: that split is a static function of the
mood value alone (calm/tension → bed, cheer/boo → one-shot), so no extra
field is needed — the client doesn't need round metadata to decide.

Confirmed host-only: the only two emit sites are `server/src/crowd.ts:17`
(`io.to(room.hostSocketId).emit(CROWD_MOOD, ...)`) and
`server/src/index.ts:503` (`host:rejoin`'s own `socket.emit`). Neither ever
targets `room.code`. A live diagnostic (BOT_COUNT=4 bots also listening for
`crowd:mood`) confirmed zero player sockets received it.

## 2. Event → mood mapping (full table)

Quiz (unchanged, Task 35): `startQuestion`→calm, then tension at 2/3 of the
timer; `startPowerUp`→tension; `endQuestion`(REVEAL)→cheer if
`correctCount*2 > total` else boo; `startStealIfEligible`→tension;
`resolveSteal`→boo; `enterStageAnnounce`→calm; `startTrial`→tension;
`startTrialQuestion`→tension; `endTrialQuestion`(TRIAL_REVEAL)→boo if
anyone eliminated else cheer; `finishGame`(GAME_OVER)→calm.

Draw (NEW, `server/src/modes/draw.ts`): `enterDrawPhase`→calm, then tension
at 2/3 of `DRAW_DURATION_MS`; `startGuessRound`→tension;
`endGuessRound`(GUESS_REVEAL)→cheer if `correctGuessers*2 > eligibleGuessers`
else boo; standalone `finishGame`(GAME_OVER)→calm.

Numeric (NEW, `server/src/modes/numeric.ts`): `startNumericQuestion`→calm,
then tension at 2/3 of `NUMERIC_QUESTION_DURATION_MS`;
`endNumericQuestion`(NUMERIC_REVEAL)→boo if nobody submitted within half the
answer's distance (reuses `NUMERIC_LINES`' own `NOBODY_CLOSE` threshold)
else cheer; standalone `finishGame`(GAME_OVER)→calm.

Full: composes the above unchanged — `full.ts` calls the exact same
functions, so wiring draw.ts/numeric.ts once covers both standalone and
full. Full's own GAME_OVER always routes through the quiz's `finishGame`
(never draw/numeric's own), so it was already covered.

Note: an ordering bug (mood set BEFORE `phase:changed` instead of after,
unlike quiz's own convention) was introduced and then fixed in this task's
first draft — the 6 new call sites now all emit `phase:changed` before
`crowd:mood`, matching `startPowerUp`/`startStealIfEligible`/`finishGame`.

## 3. Observation — short FULL game, BOT_COUNT=4

48 `crowd:mood` events emitted, in order (phase = the client's phase at
receipt): calm(SOCRATES), tension(POWER_UP), calm(QUESTION), cheer(REVEAL),
tension(POWER_UP), calm(QUESTION), boo(REVEAL), calm(SOCRATES),
calm(DRAW), tension(GUESS), boo(GUESS_REVEAL), tension(GUESS),
boo(GUESS_REVEAL), tension(GUESS), boo(GUESS_REVEAL), tension(GUESS),
boo(GUESS_REVEAL), calm(SOCRATES), calm(NUMERIC_QUESTION),
cheer(NUMERIC_REVEAL), calm(NUMERIC_QUESTION), cheer(NUMERIC_REVEAL),
calm(NUMERIC_QUESTION), cheer(NUMERIC_REVEAL), calm(SOCRATES),
calm(QUESTION), boo(REVEAL), tension(STEAL), boo(STEAL), calm(QUESTION),
cheer(REVEAL), tension(STEAL), boo(STEAL), calm(SOCRATES),
tension(STAGE_ANNOUNCE), tension(SOCRATES), cheer(TRIAL_REVEAL),
tension(TRIAL_REVEAL), cheer(TRIAL_REVEAL), tension(TRIAL_REVEAL),
cheer(TRIAL_REVEAL), tension(TRIAL_REVEAL), boo(TRIAL_REVEAL),
tension(TRIAL_REVEAL), cheer(TRIAL_REVEAL), tension(TRIAL_REVEAL),
boo(TRIAL_REVEAL), calm(GAME_OVER). Total: **48**.

## 4. Repeats / silent phases (not fixed)

No mood fires more than **2** in a row with the same value (checked the
full 48-entry sequence).

Two phases produced no mood attributed to them: **LOBBY** (never gets an
explicit `setCrowdMood` call anywhere — its 'calm' is only the room's
initial default, never broadcast as an event) and **TRIAL_QUESTION** (its
`tension` IS set, in `startTrialQuestion`, but — pre-existing quiz code,
not touched here — that call fires BEFORE `phase:changed`, so it's always
attributed to the previous phase, TRIAL_REVEAL or STAGE_ANNOUNCE, in the
log above; a real client would see the same). `enterStageAnnounce`'s own
calm has the identical pre-existing ordering quirk for every non-trial
stage card. Report only, per task scope — not fixed.
