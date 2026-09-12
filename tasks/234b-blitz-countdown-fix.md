# Task 234b — FIX: the blitz countdown tracks real time; the early end verified

Client-side only. No server timing, predicate or phase-machine change — the
`server/` and `shared/` trees are byte-identical to 75f6e7c.

## The fix (client/src/screens/HostScreen.tsx)

234a's diagnosis: both blitz countdown effects keyed on the `blitz` payload
OBJECT, which Task 224's `handleBlitzProgress` replaces on every accepted swipe
(carrying a stale `durationMs`). So each swipe re-seeded the clock to 30 AND
tore down the 1s interval before it could fire.

Mirrors the proven QUESTION pattern (HostScreen.tsx:1356-1370):
- the tick now depends on `[phase, blitz?.durationMs, paused]` — scalars that
  stay constant for the whole swipe window. `blitz?.durationMs` plays exactly
  the role `question?.questionIndex` plays for QUESTION: preserved by
  `handleBlitzProgress`'s spread, so it changes only on a genuine re-sync.
- seeding moved OUT of the object-keyed effect into explicit call sites —
  `handleBlitzShow` and the `state:sync` BLITZ branch — as QUESTION seeds from
  `handleQuestionShow` / `handleStateSync`.
- the tick decrements through `blitzSecondsLeftRef` via `applyBlitzSecondsLeft`,
  not a functional updater, so StrictMode's dev-only double-invoke cannot
  double-decrement it (the reason `secondsLeftRef` exists).
- `handleGameResumed` gained its missing `BLITZ` branch: BLITZ was the only
  timed phase absent from that list, so a resumed swipe window kept whatever
  value the interval froze at instead of the server's real remaining time.

`handleBlitzProgress` is untouched — it still creates a new object per swipe.
The timer simply stopped caring.

## Criterion 1 — countdown honesty under swipe load (`?bot=5&mode=full`)

30 one-second samples across the whole window; every one exact. 60 swipes landed
during it (3 fast bots done by 5.5-6.7s, 2 slow bots swiping through to 27.5s),
so the object churn that caused the bug was present throughout.

| wall_s | server s | TV committed s |
|---|---|---|
| 0.0 | 30 | 30 |
| 4.0 | 26 | 26 |
| 8.0 | 22 | 22 |
| 12.0 | 18 | 18 |
| 16.0 | 14 | 14 |
| 20.0 | 10 | 10 |
| 24.0 | 6 | 6 |
| 29.0 | 1 | 1 |

**Max divergence 0s at all 30 samples** (limit ≤1s). First commit of each value
at 0.9, 1.9, 2.9 … 28.9s — strictly monotonic, **zero backwards ticks**.
Baseline: stuck at 30 for 7.7s, then 27→30→29→28→30.

## Criterion 2 — positive early end (all connected players finish)

Run C, six players, all reaching 12/12. 12th submission, s after blitz start:
Αργύρης 6.9 · Ελένη 7.3 · Νίκος 7.5 · Σοφία 7.5 · Δημήτρης 6.8 · Μαρία 6.8.

`early-end-fires` logged at t=1789246900133, `endBlitz` entered the same
millisecond with **`remainingMs=22491` (>0 → early end, not expiry)**, results
broadcast t=1789246900134. **Gap last submission → results = 1ms.** Its countdown
was honest for the 7.5s it ran: 30/29/28/27/26/25/24/23, server-exact.

## Criterion 3 — inverses

**A — one player unfinished** (run B, Αργύρης stops at 3/12; the others finish
7.0-7.9s): no early end, `endBlitz` at 30.0s with **`remainingMs=0`**, gap to
results 22.1s. Countdown honest all the way down — 30 samples, all exact,
30→1, no backwards tick.

**B — QUESTION in the same game as criterion 1:**

| wall_s | server s | TV committed s |
|---|---|---|
| 0.0 | 20 | 20 |
| 1.0 | 19 | 19 |
| 2.0 | 18 | 18 |
| 3.0 | 17 | 17 |

Zero divergence, identical on all five questions of the stage. Unchanged by
this task — it is the pattern the blitz tick now copies.

## Criterion 4 — cleanup

All 234a instrumentation removed: `server/src/modes/blitz.ts`,
`server/src/index.ts` and `server/src/state.ts` reverted to 75f6e7c verbatim;
HostScreen's `[TV]` logger and its `useLayoutEffect` import removed.
`grep -rn "BLITZ_DIAG\|__diagRooms\|\[TV\]"` over `server/src client/src
shared/src` returns nothing. `npm run typecheck` passes.

`dev/blitz-timing-check.ts` is kept as the acceptance harness (SCENARIO=A full
bot game / B one-unfinished / C all-finish; ports overridable via
`DIAG_SERVER_PORT`/`DIAG_CLIENT_PORT`). Its measuring columns came from the
234a instrumentation, so re-running it for NUMBERS means re-adding those log
lines; as committed it still drives the three game shapes end to end.

## Findings outside scope — documented, not fixed

- `blitzReveal`'s two countdown effects (HostScreen ~1615-1633) are still keyed
  on the payload object. Harmless today — nothing rewrites that object mid-
  reveal — but it is the same shape as the bug just fixed.
- `handleGameResumed` still has no branch for BLITZ_REVEAL, CLIMB_* or DUEL_*,
  so those keep the frozen local value across a pause instead of the server's.
- Slow bots cannot finish 12 statements in 30s (`profileDelayMs` 3000-4500ms,
  bots.ts:134 vs `BLITZ_DURATION_MS`): in run A two of five bots stalled at
  8/12 and 7/12, so a bot-only game will almost never trigger the early end.
  That is a bot-pacing question, not a countdown one.
