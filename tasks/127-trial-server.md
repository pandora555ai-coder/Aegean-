# Task 127 — Η ΔΙΚΗ, the quiz finale (SERVER MACHINE ONLY)

Η ΔΙΚΗ — the quiz finale. SERVER MACHINE ONLY. No client views in
this task; phase views may render a minimal placeholder that survives
a null payload (house pattern), nothing more.

## The mechanic

After quiz stage 3 completes, the game enters the TRIAL. Players
carry their accumulated score in as LIFE.

- New phases TRIAL_QUESTION, TRIAL_REVEAL. Questions come from the
  unused quiz pool. The trial is announced through the EXISTING
  STAGE_ANNOUNCE mechanism with title 'Η Δίκη' — how to wire that is
  your call, reported in criterion 1.
- While TRIAL_QUESTION is open, each living player's score drains at
  DRAIN_PER_SEC until they lock an answer. Drain is SERVER-SIDE,
  computed from elapsed-at-lock-in using the pause-aware shared timer
  clock — NOT raw Date.now deltas (pause must freeze the drain).
- At TRIAL_REVEAL: correct = the drain already taken, nothing more.
  Wrong = additional WRONG_HIT. No answer = full-timer drain AND
  WRONG_HIT.
- Elimination is checked ONLY at reveal: score <= 0 -> eliminated,
  excluded from later trial questions. Never mid-question.
- End conditions: one player above 0 -> winner -> GAME_OVER. All
  remaining <= 0 in the same reveal -> SUDDEN DEATH: one question,
  those players only, earliest correct lock-in wins (answerRank
  semantics, NOT a buzzer); none correct -> repeat. Question pool
  exhausted -> highest score wins.
- Constants DRAIN_PER_SEC = 10, WRONG_HIT = 150 in SHARED —
  placeholders for the deferred balance pass.

## Acceptance criteria — report each SEPARATELY, with numbers

1. BEFORE changing anything: report where "what follows REVEAL" is
   decided (file, function), where the trial hooks in, and which
   timer helper provides the pause-aware clock. Then build.

2. Phase flow: a quiz game now ends ... -> TRIAL_QUESTION ->
   TRIAL_REVEAL (xN) -> GAME_OVER. The payload rule holds: the
   correct answer and other players' lock-ins never reach a player
   before TRIAL_REVEAL. Report the emit sites.

3. Drain math, one worked example FROM THE OBSERVED GAME: a player's
   entry life, lock-in elapsed, drain, hit, resulting life — and
   confirm it matches
   life - round(elapsed_s * DRAIN_PER_SEC) - (wrong ? WRONG_HIT : 0).

4. OBSERVED, not read: run one quiz game with bots to completion.
   Report: trial rounds played, eliminations per round, the winner,
   whether sudden death fired. If the bot harness cannot answer trial
   questions, say so and report what you ran instead — do not
   simulate by reading code.

## Report

Under 8 lines. One line per criterion, with numbers.

## Notes / decisions taken while building

- **Where it hooks in.** `continueAfterReveal()` (server/src/phases.ts) is
  the one post-REVEAL decision point; its tail
  `advanceToNextQuestionOrGameOver()` is where "this was the last quiz
  question" is decided, and that is exactly where the trial is inserted —
  before the WINNER beat, which now plays at the end of the TRIAL instead.
- **Which last question.** The trial follows the LAST quiz question of
  whatever `gameLength` includes (stage 3 for medium/long, stage 2 for
  short), not literally "stage 3 only" — otherwise a short game could
  never reach the finale.
- **Announcement.** Reuses STAGE_ANNOUNCE verbatim: same phase, same
  shared timer, same `stage:announce` event. `buildStageAnnounce()` grows
  one branch — when `room.trial` is set it builds the Η Δίκη card
  (stage = quizStages + 1) — so a mid-announcement `state:sync` is right
  for free.
- **The pause-aware clock** is `remainingActiveTimerMs()` (server/src/
  timers.ts). Elapsed-at-lock-in is `questionTimeMs - remainingActiveTimerMs`,
  never a `Date.now()` delta, so a pause freezes the drain by construction.
- **Sudden death** applies no drain and no hit: every participant is
  already at or below zero, and the round is a decider, not a life round.
  The winner is `answerRank === 1` (earliest correct lock-in).
- **Lives are not clamped at 0** — an eliminated player keeps the exact
  arithmetic result (possibly negative) so the reveal figures always match
  `life - drain - hit`.
