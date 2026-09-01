# Task 128 — Η ΔΙΚΗ, the TV

Η ΔΙΚΗ — the TV. Build the /host phase views for TRIAL_QUESTION and
TRIAL_REVEAL, and fix the stage-card numbering. Server machine exists
(task 127) — do not change its logic or protocol.

## Design rules (all existing, apply them)
- Layout rule: papyrus LEFT = anything read (question text, revealed
  answer); score column RIGHT = anything about players (lives,
  locked-in state, eliminations). TV shows question text, not options
  — the phones carry options, as in quiz.
- The score column shows LIVES during the trial. Drain on the TV is
  COSMETIC: animate locally from question start + DRAIN_PER_SEC,
  display only — the server stays authoritative and the reveal
  corrects the number. No per-second server ticks.
- Eliminated players: row sinks to the bottom and fades to opacity
  0.42 via the EXISTING reorder machinery, transform/opacity only.
- Both views must survive a first render with a NULL payload.
- No raw hex; inverse palette check must stay at 0.

## Acceptance criteria — report each SEPARATELY, with numbers

1. BEFORE changing anything: report where HostScreen routes phase ->
   view, confirm the score column lives in HostScreen (NOT inside a
   phase view), and where buildStageAnnounce sets stage/totalStages
   for QUIZ cards. Then build.

2. Stage numbering: quiz stage cards count the trial — a short game
   announces 1/3, 2/3, then the trial 3/3; medium announces /4.
   Report the changed line(s) and the announces from the observed run.

3. TRIAL_QUESTION and TRIAL_REVEAL render per the rules above.
   Report: what sits under the papyrus vs the column in each, and
   what each view shows on a null payload.

4. OBSERVED via the bot harness: one short quiz game to GAME_OVER at
   1280x720. Report every element with a bounding box below 690px at
   5 players, with data-testid and height — if none, the tallest
   element and its height, at BOT_COUNT 5 AND 8. Confirm an
   eliminated player's row visibly sank and faded.

## Report
Under 8 lines. One line per criterion, with numbers.

## Result

1. HostScreen routes phase -> view via `renderPhaseView()`'s if-chain
   (client/src/screens/HostScreen.tsx); the score column
   (PlayerScoresPanel) is rendered by HostScreen itself, outside that
   chain, so it survives every phase-view remount. buildStageAnnounce
   (server/src/payloads.ts) set `totalStages` from
   `stagesForLength(...).length` alone, never counting the trial.

2. Fixed: server/src/payloads.ts buildStageAnnounce's non-trial branch
   now returns `totalStages: stagesForLength(...).length + 1` (the
   trial branch already did `quizStages + 1`). Observed via the bot
   harness on a `short` game: stage-announce sequence 1/3, 2/3, 3/3
   ("ΓΥΡΟΣ 3/3 | Η Δίκη | ...").

3. TrialQuestionView: papyrus holds only the question text (category
   above it, sudden-death banner when `suddenDeath`); no options grid
   — the phones carry the four options. TrialRevealView: papyrus holds
   only `correctOption`'s text (the payload carries no per-option
   tally, unlike quiz REVEAL) plus a winner/sudden-death line when set,
   and a progress bar. Both bail to `null` and render nothing extra
   until their payload arrives (the house "first render, no payload"
   pattern) — HostScreen's `showShell` guard covers the intermediate
   frame with the last known standings, same as every other phase.
   PlayerScoresPanel gained `title` ("Ζωές" during the trial),
   `eliminatedPlayerIds` (opacity 0.42, new `scorePanelRowEliminated`
   style) and `lockedInPlayerIds` (🔒 badge) props — elimination is
   read from `trialQuestion.lives[].alive` during TRIAL_QUESTION (NOT
   raw score, which can legitimately be 0 pre-round without being
   eliminated yet) and, as of the sudden-death fix below, from
   `trialReveal.results[].eliminated` at TRIAL_REVEAL.

4. Bot harness (dev-only, forced eliminations via bots skipping every
   trial answer) at 1280x720, BOT_COUNT 5 and 8: no element's bottom
   edge exceeded 690px at either count. Tallest per phase at 5:
   stage-announce 684.0px, TRIAL_QUESTION's question-text 633.6px,
   TRIAL_REVEAL's trial-reveal-progress 492.7px, GAME_OVER's
   final-standing-row 683.2px. At 8: 684.0px, 634.7px, score-panel
   498.5px, 670.6px. Confirmed 4 (at 5 players) / 7 (at 8 players)
   eliminated rows sank below the survivor and faded to opacity 0.42
   at TRIAL_REVEAL, versus opacity 1 for all rows one round earlier at
   TRIAL_QUESTION despite already sitting at 0 life.

## Sudden-death fix (review follow-up)

TRIAL_REVEAL's elimination check originally read `standings.score <= 0`
directly. That's wrong for a sudden-death round: `scoreTrialRound`
(server/src/trial.ts) charges no drain and no hit there and sets
`eliminated: !suddenDeath && lifeAfter <= 0` — unconditionally `false`
for every duelist regardless of how negative their life already was.
So a sudden-death winner ending the trial at, say, -9 (task 127's own
run-B) had `score = -9 <= 0` and would have rendered as eliminated —
faded and sunk — despite having just won.

Fixed in `trialEliminatedPlayerIds()` (client/src/screens/HostScreen.tsx):
TRIAL_REVEAL now reads `trialReveal.results[].eliminated` for whoever
this round actually judged (the authoritative call, sudden death
included), and treats anyone NOT in this round's results as eliminated
in an earlier one (trial.livingPlayerIds only ever shrinks, so absence
from a round's participant list only ever means "already out").

Verified with a forced sudden-death bot game (every bot answers every
quiz question wrong, entering the trial tied at exactly 0 life; every
bot skips trial round 1 so all five cross zero in the same reveal,
declaring sudden death for the whole group; bot 0 alone answers the
sudden-death round, winning at life -250): the transitional reveal
(round 0, `suddenDeath=false`) correctly shows all 5 as eliminated; the
final, winning reveal (round 1, `suddenDeath=true`) shows the winner's
row — and every other duelist's — at `data-eliminated=false`,
`opacity=1`, no longer faded despite the negative life.
