# Task 237 — Η Ανάβασις finale staging: the temple, the leader, the duel

Three staging defects, all observed in real `?bot`-style games before being
touched, all fixed, all re-verified across **every** terminal path of the
climb. No climb rule, scoring, drain, cadence or spear behaviour changed:
`climb.ts`, `trial.ts`, `phases.ts` and every `CLIMB_*`/`DUEL_*` constant are
untouched. The one server change is a payload field the TV needed in order to
explain itself.

New harness: `npx tsx dev/finale-staging-check.ts` (`npm run climb:staging-check`),
built on `climb-ceremony-check.ts`'s infra — in-process real server on a
throwaway port (3915), throwaway Vite serving the real client (5916), real
sockets, real browser. Scene location is sampled every 50ms from two
independent signals: the Anavasis container's presence and Socrates' own
computed `left` (temple terrace = 57%, theatre orchestra = 5%).

## A — Socrates walked to the theatre and back for the WINNER beat

`endClimb` (phases.ts:2011) plays the winner's line through
`startSocratesBeat` → `enterSocratesBeat`, which sets `room.phase = 'SOCRATES'`.
That phase is not one of the four `isAnavasisPhase` names (HostScreen.tsx:2418),
so `showAnavasisWorld` was false for it and the whole world fell back to
`TheatreScene`; `showShell` went true, adding GameLayout's read column; and
`SocratesFigure`'s `poseFor` tested `RAISED_LEFT_PHASES` — which *contains*
`'SOCRATES'` — before its Anavasis branch, walking him down to `left:5%`.

This is the third member of the family Task 227 documented: 227 fixed only
`SophistsRow` for this exact phase (`forceHidden || isClimbFinale`), leaving the
scene, the shell and the pose behind.

**Measured, before:** 77 consecutive `theatre` samples of 263 across the beat —
~5.2s — with Socrates gliding `57 → 5 → 57 %`.

| moment | before | after |
| --- | --- | --- |
| top-out (CLIMB_REVEAL) | +0.55s, temple | +0.55s, temple |
| WINNER line (SOCRATES) | +6.54s, **theatre**, Socrates 57→5% | +6.55s, **temple**, Socrates 57% |
| ceremony (GAME_OVER) | +10.44s, temple, Socrates 5→57% | +10.90s, temple, Socrates 57% |

After: **0 theatre samples of 273**; the only transitions between top-out and
ceremony are the question slab unmounting (+0.60s) and the crowning appearing
(+10.95s). `left%` seen during the beat: `[57]`.

Fixed with one derived flag, `isClimbSocratesBeat = isClimbFinale && phase ===
'SOCRATES'` (HostScreen), fed into `showAnavasisWorld`, `showShell` and the
`AnavasisChrome` gate, plus the temple pose being tested *first* in
`poseFor` (SocratesFigure). `renderPhaseView`'s SOCRATES branch returns nothing
during the climb: `SocratesView` passes `{null}` children, so the beat carries
no TV text at all — the line is audio — and AnavasisChrome already supplies the
room code and pause overlay its GameLayout would have duplicated.

**Every terminal path funnels through `endClimb`**, so this one flag covers all
of them rather than one path each.

## B — the question card covered the leader near the top

`SLAB_WRAP_STYLE` (`top: '9%'`, `height: '42vh'`) put the slab's box at
y 97..367 on a 1280x720 TV. A climber's figure sits at
`bottom: (10 + 4.7·visualStep)cqh` with `visualStepFor(step, 10) =
round(step/10·12)`, which lands real steps 6-9 squarely inside that band. Task
198's `zIndex: 3` is what turned a collision into a defect: the slab paints
*over* the leader, so the player in front vanishes exactly as they near the
temple.

Measured overlap of the slab with each climber, per leader step:

| leader step | leader box | before | after |
| --- | --- | --- | --- |
| 6 | x 363..421, y 327..411 | 2320px² | **0px²** |
| 7 | x 375..433, y 293..377 | 4292px² | **0px²** |
| 8 | x 399..457, y 225..310 | 4930px² | **0px²** |
| 9 | x 411..469, y 192..276 | 4872px² | **0px²** |

Every other climber (steps 0-2) overlapped 0px² throughout — this only ever hit
the leader. Slab box is now y 39..173.

Fixed by raising and shortening the slab to `top: '1%'`, `height: '23vh'`.
Real step 9 is the highest a climber can stand *during a question* (reaching
CLIMB_TOP ends the climb in that same reveal, and a 3+-way arrival holds the
extras at TOP−1), and its figure box starts at y 192, so this clears the worst
case by 19px — at every player count, since `laneLeftPct`'s leftmost offset is a
constant −0.36 of the step width, independent of `n`. `left`/`width` are
deliberately unchanged: Socrates still passes behind the slab, which is Task
198's own accepted arrangement, not this bug.

## C — the duel did its job invisibly

`duel.cause` is decided at phases.ts:1677 (`nextAfterClimbRound` returning
`DUEL`: two arrivals in one reveal, or a shared highest step at the round cap
via `resolveClimbAtCap`), with a fallback at `startDuel` (1768) for the
standalone mode and the pool-exhaustion tie. It has existed since Task 205 —
**and never left the server.** `DuelPickShowHostPayload` carried duelists,
`pickedPlayerIds`, `tieCount`, timing and standings, but no reason, and
`AnavasisDuel` rendered only a scrim, two tablets, `Ξανά ×N` and a post-reveal
verdict.

**Measured, before:** the entire text content of the duel overlay was
`"ΑΛΦΑ | ΒΗΤΑ"` — two names, no explanation — while the stage card's tagline had
promised only *"Όποιος φτάσει πρώτος στην κορυφή, νικά"*. Two players stood at
the temple and the screen said nothing about why.

**Chosen: explain the duel on screen, not "declare immediately".** Declaring the
first arrival the winner would change *who wins* — the duel's weapon outcome
decides that today — which is a mechanic change, not staging, and this task is
staging only. It would also orphan a fully built feature (the weapon mechanic,
its TV art, its phone picker, its verdict lines, and its own standalone
`GameModeId`). The defect is genuinely that the TV never said why, so that is
what was fixed.

- `DuelCause` (shared) is now on `DuelPickShowHostPayload` and
  `DuelRevealHostPayload` (host-only, like `standings`), filled from
  `duel.cause` in both builders.
- `AnavasisDuel` renders a reason line above the tablets, clearing on reveal so
  the frame passes to the verdict:
  - `top` → **ΕΦΤΑΣΑΝ ΜΑΖΙ ΣΤΟΝ ΝΑΟ. Η ΜΟΝΟΜΑΧΙΑ ΚΡΙΝΕΙ.**
  - `spear` → **Η ΛΟΓΧΗ ΤΟΥΣ ΒΡΗΚΕ ΜΑΖΙ. Ο ΝΙΚΗΤΗΣ ΜΕΝΕΙ.**
  Both through `greekUpper`, `var(--marble-2)`, no new palette token.
- `CLIMB_STAGE_TAGLINE` now promises the tie too: *"Δέκα σκαλιά ως τον ναό.
  Όποιος φτάσει πρώτος, νικά — κι αν φτάσουν δύο μαζί, μονομαχούν."*

Observed timeline of one top-arrival duel, after: top-out +0.55s → DUEL_PICK
opens +6.55s → verdict +8.75s → WINNER line +14.75s → ceremony +21.10s, with
the reason line on screen for the whole pick window.

## Inverse — every terminal path re-verified

The duel/ceremony overlay has three historical wrong paths (Task 219's overlay
left mounted, Task 225's winner hidden, Task 227's two wreath leaks), so all
seven terminal paths were exercised, each reporting scene / overlay / wreath /
winner:

| path | how it ends | scene | duel overlay | wreath | winner |
| --- | --- | --- | --- | --- | --- |
| P1 single arrival at CLIMB_TOP | WINNER | temple (0/273 theatre) | gone | 1 ceremony, 0 row | correct |
| P2 two arrivals → duel (`cause: top`) | duel winner | temple (0/480) | gone | 1, 0 | correct |
| P3 round cap, unique highest | WINNER | temple (0/299) | gone | 1, 0 | correct |
| P4 round cap, shared highest → duel | duel winner | temple (0/440) | gone | 1, 0 | correct |
| P5 spear, three sequential strikes | last survivor | temple (0/926) | gone | 1, 0 | correct |
| P6 spear duel (`cause: spear`) | last survivor | temple (0/1109) | gone | 1, 0 | correct |
| P7 question pool exhausted | same cap resolver | temple (0/270) | gone | 1, 0 | correct |

`npm run climb:staging-check` — 35 checks, 0 failed (15 in scenarios 1-3, 20 in
scenario 4).
`npm run climb:ceremony-check` — **94 passed, 0 failed** (Task 225's suite,
unmodified assertions).
`npm run climb:lane-check` — 21 passed, 1 failed; see below.

## Found, not fixed

1. **`climb:ceremony-check` and `climb:lane-check` have been broken since Task
   236** — both call `startClimb` directly on a room that never started, so
   `room.gameIntroPlayed` is false and Task 236's ten-line
   `GAME_INTRO_SEQUENCE` fires at the climb's own `STAGE_ANNOUNCE`;
   `CLIMB_QUESTION` never arrives and both suites time out. CLAUDE.md's "94
   checks" regression suite was dead at HEAD. **Repaired here** (a seeded
   `gameIntroPlayed = true` before each `startClimb`, harness-only, no game
   code) because criterion 4 requires re-verifying the historical wreath and
   overlay paths against them.

2. **A fourth member of the A family, at the other end of the finale.** With
   the lane check revived, its wreath watcher immediately caught a visible
   `sophist-wreath` at row opacity 0.6 (the SOCRATES dim state) *during the
   climb's entry narration* — Task 236's three-line `ANAVASIS_INTRO_SEQUENCE`,
   which plays before any climb payload has arrived, so `isClimbFinale` is
   still false and the quiz's TheatreScene + wreathed SophistsRow render on the
   climb's own announcement. **Proven pre-existing**, not caused by this task:
   with all four client fixes stashed the same check fails identically
   (`@7240ms` reverted vs `@8366ms` with the fixes in). Not fixed here because
   it is not a terminal path and not a staging tweak — the client cannot tell
   "this announcement is the climb's" until a climb payload lands, so it needs a
   server-side signal, which is a larger change than this task's brief.

3. The standalone `duel` mode (modes/duel.ts) enters via `startDuel`'s fallback
   `cause: 'top'`, so its reason line reads "they reached the temple together"
   even though nobody climbed. Cosmetic, dev-harness mode only.
