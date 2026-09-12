# Task 233b — phase/payload consistency on the TV

Fixes the two symptoms Task 233a diagnosed: scoreboard totals that creep up
between reveals and then revert, and an already-resolved question that
re-appears for a moment with a frozen timer. One root cause, one file.

## What was wrong

The server emits `PHASE_CHANGED` and then that phase's own payload (the house
pattern). They land in separate ticks, so for a few ms the TV knew the new
phase while still holding the PREVIOUS phase's payload. `phase` was committed
immediately, and `standingsForPhase()` then read whatever object the new
phase's slot happened to hold — last round's, or none at all.

233a measured the result over one `?bot=4&mode=full` game: **49 stale commits**
(16–54ms each), which `useAnimatedNumber`'s 1800ms tween stretched into a
**median 1541.9ms** visible score wobble, plus five QUESTION entries that
re-rendered the resolved question with a frozen `secondsLeft` of 16–17.

The server was exonerated: 115 emitted values per player, **0 retractions**.

## The fix (client-side only)

`socketPhase` is now the server's phase as announced. The rendered `phase` is
derived from it and advances only once that phase's own payload has arrived,
so within any one commit the phase and the payload agree. While a payload is
in flight the TV keeps rendering the last committed phase unchanged — it never
reaches back into another phase's payload.

- `payloadForPhase()` is exhaustive over `GamePhase`, so a new phase added
  without a slot is a type error rather than a silently un-gated one.
- `LOBBY` and `STAGE_ANNOUNCE` are always-ready: LOBBY renders off
  `lobby:update`, and the stage card is deliberately emitted BEFORE its
  `phase:changed` (phases.ts:216-218). An audit of every emit site confirmed
  that is the ONLY payload-before-phase exception in the codebase.
- `handleStateSync` stamps a sentinel, because a sync applies the phase and
  its payload in one handler — without it a reconnect would sit on the
  pre-sync phase until the next payload happened along.
- `PHASE_PAYLOAD_WATCHDOG_MS` = 1000 is a safety net only. A host payload
  builder that returns null makes the server skip that emit; without the
  watchdog the TV would sit on the previous phase forever rather than a few
  ms too long. Set to 400 first, then raised — see the watchdog measurement
  below.

A second, distinct cause surfaced during verification. Task 163b's kylix hold
is engaged from an effect (`setStealFlightActive`), which runs one render
AFTER the resolution commits, so the post-theft scores flashed for ~24ms
before the deliberate pre-theft hold took over — an A→B→A flicker on every
steal. `stealFlightArmed` closes that gap by deriving the hold from refs that
are already correct on the resolution render itself. No state is set during
render, so the StrictMode discipline the effect exists for is untouched.

`useAnimatedNumber` is deliberately unchanged: a steal is a legitimate decrease.

## Verification

Two full `?bot=4&mode=full` games with 233a's instrumentation and harness,
reused unchanged, then removed.

| | baseline | phase fix only | final (2 games) |
|---|---|---|---|
| stale standings commits | 49 | 8 | **0 / 0** |
| — by cause | 29 `phase:changed`, 15 `crowd:intensity`, 3 `socrates:show`, 2 `steal:show` | 8 `steal:show` | none |
| stale QUESTION entries | 10 of 10 | 0 of 10 | **0 of 10, 0 of 10** |
| commits per steal side | 2–3 in window | 3 in window | **1**, conservation 0 |

The signature of the fix in the commit log: every first commit after a phase
transition is now caused by that phase's OWN payload event (`question:show`,
`reveal:show`, `socrates:show`) — never `phase:changed` or `crowd:intensity`,
which caused 44 of the baseline's 49.

Baseline, `SOCRATES -> QUESTION` — the whole bug in one commit:

    >> t=37636.5 phase=QUESTION qIdx=0 secs=17 scores=[0,0,0,0]       cause=phase:changed
       t=37663.5 phase=QUESTION qIdx=1 secs=20 scores=[396,375,0,373] cause=question:show

After, the same transition is a single commit: `qIdx=1`, `secs=20`, correct
scores, caused by `question:show`.

REVEAL still renders `reveal && question` (the question stays on screen beside
its own reveal) — verified in both games. Both reached GAME_OVER with zero
page errors.

The watchdog fired **0 times** in either game. 13 phase advances did lag their
`phase:changed` by more than 400ms, but every one of them was a slow RENDER,
not a forced advance: the phase's own payload had already arrived 414–490ms
before the commit (REVEAL and CLIMB_QUESTION, the heaviest scenes). That is
consistent with the zero stale commits above — a watchdog-forced advance
renders a phase without its payload and would necessarily have produced one.
Those stalls are pre-existing render cost, not introduced here; the derived
phase in fact protects against them, since phase and payload still agree
across the stall. The threshold was raised 400 -> 1000ms on that evidence,
which cannot introduce a stale commit: it only makes the forced advance rarer.

## Temporary instrumentation — all removed

`server/src/realtime.ts` emit tap; `HostScreen.tsx` `useLayoutEffect` import,
`socket.onAny` arrival log and its `offAny`, post-commit log;
`SophistsRow.tsx` `useLayoutEffect` import and the `_TARGET`/`_DISPLAY` hooks;
`dev/233a-drift-check.ts`, `dev/233a-commit-check.ts`, `dev/233a-analyze.ts`;
`.233a-*` log/JSON artifacts. No devDependency was added — `playwright` was
already one. Playwright was used as a console-log pipe only: zero
`page.screenshot` calls.

## Out of scope, documented not fixed

- Stage 5 announces as "Η Λήθη" (Task 231) while CLAUDE.md still calls it
  "Η Μνήμη της Αγοράς" in places.
- With `botCount=4`, a human taking `sphinx` silently loses one bot's join
  (pre-existing, Task 176/222).
