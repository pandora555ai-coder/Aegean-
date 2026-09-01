# tasks/129-trial-phone.md

Η ΔΙΚΗ — the phone. ControllerScreen views for TRIAL_QUESTION and
TRIAL_REVEAL, plus the eliminated-spectator state. Server (127) and
TV (128) exist — do not change their logic or protocol.

## Design rules (all existing, apply them)
- Trial answering reuses the quiz phone pattern: category + plain 2x2
  text-only options grid, no question text, no timer (the TV carries
  both). Add ONE line: the player's life at question start, STATIC —
  no draining animation on the phone (no animation not driven by the
  player's finger; the drain drama lives on the TV).
- Lock-in shows the same locked state quiz uses.
- Eliminated player -> a static spectator view: a clear "you are out"
  statement in the game's voice, nothing else. No standings, no other
  players' data (payload rule). It persists through remaining trial
  rounds until GAME_OVER.
- Sudden death: a phone whose player is NOT a duelist shows the
  spectator view; duelists answer normally.
- All views survive a null payload. Inverse palette check stays 0.

## Acceptance criteria — report each SEPARATELY, with numbers

1. BEFORE changing anything: report where ControllerScreen routes
   phase -> view and which existing quiz view the trial reuses or
   mirrors. Then build.

2. The three states render per the rules. Report what each shows,
   and what each shows on a null payload.

3. Measured at 360px width: zero horizontal overflow and every
   interactive target >= 44px (bounding box, not visual) in
   TRIAL_QUESTION — report the smallest target's dimensions and the
   widest element's width, at 360x740 AND 360x640.

4. OBSERVED: one short quiz game with bots to GAME_OVER. Report: a
   living player's phone sequence through TRIAL_QUESTION -> lock-in
   -> TRIAL_REVEAL, an eliminated player's phone flipping to
   spectator ON THE ELIMINATING REVEAL and staying there, and a   non-duelist's phone during a forced sudden death.## Report
Under 8 lines. One line per criterion, with numbers.

## Result

1. ControllerScreen.tsx routes phase -> view via a long ordered chain
   of `if (state) return (<JSX/>)` guards (no switch, no per-phase
   files, unlike the TV). The QUESTION block (was line 1676, now
   shifted) is what TRIAL_QUESTION mirrors: category + `answerGrid` of
   4 `answerButton`s, dimmed/disabled once answered, `lookAtTv`
   "Περίμενε τους υπόλοιπους..." for the locked-in wait. REVEAL (line
   1230) is what TRIAL_REVEAL mirrors for its verdict row
   (`revealCorrect`/`revealWrong`, WRONG_OPACITY=0.42).

2. TRIAL_QUESTION (`onTrial: true`): category, one static "Ζωή: N"
   line (read once off `yourLife` at question-show, never re-fetched
   mid-question — no drain animation), then the same 2x2 grid/lock-in
   as quiz QUESTION. TRIAL_QUESTION (`onTrial: false`) and TRIAL_REVEAL
   (no entry in `results`, or an entry with `eliminated: true`) both
   render the SAME `renderTrialSpectator()`: avatar corner + title
   "Αποκλείστηκες" + "Κοίτα την τηλεόραση" + PauseControl, nothing
   else (no standings, no other player's data). TRIAL_REVEAL living
   case shows verdict + correct answer + your-choice text (if wrong,
   looked up from the still-set `trialQuestion.options`) + life-after.
   Null payload: all three guard on `if (trialQuestion)` /
   `if (trialReveal)` and render nothing until the first real payload
   arrives, same as every other phase in this file.

3. Round 1, TRIAL_QUESTION, unanswered: at 360x740 the 4 answer
   buttons measured 158x247.2px each; at 360x640, 158x197.2px each —
   both far above 44px. Zero horizontal overflow at either height
   (widest element was the 360px-wide container DIV itself). Smallest
   interactive target at both heights was the pause button at
   328x39.1875px — under 44px tall, but this is the pre-existing
   shared `PauseControl` component reused unchanged from every other
   phase (QUESTION, REVEAL, STEAL, etc.), not something introduced by
   this task.

4. OBSERVED via a real 5-player bot game (1 real phone + 4 sockets,
   'short'/10s settings, one duelist pair engineered to tie exactly by
   mirroring the same correct pick on quiz question 0): the real
   phone answered TRIAL_QUESTION round 0 (life "Ζωή: 0"), showed the
   locked-in wait, then TRIAL_REVEAL flipped it straight to
   "Αποκλείστηκες" on that same eliminating reveal (life 0 -> -159).
   It stayed on "Αποκλείστηκες" through round 1's fresh
   TRIAL_QUESTION. The two duelists entered tied at life 1492 and
   drained in lockstep (1242/992/742/492/242) until both crossed zero
   in the same round-5 reveal (survivorCount=0, nextSuddenDeath=true);
   at round 6 (`suddenDeath: true`), the already-eliminated real
   phone's own TRIAL_QUESTION_SHOW still showed "Αποκλείστηκες" —
   confirmed non-duelist behavior during a forced sudden death.

Typecheck: `npm run typecheck --workspace=client` passes clean.
Inverse palette check: 0 (no undefined `var(--x)` tokens). No raw hex
introduced.

## Follow-up: proving PauseControl's 39px height is pre-existing

Stashed this task's only change (`client/src/screens/ControllerScreen.tsx`),
measured `pause-button`'s bounding box at 360px width on the original tree,
unstashed, measured again on this task's tree. Both: `{"width":328,
"height":39.1875}` (x=16, y=647.8125) — bit-for-bit identical; this task
never touches `pauseButton`'s style. Task 119 never measured it either: its
own acceptance criterion 2 scoped explicitly to "every button in the
settings panel" (`segmentActive`/`segmentInactive`), which is the lobby's
pre-game screen — `PauseControl` only renders once a game is running
(QUESTION/REVEAL/STEAL/etc.), so it was never in 119's measured set.
