# tasks/131-claude-md-trial.md

Update CLAUDE.md (the agent brief at the repo root) for the trial
milestone (tasks 125-130). Same protocol as 117/124: CLAUDE.md is
rules + file map + traps, NOT history — and every claim you write
must be VERIFIED against the repo, not copied from task files.

## What must be reflected (verify each in code first)
- Quiz phase flow now ends through TRIAL_QUESTION/TRIAL_REVEAL;
  where the trial hooks in; sudden death exists.
- NEW TRAP: elimination state on any client must come from
  trialReveal.results[].eliminated — a score<=0 check is WRONG
  (sudden-death players legitimately play below zero).
- Trial drain is server-side at lock-in via the pause-aware timer
  clock; any TV drain display is cosmetic. No per-second ticks.
- NUMERIC_QUESTION_COUNT = 5, random draw from the pool.
- Stage 3 display title is "Η Συκοφαντία"; the trial-themed
  STAGE_INTRO lines are lineHash-keyed and must NEVER be edited.
- Stage cards count the trial in totalStages.

## Acceptance criteria — report each SEPARATELY

1. BEFORE editing: for each item above, report the file:line in the
   CODE that proves it. Any item you cannot prove, flag instead of
   writing.

2. CLAUDE.md updated; report lines added/removed (it should not only
   grow — cut anything the milestone made stale).

3. Re-verify the OLD claims you kept in the sections you touched:
   report any claim that now disagrees with the repo (the 117/124
   comb). If none, say which claims you re-checked.

## Report
Under 8 lines.

## Result

1. Evidence gathered before writing:
   - Trial hooks in: `server/src/phases.ts:687-701` (`advanceToNextQuestionOrGameOver`
     calls `startTrial(room)` at line 694); phase list `server/src/modes/quiz.ts:25-37`
     (TRIAL_QUESTION/TRIAL_REVEAL before GAME_OVER). Sudden death:
     `server/src/trial.ts:84-92` (`nextAfterTrialRound` returns `SUDDEN_DEATH`
     when `survivors.length === 0`).
   - Elimination trap: `server/src/trial.ts:68` (`eliminated: !suddenDeath &&
     lifeAfter <= 0`); consumed correctly at `client/src/screens/HostScreen.tsx:1097-1100`
     (`trialReveal.results.filter((result) => result.eliminated)`, with its own
     comment noting a sudden-death winner can finish at negative life) and
     `client/src/screens/ControllerScreen.tsx:1408-1409` (`myTrialResult.eliminated`).
   - Drain server-side/no per-second tick: `server/src/phases.ts:791-794`
     (`trialElapsedMs`, pause-aware via `remainingActiveTimerMs`) called once
     at lock-in from `submitTrialAnswer`, `server/src/phases.ts:859-879`. TV
     drain is cosmetic: `client/src/screens/HostScreen.tsx:1058-1074`
     (`trialDisplayStandings`, driven by the 1s `setInterval` at lines 958-961
     that also runs the countdown) — explicitly a display-only re-derivation.
   - `NUMERIC_QUESTION_COUNT = 5`: `shared/src/index.ts:1583`; random draw:
     `server/src/modes/numeric.ts:88` (`shuffle(NUMERIC_QUESTIONS).slice(0,
     NUMERIC_QUESTION_COUNT)`).
   - Stage 3 title: `shared/src/index.ts:456` (`'Γύρος 3 — Η Συκοφαντία'`).
     lineHash-keyed flavor lines never edited: `server/src/socrates.ts:412-419`
     (`STAGE_INTRO_LINES[3]` still literally says "Η Δίκη"), lineHash defined
     `shared/src/index.ts:1045`, `tasks/126-rename-stage3.md` confirms the
     rename was a string-change-only diff (`shared/src/index.ts` alone).
   - Stage cards count the trial: `server/src/payloads.ts:41-69`
     (`buildStageAnnounce`, `totalStages: quizStages + 1` in both the
     trial branch (line 48) and the normal branch (line 63)).
   All six items proven; nothing flagged.

2. CLAUDE.md: +29/-5 lines (net +24) across four sections — the quiz
   phase-flow line (Phases), the Η Δίκη paragraph (Phases), the
   QUIZ_STAGES description (Stages), the numeric mode paragraph
   (Numeric mode), and two new bullets in Traps (trial elimination,
   stage-3-title-vs-flavor-lines). Nothing was cut: every existing
   claim in the touched sections re-checked true (below) — this
   milestone only added surface, it didn't invalidate anything.

3. Re-verified claims kept in the touched sections, all still true:
   "elimination is checked at TRIAL_REVEAL and nowhere else" (trial.ts's
   own comment: reached "only from a reveal"); "elapsed comes from
   remainingActiveTimerMs()" (phases.ts:791-793, unchanged); QUIZ_STAGES
   counts 3/5/4 (shared/src/index.ts:434-459, exact match); numeric.ts
   "must import nothing from modes/" (its only local import is
   `./payloads.js`); "`max` is derived from the answer, never authored"
   (numeric.ts:23 `maxForAnswer`, :45 comment, :50 call site). No
   disagreements found.
