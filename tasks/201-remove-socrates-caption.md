# 201 — Remove the Socrates caption + diagnose text/audio mismatch

TV client only.

## Diagnosis (before any removal)

**Audio plays the server-selected line: YES.** `buildSocratesPayload`
(server/src/payloads.ts:234-275) computes `line`, `lineTemplate`, `lineTag`
in ONE call from the SAME source (`room.pendingSocratesBeat` or
`room.lastReveal`, lines 240/244-245) — they can never diverge server-side.
Client-side, `handleSocratesShow` (HostScreen.tsx) called `showCaption(payload.line)`
and `playSocratesLine(payload.lineTemplate, payload.lineTag, ...)` off the
SAME `payload` object in the SAME handler invocation — the caption text and
the requested audio file were always for the identical line.

**The mismatch was a render-lifecycle bug, not a selection bug.** The
caption (`captionText`/`captionFading`) was chrome-level state (HostScreen,
old lines 2136-2140), gated only on itself and `anavasisMoving` — NOT on
`phase === 'SOCRATES'`. It was cleared explicitly by only four call sites:
`handleQuestionShow` (old L484), `handlePowerUpShow` (L500), the LOBBY
branch of `handlePhaseChanged` (L438), and `handleStateSync` (L817). Every
OTHER phase-entry handler that can follow a fired SOCRATES beat —
`handleStageAnnounce`, `handleTrialQuestionShow`, `handleClimbQuestionShow`,
`handleClimbRevealShow`, `handleDrawShow`, `handleGuessShow`,
`handleNumericQuestionShow`, `handleBlitzShow`, `handleStealShow`,
`handleRevealShow` — never touched it. Combined with the house trap
(CLAUDE.md: "PHASE_CHANGED is emitted BEFORE the phase's own payload at all
18 emit sites"), `handlePhaseChanged` flips `phase` and repaints the NEW
phase's view immediately, in a render that can land before the specific
payload handler that would clear the caption. Since `hideCaptionSoon()` (old
L540) already started its 800ms opacity fade the moment the SOCRATES clip's
`onEnded` fired — which is what triggers the server to end the phase in the
first place — the caption was already fading when the transition happened,
and for any of the ten uncovered transitions above there was nothing to cut
it short: it kept fading, visibly, over whatever screen came next, for up to
the full 800ms. That is exactly "appears above the fresh [phase]... then
slowly fades." Even the four "covered" transitions (QUESTION/POWER_UP) are
not airtight either, since `phase:changed` and the phase's own payload are
two independent socket events that need not land in the same React commit.

Conclusion: removing the caption removes the bug at its root (the stale
chrome-level render), and no follow-up "fix the audio" task is needed.

## What was removed

- HostScreen.tsx: `captionText`/`captionFading` state, the `anavasisMoving`
  state (existed only to gate the caption), both timer refs,
  `clearCaptionTimers`/`showCaption`/`hideCaptionSoon`/`hideCaptionNow` and
  every call site (LOBBY reset, `handleQuestionShow`, `handlePowerUpShow`,
  `handleStateSync`, both `handleSocratesShow` branches incl. the
  reconnect-mid-line case), the `CAPTION_FADE_MS`/`CAPTION_HARD_CAP_MS`
  constants and their wrapper styles, the render block itself, and the now-
  unused `SpeechSlab`/`CSSProperties` imports (SpeechSlab is still used by
  StealView — only HostScreen's import went).
- AnavasisScene.tsx: `onMovingChange` — a prop built exclusively for Task
  196's "no caption while a body is moving" gate, with zero other callers —
  removed from `AnavasisClimbersProps`, the destructure, and its effect. The
  `moving` state itself (Task 192's own name/delta-blanking invariant)
  is untouched.
- dev/screenshot-phases.ts: `SOCRATES_CAPTURE`'s selector depended on the
  now-deleted `data-testid="socrates-caption"`; repointed at
  `SocratesFigure`'s own `data-testid="socrates-figure"][data-phase="SOCRATES"]`
  (always-present, phase-tracking attribute already in the component).
- Kept untouched, as instructed: Task 195's `console.warn` fetch/decode
  failure logging, `onEnded()` itself, and every phase-pacing mechanism
  (`SOCRATES_AUDIO_ENDED` ack, `SOCRATES_MAX_DURATION_MS` backstop).

## Acceptance criteria

1. **Diagnosis** — see above; file:line evidence given, verdict stated:
   audio plays the server-selected line, YES.
2. **Caption count = 0** — ran `npm run screenshot:phases` (full-mode game
   + a climb/duel game + blitz, 5 bots) with a temporary per-capture DOM
   count (`page.locator('[data-testid="socrates-caption"]').count()`,
   reverted before commit — see `git diff` shows none of it survives).
   Sampled at all **21 TV phase captures** — SOCRATES, every QUESTION-type
   phase (QUESTION, POWER_UP, TRIAL_QUESTION, CLIMB_QUESTION, ...), and
   CLIMB_REVEAL included: **caption-count=0 at every single sample, 0
   violations.** (The component is also fully absent from the render tree,
   so this is structurally guaranteed, not incidental.)
3. **Clean removal**: `npm run typecheck` passes (shared+server+client).
   `grep -rn "socrates-caption\|CAPTION_FADE_MS\|CAPTION_HARD_CAP_MS\|captionText\|captionFading\|anavasisMoving\|onMovingChange"` across
   `client/src` and `dev/` returns **zero live references** (one explanatory
   comment in screenshot-phases.ts names the retired testid, not a
   reference to it). Phase pacing measured directly: two live SOCRATES
   beats (GAME_INTRO, STAGE_INTRO) in a timestamped run — phase durations
   8261ms and 8186ms against their audio files' real durations (ffprobe)
   8202ms and 8124ms: **59ms and 62ms off, both far inside ±1s.**

## Report

All three criteria pass. No server files touched; client-only plus the dev
harness's own selector. `npm run screenshot:phases` completed clean twice
(21/21 + 12/12 both runs), confirming no regression to any other phase.
