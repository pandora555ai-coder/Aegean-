# Task 246 — pause/resume coverage for every timed phase

Client-only fix (`client/src/screens/HostScreen.tsx`, three branches in
`handleGameResumed`), plus a new acceptance harness
(`dev/pause-resume-check.ts`) and a name repair to three EXISTING harnesses
that were already dead at HEAD (see "Pre-existing breakage" below).
`server/` and `shared/` are byte-identical to 5341f5e.

## Diagnosis — every phase that runs a client-side timer or countdown

Read off the running system, not code alone: the "without a fix" column is
what a real pause/resume actually did on a real TV before the fix landed
(`ONLY=BCD` / `ONLY=A`, baseline run).

The TV's countdown reaches the DOM in exactly two shapes: ring phases put
integer seconds in Krater's `data-testid="countdown"`; the reveal phases
carry theirs as the inline width of their own progress-bar fill. Anything
else renders **no countdown at all** — that is a design decision (Task 192),
not an oversight, and it is why three phases below can have no branch.

| phase | timer / effect | branch in handleGameResumed? | behaviour on resume WITHOUT the fix |
|---|---|---|---|
| STAGE_ANNOUNCE | server STAGE_ANNOUNCE 3500ms; no client countdown | no — none possible | correct. No countdown rendered (`absent`); advanced 2651ms after resume vs 2647ms left |
| POWER_UP | ring, `powerUpSecondsLeft` | **yes** | correct. TV 8s, server 7468ms (ceil 8s) — already in step |
| QUESTION | ring, `secondsLeft` (ref-backed) | **yes** | correct. TV 8s → **7s** on resume, matching server 6959ms |
| REVEAL | bar, `revealSecondsLeft` | **yes** | correct. Bar 0% at pause → **83.33% (5.00s)** on resume, matching server 4484ms |
| STEAL | ring, `stealSecondsLeft` | **yes** | see matrix |
| SOCRATES | server backstop (per-beat); `socratesSecondsLeft` is set but NEVER rendered | **yes** (writes dead state) | correct. No countdown rendered; beat ended on the real audio ack at 7028ms, well inside its 10021ms backstop |
| DRAW / GUESS / GUESS_REVEAL | ring / ring / bar | **yes** | see matrix |
| NUMERIC_QUESTION | ring | **yes** | correct. TV 17s → **16s**, matching server 15943ms |
| NUMERIC_REVEAL | bar | **yes** | correct. Bar 87.5% (7.00s), server 6495ms |
| TRIAL_QUESTION | ring | **yes** | correct. TV 18s → **17s**, matching server 16976ms |
| TRIAL_REVEAL | bar | **yes** | correct. Bar 83.33%, server 4493ms |
| BLITZ | ring, ref-backed (Task 234b) | **yes** | correct. TV 26s, server 25949ms |
| **BLITZ_REVEAL** | bar, `blitzRevealSecondsLeft` | **NO** | timer fine, display uncorrected. Bar 87.5% (7.00s) vs server 6498ms — in step at this sample, but nothing guarantees it |
| **CLIMB_QUESTION** | ring, `climbQuestionSecondsLeft` | **NO** | **timer fine, display left STALE: TV 19s against a server holding 17966ms (ceil 18s), and it stayed 19s for the rest of the phase** |
| CLIMB_REVEAL | server 6000ms; movement beat/glide in AnavasisScene | no — none possible | correct. No countdown rendered (`absent`, Task 192); advanced 4799ms after resume vs 4783ms left |
| **DUEL_PICK** | ring, `duelPickSecondsLeft` | **NO** | **timer fine, display left STALE: TV 18s against a server holding 16970ms (ceil 17s)** |
| DUEL_REVEAL | server 6000ms; no client countdown | no — none possible | correct. `absent`; advanced 4506ms after resume vs 4486ms left |
| AGORA_EXPOSE / AGORA_QUESTION / AGORA_REVEAL | ring / ring / bar | **yes** | see matrix |

### The suspected bug is NOT what was happening

"A pause during the finale may resume with a dead timer" is **false**, and was
worth measuring rather than assuming:

- the SERVER resumes fine — `continuationForActiveTimer` looks the kind up in
  the mode's continuations table, and quiz's table has had
  `CLIMB_QUESTION`/`CLIMB_REVEAL`/`DUEL_PICK`/`DUEL_LOCKED`/`DUEL_REVEAL`
  entries since Task 188a/b;
- the CLIENT tick resumes fine — every countdown effect keys on `paused`, so
  it is torn down at pause and re-armed when the flag flips back;
- every baseline row advanced on time: CLIMB_QUESTION 17984ms after resume
  against 17966ms left, CLIMB_REVEAL 4799 vs 4783, DUEL_REVEAL 4506 vs 4486,
  BLITZ 25951 vs 25949, BLITZ_REVEAL 6516 vs 6498.

The real defect is narrower: no **authoritative correction** of the displayed
value, so any drift the local 1s tick had accumulated survived the resume
instead of being snapped back to the server's truth.

Also refuted: "all CLIMB\* and all DUEL\*". CLIMB_REVEAL and DUEL_REVEAL have
no countdown state and render none — a branch there would have nothing to
set. Three branches were missing, not five.

## The fix

`handleGameResumed` gains `BLITZ_REVEAL`, `CLIMB_QUESTION` and `DUEL_PICK`,
mirroring Task 234b's BLITZ branch and keyed on `phaseRef.current` — a
primitive, never a payload object (the 234 bug class). Nothing else changed:
the three payload objects behind those phases are each emitted from exactly
ONE site, inside their own phase-entry function, so unlike blitz's
per-swipe `handleBlitzProgress` none of them is rewritten mid-phase and their
tick effects did not need re-keying.

## Criterion — resume matrix, observed from running games

Every row: pause mid-phase, hold >= 3s, resume. "TV" is the TV's OWN displayed
countdown (Krater's ring node, or the reveal bar's fill width converted back to
seconds); `absent` means the phase renders no countdown at all. The last column
is the observed completion — how long after the resume the phase actually
advanced, against what the server said was left. Post-fix unless noted.

| phase | at pause (server / TV) | at resume (server / TV) | continued & completed? |
|---|---|---|---|
| STAGE_ANNOUNCE | 2647ms / absent | 2647ms / absent | → SOCRATES 2651ms after resume (+4ms) |
| QUESTION | 6959ms / 8s | 6959ms / **7s** | → REVEAL 6976ms (+17ms) |
| REVEAL | 4484ms / bar 0% | 4484ms / **bar 83.33% (5.00s)** | → SOCRATES 4497ms (+13ms) |
| SOCRATES | 10021ms / absent | 10021ms / absent | → QUESTION 7028ms — ended EARLY on the real audio ack, inside its own backstop |
| POWER_UP | 7468ms / 8s | 7468ms / 8s | → QUESTION 7485ms (+17ms) |
| STEAL (picking beat) | 7847ms / 8s | 7847ms / 8s | picking timer expired on schedule at 7847ms, then the SEPARATE 4000ms STEAL_ANNOUNCE beat ran under the same phase name → SOCRATES 11857ms (7847 + 4000 + 10ms) |
| STEAL (announce beat) | 2784ms / absent | 2784ms / absent | → SOCRATES 2807ms (+23ms) |
| DRAW | 70952ms / 72s | 70951ms / **71s** | → GUESS 70980ms (+29ms) |
| GUESS | 16967ms / 18s | 16967ms / **17s** | → GUESS_REVEAL 16985ms (+18ms) |
| GUESS_REVEAL | 6482ms / bar 87.5% (7.00s) | 6482ms / bar 87.5% | → SOCRATES 6499ms (+17ms) |
| NUMERIC_QUESTION † | 15944ms / 17s | 15943ms / **16s** | → NUMERIC_REVEAL 15950ms (+7ms) |
| NUMERIC_REVEAL † | 6495ms / bar 87.5% (7.00s) | 6495ms / bar 87.5% | → SOCRATES 6498ms (+3ms) |
| TRIAL_QUESTION | 16982ms / 18s | 16982ms / **17s** | → TRIAL_REVEAL 16986ms (+4ms) |
| TRIAL_REVEAL | 4498ms / bar 83.33% (5.00s) | 4498ms / bar 83.33% | → TRIAL_QUESTION 4504ms (+6ms) |
| BLITZ | 25950ms / 26s | 25950ms / 26s | → BLITZ_REVEAL 25970ms (+20ms) |
| **BLITZ_REVEAL** | 6480ms / bar 87.5% (7.00s) | 6480ms / bar 87.5% | → GAME_OVER 6500ms (+20ms) |
| **CLIMB_QUESTION** | 17970ms / 19s | 17969ms / **18s** | → CLIMB_REVEAL 17987ms (+17ms) |
| CLIMB_REVEAL | 4783ms / absent | 4783ms / absent | → CLIMB_QUESTION 4792ms (+9ms) |
| **DUEL_PICK** | 16975ms / 17s | 16975ms / 17s | → DUEL_REVEAL 4774ms — EARLY: both duelists locked in, not a timer expiry |
| DUEL_REVEAL | 4481ms / absent | 4481ms / absent | → SOCRATES 4488ms (+7ms) |
| AGORA_EXPOSE | 8947ms / 10s | 8947ms / **9s** | → AGORA_QUESTION 8973ms (+26ms) |
| AGORA_QUESTION | 16969ms / 18s | 16968ms / **17s** | → AGORA_REVEAL 16979ms (+11ms) |
| AGORA_REVEAL | 5096ms / bar 100% (6.00s) | 5096ms / bar 100% | → SOCRATES 5122ms (+26ms) |

† NUMERIC's two rows are from the PRE-fix smoke run. Numeric's branch predates
this task (it is a control), and the fix only ADDS three branches, so those two
rows cannot have been changed by it — they are reported as measured rather than
re-run.

Bold = the three phases this task fixed. Every phase resumed and completed, and
measured against ITS OWN beat the worst overshoot in the table is +29ms on a
71-second DRAW timer. STEAL is the one row where "advanced to" is not that beat's
own remainder: `STEAL` is a single PHASE covering two consecutive timer kinds
(STEAL then STEAL_ANNOUNCE), so the phase only changes once both have run — its
picking timer itself was +10ms.

The pause holds gameplay, not just clocks: a `player:steal_choose` sent during
the STEAL pause was refused outright (`rejected ... : game is paused`). The
displayed value was snapped back to the server's truth wherever it had drifted
(QUESTION 8→7, DRAW 72→71, AGORA_EXPOSE 10→9, CLIMB_QUESTION 19→18, and
REVEAL's bar from a stuck 0% to 83.33%).

**DUEL_PICK and BLITZ_REVEAL are honest non-events**: the branch now fires for
both, but at these samples the displayed value already agreed with the server
(16975ms → ceil 17s; 6480ms → ceil 7s), so there was no visible change to
observe. The correction is guaranteed now; it was not before. The pre-fix
baseline is where the defect is visible — DUEL_PICK showed 18s against a
server holding 16970ms (ceil 17s), and CLIMB_QUESTION 19s against 17966ms.

## Criterion — the inverse: pause actually freezes

Two samples per phase, taken 600ms and 3200ms after the pause landed (2.6s
apart, and the pause is >= 3s in every case). In EVERY row both samples are
bit-identical, on the server AND on the TV, and `room.phase` was re-read at
both samples and had not moved.

| phase | sample 1 (server / TV) | sample 2, +2.6s (server / TV) |
|---|---|---|
| STAGE_ANNOUNCE | 2647ms / absent | 2647ms / absent |
| QUESTION | 6959ms / 8s | 6959ms / 8s |
| REVEAL | 4484ms / bar 0% | 4484ms / bar 0% |
| SOCRATES | 10021ms / absent | 10021ms / absent |
| POWER_UP | 7468ms / 8s | 7468ms / 8s |
| STEAL (picking beat) | 7847ms / 8s | 7847ms / 8s |
| STEAL (announce beat) | 2784ms / absent | 2784ms / absent |
| DRAW | 70952ms / 72s | 70952ms / 72s |
| GUESS | 16967ms / 18s | 16967ms / 18s |
| GUESS_REVEAL | 6482ms / bar 87.5% | 6482ms / bar 87.5% |
| NUMERIC_QUESTION | 15944ms / 17s | 15944ms / 17s |
| NUMERIC_REVEAL | 6495ms / bar 87.5% | 6495ms / bar 87.5% |
| TRIAL_QUESTION | 16982ms / 18s | 16982ms / 18s |
| TRIAL_REVEAL | 4498ms / bar 83.33% | 4498ms / bar 83.33% |
| BLITZ | 25950ms / 26s | 25950ms / 26s |
| BLITZ_REVEAL | 6480ms / bar 87.5% | 6480ms / bar 87.5% |
| CLIMB_QUESTION | 17970ms / 19s | 17970ms / 19s |
| CLIMB_REVEAL | 4783ms / absent | 4783ms / absent |
| DUEL_PICK | 16975ms / 17s | 16975ms / 17s |
| DUEL_REVEAL | 4481ms / absent | 4481ms / absent |
| AGORA_EXPOSE | 8947ms / 10s | 8947ms / 10s |
| AGORA_QUESTION | 16969ms / 18s | 16969ms / 18s |
| AGORA_REVEAL | 5096ms / bar 100% | 5096ms / bar 100% |

Zero drift anywhere, and no phase advanced during any pause window. AGORA_REVEAL
is the interesting one: its bar is only rendered during the 1800ms 'grid' beat,
and that beat's own grid→proof timeout is pause-aware, so the bar was still
there to read 3.2s into the pause.

## Criterion — regression: the three climb suites stay green

| suite | command | result |
|---|---|---|
| staging | `npm run climb:staging-check` | **35 passed, 0 failed** |
| ceremony | `npm run climb:ceremony-check` | **94 passed, 0 failed** |
| lane | `npm run climb:lane-check` | **22 passed, 0 failed** |

All three run post-fix. `?clock=off` is supplied by ceremony-check itself —
its own `newRoom` navigates to `/host?clock=off` (Task 243), so the criterion
is met by the harness rather than by a flag passed in.

Read that 35/94/22 against the caveat below: at HEAD (5341f5e) all three scored
**nothing at all**. They did not fail checks — they died on their first sim join
with `INVALID_NAME` before a single check ran. These are the first real readings
of these suites since Task 241/245 landed.

## Pre-existing breakage found and repaired (NOT caused by this task)

Task 241/245 made player names preset-only (`isValidPlayerName` = strict
membership in `PRESET_NAMES`) without updating the harnesses that hardcode
`Άλφα/Βήτα/Γάμα/Δέλτα/Έψιλον/Ζήτα` — none of which is a preset name. Every
such harness now dies on its FIRST sim join with
`{"reason":"INVALID_NAME"}`, before running a single check.

**All three climb suites this task must report were already red at HEAD.**
Repairing them was the only way to evaluate the regression criterion, so
`climb-ceremony-check.ts`, `climb-lane-check.ts` and `finale-staging-check.ts`
get new `NAMES` constants (`Άρης/Νίκη/Χαρά/Τάκης/Γιώργος/Ζωή`, lengths
4/4/4/5/7/3 against the originals' 4/4/4/5/7/4, so nothing geometric shifts —
lane-check measures lane width, hence the long slot stays long). **Name
constants only**; no check, threshold or scenario was touched.

Still broken, documented not fixed (outside this task's scope): 
`dev/climb-entry-check.ts`, `dev/socrates-pacing-check.ts`,
`dev/end-state-timer-subtitles-check.ts`,
`dev/podium-subtitle-followup-check.ts`, `dev/242-subtitle-check.ts`.

## Other discoveries — documented, not fixed

- `socratesSecondsLeft` (HostScreen:264) is written by three call sites and
  **read by none** — SOCRATES renders no countdown. Dead state, and the
  branch that maintains it is a no-op.
- `GameClock` (Task 239) ticks straight through a pause: it counts wall clock
  off `gameStartedAt`, so pause time is included in elapsed game time.
- `AnavasisScene`'s `useClimbMovement` beat/glide timers key on `[revealKey]`
  only, with no `paused` — a pause mid-glide does not freeze the movement.
  Cosmetic; the phase timer underneath freezes correctly.
- REVEAL's progress bar read **0%** at the moment of pause (see matrix), i.e.
  `revealSecondsLeft` was still 0 a second and a half into the phase. The
  resume branch corrected it to 5.00s. Worth a look on its own.

## Harness

`dev/pause-resume-check.ts` — in-process real server (port 3950), real Vite
client (5951), real browser TV, real player sockets, real bots (bots.ts's own
50-70% accuracy). Chromium runs with
`--autoplay-policy=no-user-gesture-required`, without which every Socrates
beat rides its backstop instead of its own audio ack. Zero `page.screenshot`
calls. `ONLY=BCD` (or any subset) runs a scenario.

For each timed phase it waits for the phase, lets it run, pauses from a real
player socket, samples the server's `remainingActiveTimerMs` AND the TV's own
displayed countdown twice more than 2s apart, resumes, and then watches the
phase actually complete.
