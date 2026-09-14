# Task 253 — Η Παλαίστρα: a second round

HEAD at start: `451167a` (Task 250: remove the in-game leader wreath), tree clean.

One constant drives the change: `BLITZ_ROUND_COUNT = 2` (shared/src/index.ts).
No new phase, no new timer, no new voice line, no second stage card.

## Diagnosis (before any change)

**How the stage was sequenced.** `full`'s stage 2 row is a `blitz` segment.
`enterStage(room, 2)` → `enterStageAnnounce` (the card, `STAGE_ANNOUNCE`,
3500ms, and the `recordStageStart` entry Task 239 reads) → `endStageAnnounce`
→ `resumeAfterStageAnnounce` → the `STAGE_INTRO` beat from
`STAGE_INTRO_LINES['blitz']` → `beginStageOrRound` → full's `beginStage` hook
→ `startBlitzSegment`. From there the mechanic is entirely modes/blitz.ts:
`BLITZ` (30s, or early once every connected player has swiped all 12) →
`endBlitz` → `BLITZ_REVEAL` (8s) → `endBlitzReveal` → `finishGame` →
`advanceAfterSegment` → stage 3.

**Where the single round was bounded.** Exactly one place:
`endBlitzReveal` called `finishGame` unconditionally. The statements were a
single `drawBlitzGameStatements(12)` at `prepareGame`. So "one round" was not
a count anywhere — it was the absence of a branch.

**What a second round must NOT re-trigger.** The stage card and its intro line
both hang off `enterStageAnnounce`/`resumeAfterStageAnnounce`, which are
reached only when `room.stage` CHANGES. A second round therefore must not go
near them: `startNextBlitzRound` leaves `room.stage` alone and re-enters the
`BLITZ` phase directly, so the card and the Socrates beat remain one-per-stage
structurally, not by a flag anyone has to remember.

**Between rounds — the decision.** A silent cut (reveal ends, swipe cards
simply reappear) reads as a freeze, and a second stage card would wrongly
announce a stage that never ended. The in-house precedent is draw's
`advanceToNextCycleOrGameOver`, which starts its next cycle through a small
beat rather than a fresh announcement. I reused the beat the stage ALREADY
has: **the `BLITZ_REVEAL` between the two rounds is itself the transition.**
It already holds the screen for 8s with its own progress bar, so it costs no
new phase, timer or voice line; it now carries `hasNextRound` and says
"Ακολουθεί ο γύρος 2 από 2" on both TV and phone, and both screens show a
"Γύρος N από M" indicator. The stage's LAST reveal is unchanged and ends the
stage exactly as before.

**Repeats.** `drawBlitzGameRounds` (server/src/blitz.ts, pure) draws each
round from the pool MINUS everything already dealt, so no statement repeats
within a game and each round still keeps `drawBlitzGameStatements`' own
ceil/floor true-false balance (a single 24-wide slice would not).

## Acceptance criteria — observed from running games

Harness: `dev/253-blitz-rounds-check.ts` (real server in-process on a
throwaway port, real sockets; scenario B adds a real TV in a real browser).
Scenario A runs unchanged against pre-253 code, which is what makes the
before/after timing comparison apples-to-apples. Zero `page.screenshot` calls.

**1. Diagnosis** — above, including the between-rounds decision.

**2. Two rounds run, zero repeats.** 5-bot `mode=full`: 2 swipe windows, 12
statements each, 24 total, 24 distinct hashes, 0 repeated.
Round 1: `09dc5833 bffb723b a1b318e7 a9256b95 f08d0c04 96a1dbf8 b7a6b8ea
e77a964f 88f6a429 5119fab7 d3d92df1 41ecb1ee`
Round 2: `b466865c c690f5a9 c7355f56 a9e58c19 69fb0704 a2b32236 b9ded69a
d858aaa4 a3de0476 af8287e0 8ad1c214 693ab322`
(sha1 of the statement text, first 8 hex; the pool carries no ids.)

**3. Stage timing**, `Room.stageTimings` via `GameOverPayload.stageDurations`,
5-bot `mode=full`, same harness both sides:

| stage | before | after |
|---|---|---|
| 1 Η Αγορά | 55.2s | 53.3s |
| **2 Η Παλαίστρα** | **41.5s** | **79.5s** |
| 3 Ζωγραφική | 184.2s | 183.6s |
| 4 Εκτίμηση | 40.3s | 39.2s |
| 5 Η Λήθη | 46.5s | 45.7s |
| 6 Η Συκοφαντία | 74.6s | 76.5s |
| 7 Η Ανάβαση | 63.3s | 53.6s |
| whole show | 505.5s | 531.4s |

Η Παλαίστρα 41.5s → 79.5s (+38.0s: one more 30s window plus its 8s reveal).
Its share of the night 8.2% → 15.0%. The 41.5s baseline reproduces
tasks/214-report.md's own 41.5s exactly. Every other stage moved by less than
2s except the climb, which ignores gameLength and varies run to run.

**4. Inverse — card and intro line play once.** Across the whole stage:
`STAGE_ANNOUNCE` renders titled Η Παλαίστρα = **1** (stage=2,
"Γύρος 2 — Η Παλαίστρα"); Socrates `STAGE_INTRO` beats inside the stage
window = **1** ("Στην Παλαίστρα δεν συζητούσαν. Πάλευαν…"). Expected 1/1,
observed 1/1. (7 stage cards in the game overall, one per stage.)

**5. Pause/resume, round 2 and the transition.** Real TV, pause from a real
player socket, 3000ms hold:

| probe | server at pause | after 3000ms hold | at resume | TV |
|---|---|---|---|---|
| between-rounds (BLITZ_REVEAL) | 6493ms | 6493ms (**0ms elapsed**) | 6192ms | bar 87.5% (7.00s) throughout |
| round 2 (BLITZ) | 21994ms | 21994ms (**0ms elapsed**) | 21694ms | 23s → **22s** on resume |

Phase held across both holds; the timer ran on after each resume (301ms /
300ms across a ~300ms settle). Round 2's TV corrected 23s → 22s on resume,
matching the server's 21994ms (ceil 22s) — Task 246's `handleGameResumed`
branch doing its job. The reveal bar is integer-second quantised (ceil(6.49)
= 7s = 87.5%), so it is in step, not stale.

Note on method: the first run of this probe read `remaining` BEFORE emitting
the pause and so counted the socket round trip (~44ms / ~21ms of still-running
timer) as drift, printing a false "frozen: NO". Corrected to pause first and
sample after it lands — CLAUDE.md's own warning about real-clock pause checks.

## Scope / discoveries not fixed

- Standalone `blitz` runs 2 rounds too (same constant): it is the dev harness
  for this stage, and splitting them would test something the show never plays.
- The blitz `STAGE_INTRO` pool says "δώδεκα πράγματα" — true of each window,
  not of the stage's 24. Documented, not fixed: no voice line may be touched.
- bots.ts's "blitz:show broadcasts once per game" comment was stale; corrected
  to "once per ROUND". Behaviour needed no change (the handler is per-event, and
  the previous round's chain has already stopped at `nextIndex >= total`).
- Scoring, names, the audio backstop and every other stage are untouched.

Typecheck: clean across shared/server/client.
