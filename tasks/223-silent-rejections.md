# Task 223 — silent rejections: every rejection must be visible

Three server paths dropped input with no signal to the player. Fixed all
three; the fourth criterion is the inverse regression check. Verified from
a running dev server (port 4001) over raw sockets (`socket.io-client`) —
no Playwright, no screenshots. Verification scripts were throwaway
(`dev/task223-check.ts`, `dev/task223-climb-check.ts`) and deleted after
use, not part of the permanent dev/ toolset.

## Changes

- `server/src/index.ts` (SUBMIT_ANSWER handler) — an out-of-range or
  non-integer `choice` now emits `ServerEvents.ERROR` (`server:error`,
  `{ message: "invalid choice: <value>" }`) back to the submitting socket
  before returning. Previously: `console.log` only, no wire signal.
- `client/src/screens/ControllerScreen.tsx` — added a `server:error`
  handler (the event already existed and HostScreen already handled it;
  ControllerScreen had none). New `answerError` state, cleared on every
  fresh `question:show` (the Task 140 pattern — per-question state clears
  on the phase's own start event, not just its "normal" end), rendered as
  a banner (`data-testid="answer-error"`) in the QUESTION view next to the
  existing sabotage banners.
- `server/src/phases.ts` (`broadcastClimbQuestion`, was phases.ts:1367-1378)
  — now skips any `playerId` in `room.climb.eliminationOrder` before
  building/emitting that player's `CLIMB_QUESTION_SHOW`. Previously every
  connected player got a payload every round, including a speared-out
  (Η Λόγχη) climber, whose payload just carried `eliminated: true` for the
  phone's existing spectator branch to render — but `submitClimbAnswer`
  always rejects a speared player's lock-in silently regardless, so they
  were never a real recipient of the round in the first place.
- `server/src/bots.ts` (`spawnBots`) — bots now claim avatars from the END
  of the catalogue (`avatarPool[avatarPool.length - 1 - (i % avatarPool.length)]`)
  instead of the start, so a human joining a bot room (who picks from the
  front of the same list) is less likely to collide with a bot's avatar.
  Still possible once the pool is exhausted from both ends — no cap change,
  per the task's instruction.

## 1. Invalid answers — PASS

Live `quiz`-mode room (code 8861), question live. Submitted
`{choice: 99}`, `{choice: -1}`, `{choice: "x"}` from three fresh player
sockets. Each produced exactly one event back on the submitting socket:

```
{choice: 99}  -> server:error {"message":"invalid choice: 99"}
{choice: -1}  -> server:error {"message":"invalid choice: -1"}
{choice: "x"} -> server:error {"message":"invalid choice: \"x\""}
```

No `ANSWER_ACCEPTED` in any of the three. Before this task: no event at
all, 1500ms timeout with nothing received.

## 2. AVATAR_TAKEN — PASS (already correct; verified, not changed)

A third socket joined room 8861 claiming `avatarId: "minotaur"`, already
held by Player1. Wire event: `join:rejected {"reason":"AVATAR_TAKEN"}`.
Client handling: `ControllerScreen.tsx`'s `handleRejected` (registered on
`ServerEvents.JOIN_REJECTED`) was already wired for this — it sets a
visible error message (`REJECTION_MESSAGES[payload.reason]`, rendered in
the join-form's error banner) and, specifically for `AVATAR_TAKEN` /
`INVALID_AVATAR`, clears the picked avatar and sends the player back to
the avatar-selection step so they see the grid re-grey and pick again. No
code change was needed here — both halves (server emit, client handler)
already existed; this criterion is a confirmation, not a fix.

## 3. Eliminated players — PASS

4-player `quiz`-mode room (code 5943, `finaleMode` default `climb`,
`CLIMB_SPEAR_MIN_PLAYERS = 4` satisfied). Three "good" players climbed
(alternating correct/wrong answers, to avoid winning outright before the
victim could be struck); one "victim" always answered wrong. Entry steps
`[4,2,3,1]` (last place enters at step 1, never 0 — `CLIMB_ENTRY_BASE`).

Victim: step 1 -> wrong (round 1, stepBefore≠0, no spear count) -> step 0
-> wrong at step 0 (round 2, spear count 1) -> wrong at step 0 (round 3,
spear count 2, **struck**, `eliminated: true` in that reveal). Climb
continued (`next: "CONTINUE"`, nobody at `CLIMB_TOP` yet).

Rounds 4-6 (confirmed both from the script's own per-socket receipt
counts and directly from server logs):

- Script's own tally, `CLIMB_QUESTION_SHOW` receipt count over the 15s
  after elimination: Good1/Good2/Good3 each `before=3 after=5 delta=2`
  (two more rounds broadcast and received); Victim `before=3 after=3
  delta=0` — zero further `CLIMB_QUESTION_SHOW` events reached the
  eliminated socket.
- Server log, rounds 4-6's lock-in lines: only 3 "N/4 locked in" lines per
  round, topping out at "3/4" and never reaching "4/4" (rounds 1-3 all
  reached "4/4"). The victim's playerId never appears lodging a lock-in
  from round 4 onward, because it never received the question to answer
  in the first place — `submitClimbAnswer` was never even called for them.

Surviving players (Good1/Good2/Good3) kept receiving every round
identically (all three always at the same count, no gaps).

## 4. INVERSE — PASS

- Quiz stage, room 8861: Player1 submitted a valid `{choice: 0}` during a
  live QUESTION. Result: `ANSWER_ACCEPTED {"choice":0}`, and a
  `server:error` listener armed on the same socket for 300ms afterward
  never fired.
- Full climb stage, room 5943: every one of the 12 quiz questions was
  answered by all 4 then-connected players (`player X answered question
  N` logged for all 4, all 12 questions — nobody dropped a question while
  still in the game). In the climb itself, the three surviving players'
  `CLIMB_QUESTION_SHOW` receipt counts stayed exactly equal to each other
  at every checkpoint (3 before the elimination-triggering break, 5 after
  the 15s window) — no survivor ever missed a round another survivor got.

## Found, not fixed (out of scope)

- `ControllerScreen.tsx`'s `climbReveal` render branch has a stale
  comment ("a non-climber simply never gets a climb_reveal:show at all")
  that doesn't match `phases.ts`'s `endClimbReveal` broadcast loop, which
  sends `CLIMB_REVEAL_SHOW` to every connected player unfiltered
  (`buildClimbRevealPlayerPayload` has no climbing/eliminated guard). Not
  a silent-rejection issue and not touched — task scope was the three
  named paths only.
- CLAUDE.md's Phases section still describes Η Λόγχη (the spear) as "a
  PURE MECHANIC ONLY — NOT wired into the live climb," but this task
  observed it firing live in `phases.ts` (`applyClimbSpearRound`,
  `climb.eliminationOrder` growing mid-game, real `eliminated: true`
  reveals) with `CLIMB_SPEAR_MIN_PLAYERS` still at 4. That note appears
  stale as of whatever task actually wired it in — not this one, and not
  re-verified beyond what was needed to build this task's own 4-player
  scenario.
