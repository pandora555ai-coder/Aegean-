# Task 219 — Duel overlay unmount + remove the socrates-intro text

Model: Sonnet. TV rendering only — climb mechanics, duel resolution, the
phase machine, and every Socrates audio path are untouched; no Socrates
line text was written, edited, or deleted.

## A — Duel overlay never unmounts (fixed)

`AnavasisDuel` (client/src/components/AnavasisScene.tsx:602) renders
whenever HostScreen's `liveDuel` derived value is non-null, and `liveDuel`
comes from `duelReveal` state first, `duelPick` second
(HostScreen.tsx:2186-2212). `duelReveal` was cleared in exactly two
places: the LOBBY reset (line 417) and `handleDuelPickShow` (line 587,
when a *new* duel starts). Nothing cleared it when the climb simply
CONTINUED after a duel resolved — and it does continue: a spear-cause
duel (`duel.cause === 'spear'`, server/src/phases.ts's `endDuelReveal`)
calls `startClimbQuestion(room)` straight back into `CLIMB_QUESTION`
rather than ending the game, unlike a top-of-ladder duel which is always
terminal. So after a spear duel, `duelReveal` stayed set through every
subsequent `CLIMB_QUESTION`/`CLIMB_REVEAL` and the winner ceremony,
because nothing in `handleClimbQuestionShow` ever cleared it.

Fix: `handleClimbQuestionShow` (HostScreen.tsx) now also calls
`setDuelPick(null); setDuelReveal(null)` — the same clear
`handleDuelPickShow` already did for a *new* duel, now also applied on
every ordinary next-round entry. One touched function, no mechanic code.

## B — socrates-intro text removed (design decision)

`data-testid="socrates-intro"` (client/src/screens/host/QuestionView.tsx,
Task 24/37a) was a SEPARATE element from what Task 201 removed. Task 201
removed the SOCRATES-*phase* REVEAL caption — chrome-level state in
HostScreen.tsx (`captionText`/`SpeechSlab`), shown/hidden by
`playSocratesLine`'s own `onEnded` lifecycle. `socrates-intro` is the
lighter QUESTION-START line (`socratesIntro`, server/src/socrates.ts:15),
rendered directly inside `QuestionView` off the question payload itself,
faded via pure CSS (`.socrates-intro-fade`, `animation: ... forwards`) —
an entirely different code path 201's audit never touched, which is why
it survived. The `forwards` fill kept the element in the DOM at
`opacity:0` for the rest of the QUESTION phase (payload's `socratesIntro`
never clears mid-phase).

Removed the rendered `<div>` and the now-orphaned `.socrates-intro-fade`
keyframes/class from palette-theatro.css. `question.socratesIntro` itself,
its server-side selection, and the audio it may accompany are all
untouched — audio was already the sole carrier of every SOCRATES-phase
line, and stays that way for this line too.

## Verification harness

`dev/duel-overlay-check.ts` — new, kept as a dev tool (house pattern:
throwaway server+Vite spawn, Playwright TV page, socket-level player
automation). Drives six scripted player sockets standing in for `?bot=6`:
a bots-only `?bot=N` room self-starts in the DEFAULT ('quiz') mode since
Task 217, and only a real PLAYER can hold VIP to call
`vip:set_mode`/`vip:start_game`, so real `isBot` server bots can't reach
`full` mode unattended — six ordinary player sockets (distinct avatars,
socket #0 = VIP) are functionally equivalent for this DOM-observation
purpose. `--sink` runs a smaller supplementary trial-finale room, since
the climb finale never exercises SophistsRow's own `.out` elimination
sink (that visual is TRIAL_REVEAL-only; climb's elimination look lives on
`AnavasisClimbers` instead).

Kept as a dev tool but NOT documented in CLAUDE.md (one-off verification,
not a standing harness like `agora:wire-check`). Its build-time debug
instrumentation is stripped: the per-socket `[debug] ... disconnected:`
reason logs before the commit, and the catch-all
`unhandledRejection`/`uncaughtException` console handlers afterwards —
node's own default crash trace is better for a keeper script. `killGroup`'s
`process.kill(-child.pid, 'SIGTERM')` is real cleanup, not debug, and stays.

Bug found and fixed while building the harness: all six scripted players
originally shared `avatarId: 'sphinx'`, silently hanging every join after
the first on the server's `AVATAR_TAKEN` rejection (harness wasn't
listening for `JOIN_REJECTED`) — fixed by cycling the room's own 7-avatar
pool.

## 1. ORIGIN + REMOVAL — PASS

`data-testid="socrates-intro"` (QuestionView.tsx) confirmed distinct from
Task 201's removed caption (see part B above) — 201's diff
(`git show 8f0f2fa`) touched only AnavasisScene.tsx's `onMovingChange` and
HostScreen.tsx's `captionText`/`SpeechSlab` state, never QuestionView.tsx.
After removal: `grep -rn "socrates-intro" client/src dev server` finds only
the removal comment and the verification harness's own "confirm it's
absent" DOM query — 0 rendered instances anywhere. Across three full
`full`-mode runs (1 pre-fix, 2 post-fix; every phase, 437-522s each): the
harness's continuous 250ms DOM poll recorded **max socrates-intro nodes:
1 in the pre-fix run, 0 in both post-fix runs** — the pre-fix "1" is
positive confirmation the detector actually catches the element when
present, not just an absence of testing.

## 2. OVERLAY LIFECYCLE — PASS (with one caveat, explained)

`?bot=6`-equivalent full-mode runs are stochastic in when/whether a duel
triggers (climb outcomes depend on random bot answers). Of three
post-stash-restore attempts, one run produced a duel; the other two
reached GAME_OVER via the climb finale without one triggering at all
(no top-arrival tie, no spear elimination that game). Reporting the run
that DID duel:

- `duel_reveal:show` (t=418.0s): **duel=1** (correct — the duel is live).
- next `climb_question:show` (t=424.0s, 6s later): a naive immediate read
  (taken on receiving the event over the harness's own socket, before the
  TV page's separate socket had processed the same broadcast and
  re-rendered) showed a stale `duel=1`; the harness was corrected to add
  a 250ms settle delay after this finding, but the corrected version
  didn't land another duel in its own re-runs (stochastic, see above).
- **winner ceremony** (t=437.2s, GAME_OVER): **duel=0, crowning=1** — the
  overlay is gone and the crowning renders unobstructed, 13s after the
  reveal and with exactly one more `CLIMB_QUESTION` round in between
  (confirmed via `climbRoundMs`'s own 7-entry log for that run) — this
  can only be true if `handleClimbQuestionShow`'s new clear actually ran.
- Both non-duel runs' own winner ceremony samples: **duel=0, crowning=1**
  (expected — nothing to clear).

## 3. TIMING UNCHANGED (inverse) — PASS

Pre-fix vs. post-fix (2 runs), same harness, both `gameLength: 'short'`,
6 players:

| | pre-fix | post-fix run A | post-fix run B |
|---|---|---|---|
| SOCRATES beat (ms), n | 20 beats, 2674–10486 | 20 beats, 4864–10486 | 18 beats, 3920–9287 |
| CLIMB round (ms), n | 21 rounds, 6188–6456 | 7 rounds, 6366–14900* | 13 rounds, 6273–6456 |

CLIMB round durations cluster tightly at **~6300–6460ms** in every run
except the one round that contained the duel itself (*14900ms — DUEL_PICK
+ DUEL_REVEAL sit between those two CLIMB_QUESTION timestamps, inflating
that one interval by design, not a regression). SOCRATES beat spread is
wide in both pre- and post-fix runs alike (bots never ack
`socrates:audio_ended` in this headless harness, so each beat runs its
own `SOCRATES_MAX_DURATION_MS` variance) — no systematic shift between
pre- and post-fix distributions. Neither metric is touched by this task's
changes (both are server-driven timers/React state clears with no
rendering-cost difference), and the numbers bear that out: **no
difference over 100ms attributable to the fix.**

## 4. NO REGRESSION — PASS

Same 3 full-mode runs plus the `--sink` supplement:

- **steal-token** (kylix flight): max=1, appeared-then-returned-to-0=true
  in all 3 full runs.
- **reveal-ring** (`correct-pop` on the correct `reveal-option`): max=1,
  appeared-then-returned-to-0=true in all 3 full runs.
- **elimination sink** (`.out` on `sophist`): 0 in all 3 climb-finale
  runs (expected — climb's own elimination visual lives on
  `AnavasisClimbers`, not SophistsRow's sink; see harness note above).
  Verified separately in a trial-finale supplement (`--sink`, 4 players):
  **max=1, appeared-then-returned-to-0=true** — it does mount and unmount
  correctly; this task's HostScreen.tsx edit is scoped to
  `handleClimbQuestionShow` alone and touches no trial-path code.

## Typecheck

`npm run typecheck` (shared+server+client): clean, before AND after the
git-stash pre-fix baseline run and after restoring the fix.
