# Task 234a — DIAGNOSIS: Η Παλαίστρα does not end early, and its countdown does not track real time

DIAGNOSIS ONLY. Nothing fixed, nothing committed. Temporary instrumentation is
listed at the end for removal before 234b.

Context check: `/root/Aegean-` clean at start, HEAD `75f6e7c` — which *is*
Task 233b, so at/after the required commit.

Method: two runs of `dev/blitz-timing-check.ts` (own throwaway ports 3906/5907,
own server+vite+Playwright, agora-scene-check.ts's spawn/cleanup shape).
Two independent clocks, same machine:
- SERVER: `remainingActiveTimerMs` sampled 1×/s by a `BLITZ_DIAG` ticker, plus
  every accepted swipe.
- TV: a `useLayoutEffect` with NO dependency array in HostScreen, logging the
  committed krater value on every commit (the 233a technique — post-commit, so
  it reports what the screen showed, never what a socket handler received).

Run A = `?bot=5&mode=full` (the prescribed method), room 2462.
Run B = `?mode=blitz`, 5 players who finish + 1 who stops at 3/12, room 4041 —
the playtest's own shape (a phone in the room that never reached 12/12),
deterministic and race-free, since a real bot room self-starts before a human
can join.

---

## Criterion 1 — submissions vs. results

Run A (`?bot=5&mode=full`), times relative to blitz start:

| player | final | 12th submission |
|---|---|---|
| Γιώργος | 12/12 | 6.4s |
| Δημήτρης | 12/12 | 6.9s |
| Νίκος | 12/12 | 7.2s |
| Ελένη | 7/12 | never reached 12 |
| Μαρία | 7/12 | never reached 12 |

`endBlitz` entered at **30.0s with `remainingMs=0`** → timer expiry, not an
early end. Results broadcast at 30.0s. **Gap from the last 12/12 to results =
22.8s.** Run B: all five finishers done by 7.2s, same `remainingMs=0` at 30.0s,
same **22.8s** gap. No `early-end-fires` line in either run.

Code path holding the stage open: the timer armed in `startBlitzSegment`
(`armBlitzTimer(room, 'BLITZ', BLITZ_DURATION_MS, () => endBlitz(room.code))`,
server/src/modes/blitz.ts:116) running to full expiry.

## Criterion 2 — countdown honesty

**Verdict: CLIENT-SIDE. The server clock is honest; the TV renders it wrong.**

Run B (wall seconds from phase start):

| wall_s | server remainingMs | server s | TV committed s |
|---|---|---|---|
| 0.0 | 29519 | 30 | 30 |
| 2.0 | 27519 | 28 | 30 |
| 4.0 | 25518 | 26 | 30 |
| 6.0 | 23518 | 24 | 30 |
| 8.0 | 21516 | 22 | 29 |
| 12.0 | 17512 | 18 | 25 |
| 20.0 | 9504 | 10 | 17 |
| 29.0 | 497 | 1 | 8 |

The server decrements exactly 1000ms per second, start to finish. The TV held
**30 for the first 7.7s**, then ticked normally — permanently **7 seconds
behind**: the stage ended while the TV still displayed 8.

Run A is worse and non-monotonic: the TV re-committed **30** at wall 11.0, 15.0,
19.0, 22.0, 24.0, 27.0 and 28.0s (server: 19, 15, 11, 8, 6, 3, 2) and never got
below 26. The displayed number repeatedly went *backwards* (27→30→29→28→30…).

Code path responsible — both effects key on the `blitz` payload OBJECT:
- HostScreen.tsx:1559-1565 resets `blitzSecondsLeft` to
  `Math.ceil(blitz.durationMs / 1000)` whenever that object changes;
- HostScreen.tsx:1567-1575 tears down and re-arms the 1s interval on the same
  dependency, so a tick never completes while swipes arrive faster than 1/s.

and Task 224's `handleBlitzProgress` (HostScreen.tsx:881-883) creates a **new**
object on **every accepted swipe** — `{ ...current, progressByPlayerId }` —
carrying the stale `durationMs`, frozen at phase entry (30000). 60 swipes in run
A = 60 resets to 30. Nothing server-side changes; no per-swipe `durationMs` is
ever sent.

## Criterion 3 — where an early end hooks in, and who consumes the stage end

The hook already exists: `submitBlitzSwipe`, guard
`if (allConnectedPlayersFinished(room, state))` → `endBlitz(room.code)`
(server/src/modes/blitz.ts:225-227; predicate at :194-201). 234b does not need a
new hook — it needs a different *predicate*. `allConnectedPlayersFinished`
requires EVERY connected player at K, so a single unfinished player makes it
unreachable. In a bot game it is unreachable by construction: slow bots swipe
every 3000-4500ms (`profileDelayMs`, server/src/bots.ts:134), i.e. ~36-54s for
12 swipes inside a 30s window. Second entry to the same guard:
`recheckBlitzPhaseOnDisconnect` (:233-240), called from index.ts:1782.

Consumers of the stage end — the phase-machine map for 234b:
1. the `BLITZ` timer callback, modes/blitz.ts:116 (expiry — today's only path)
2. `BLITZ_CONTINUATIONS.BLITZ` (:381), the pause/resume table — also merged into
   full's `FULL_CONTINUATIONS` via `mergeContinuations([...])` (full.ts:121-127),
   so a paused blitz resumes through this same entry in both modes
3. `submitBlitzSwipe`'s early-end branch (:226)
4. `recheckBlitzPhaseOnDisconnect` (:239)

Downstream, unchanged by whoever calls it: `clearActiveTimer` → scores **every
player in `room.players`** (not just swipers) → freezes `state.lastReveal` →
phase `BLITZ_REVEAL` → `PHASE_CHANGED` → crowd mood cheer/boo →
`broadcastBlitzReveal` → 8000ms reveal timer → `endBlitzReveal` → `finishGame` →
`modeForRoom(room).advanceAfterSegment?.(room)` (full's stage 2→3 hook) or
`GAME_OVER` + `cleanupRoomBots` standalone. Client side: `handleBlitzShow` /
`handleBlitzProgress` / `handleBlitzRevealShow` (HostScreen.tsx:858-883),
ControllerScreen's blitz branch, and the `state:sync` BLITZ/BLITZ_REVEAL
branches (index.ts:402-408 players, 546-552 host).

## Criterion 4 — inverse: a stage whose countdown DOES track wall clock

Plain `QUESTION`, stage 1 Η Αγορά, **same run A game**:

| wall_s | server remainingMs | server s | TV committed s |
|---|---|---|---|
| 0.0 | 19869 | 20 | 20 |
| 1.0 | 18869 | 19 | 19 |
| 2.0 | 17868 | 18 | 18 |
| 3.0 | 16868 | 17 | 17 |
| 18.0 | 19344 | 20 | 20 |
| 19.0 | 18343 | 19 | 19 |
| 20.0 | 17343 | 18 | 18 |
| 21.0 | 16343 | 17 | 17 |

Zero divergence on every sample, across all five questions (rows 36-38s, 49-52s,
67-70s are questions 3-5, identical).

What its path does differently: the tick at HostScreen.tsx:1356-1370 depends on
`[phase, question?.questionIndex, paused]` — a **scalar that is constant for the
whole question** — not on the payload object, and no progress event ever
rewrites the `question` object. The comment at :1396-1399 states the rule
outright: *"no progress tick ever lands in this screen's state now, so a player
locking in cannot rewind the clock."* Per-player progress is held in separate
state (e.g. `agoraQuestionAnsweredIds`, :294), never merged into the payload.
Blitz merges it in — that is the entire difference. (The table also shows
QUESTION advancing early on completion at ~3s, the completion-based end blitz
lacks.)

## Question C — intended duration and the gap

Intended: `BLITZ_DURATION_MS` 30000 + `BLITZ_REVEAL_DURATION_MS` 8000 = **38s**.
The gap between the last submission and results is simply the unconsumed
remainder of the fixed 30s window (22.8s in both runs; the playtest's ~12s is
the same phenomenon with bots that happened to finish later). Nothing pauses,
gates on audio, or extends the phase — `remainingMs` fell monotonically at real
time in every sample.

## Temporary instrumentation — REMOVE BEFORE 234b

Uncommitted, left in the working tree deliberately:
1. `server/src/modes/blitz.ts` — `DIAG`/`diag()` helper + 5 log sites
   (`blitz-start`, `swipe`, `early-end-fires`, `endBlitz-entered`,
   `reveal-broadcast`). All gated on `BLITZ_DIAG=1`.
2. `server/src/index.ts` — `import { __diagRooms }` + the 1s server-timer ticker
   block immediately above `const PORT = …`.
3. `server/src/state.ts` — the `__diagRooms()` accessor.
4. `client/src/screens/HostScreen.tsx` — `useLayoutEffect` added to the React
   import, and the `[TV]` commit logger just after `const timer = …`.
5. `dev/blitz-timing-check.ts` — untracked harness (delete or keep as 234b's
   acceptance harness).

`npm run typecheck` passes with all of it in place.

## Findings outside scope — documented, not fixed

- Slow bots **cannot** finish 12 statements in 30s (bots.ts:134 vs
  `BLITZ_DURATION_MS`), so a completion-based early end will still seldom fire
  in bot runs — worth deciding in 234b whether the predicate should count only
  players who *can* still swipe.
- `endBlitz` scores every entry in `room.players`, including disconnected ones.
- A pre-existing dev server (PID 57719, `/root/Aegean-/server`, port 4001) was
  running throughout; not started by this task, not touched. Production
  (`/opt/party-game`, port 3001) was never contacted.
