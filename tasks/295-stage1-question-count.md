# Task 295 — Quiz-stage question count 5→10 (branch speech-policy)

## Read-only finding, and the resulting design decision

`FULL_QUIZ_QUESTION_COUNTS` was NOT stage-1-only. Its one consumer,
`fullStagesForLength` (shared/src/index.ts), matched on
`stageSegment(definition) === 'quiz'`, which is true for BOTH full's stage 1
(Η Αγορά) and stage 6 (Η Συκοφαντία) — one count fed both stages, substituted
identically on each `.map` pass. Reported and stopped per the task's own
stop condition ("splitting it is a design decision, not yours").

Decision (Argyrios): split. New constant `FULL_QUIZ_STAGE1_QUESTION_COUNTS`
for stage 1 only (short 2 / medium 3 / long 10 — medium/short unchanged from
what the shared table already gave stage 1). `FULL_QUIZ_QUESTION_COUNTS`
keeps its existing values (short 2 / medium 3 / long 5) and now governs stage
6 only. `fullStagesForLength` matches by `definition.stage` (1 vs 6), not by
segment alone — segment-only matching is exactly the bug that made one count
feed both stages.

## Acceptance criteria

1. **Consumer-site answer, quoted.** `fullStagesForLength` (shared/src/index.ts)
   is the sole consumer. Before this task:
   ```ts
   const questionCount = FULL_QUIZ_QUESTION_COUNTS[length];
   const stages = FULL_STAGES.map((definition) =>
     stageSegment(definition) === 'quiz' ? { ...definition, questionCount } : definition,
   );
   ```
   One count fed both quiz rows (stage 1 AND stage 6) since both have
   `segment: 'quiz'`. After this task, matched per-stage:
   ```ts
   const stage1Count = FULL_QUIZ_STAGE1_QUESTION_COUNTS[length];
   const stage6Count = FULL_QUIZ_QUESTION_COUNTS[length];
   const stages = FULL_STAGES.map((definition) => {
     if (definition.stage === 1) return { ...definition, questionCount: stage1Count };
     if (definition.stage === 6) return { ...definition, questionCount: stage6Count };
     return definition;
   });
   ```

2. **Diff + v2 long bot run.** `npx tsx -e` against `fullStagesForLength`:
   short 2/2 (total 4), medium 3/3 (total 6), long **10/5** (total 15).
   `SCENARIO=V2 BOT_COUNT=4 npx tsx dev/295-stage1-question-count-check.ts`
   (real in-process server, socket-level bots, default settings ⇒
   gameLength 'long', stops right after stage 7's STAGE_ANNOUNCE rather than
   riding the climb to GAME_OVER):
   - stage 1 STAGE_ANNOUNCE: `questionCount=10`; **10** QUESTION_SHOW events
     observed inside stage 1's index range (0..9).
   - stage 6 STAGE_ANNOUNCE: `questionCount=5`, unchanged; **5**
     QUESTION_SHOW events observed (10..14).
   - `[slot] room 5389 stage 1 QUIZ_MID FIRED` logged immediately after
     "question 5 revealed" — `half = Math.ceil(10/2) = 5`
     (`isQuizMidpoint`, speechSlots.ts:222), derived from
     `definition.questionCount`, never hardcoded.
   - `[slot] room 5389 stage 1 QUIZ_CLOSE FIRED` logged immediately after
     "question 10 revealed" (the last one).
   - Alternation intact: QUIZ_MID targeted the WORST player
     (Ξανθίππη, pool `AGORA_WORST`), QUIZ_CLOSE targeted the BEST
     (Σμαράγδα, pool `RUNAWAY_LEAD`) — matches speechSlots.ts's
     `QUIZ_MID: {prefer:'worst'}` / `QUIZ_CLOSE: {prefer:'best'}`.
   - `[ledger] ... stage 1 "Γύρος 1 — Η Αγορά" (quiz) closed — 4 players,
     10 quiz questions` confirms the ledger's own count.

3. **Question-bank effect.** Selection guard, `getQuestionSet`
   (server/src/questions.ts:129-155):
   ```ts
   const allowedDifficulties = DIFFICULTY_MIX_TO_ALLOWED[mix];
   const pool = QUESTIONS.filter((question) => allowedDifficulties.includes(question.difficulty));
   let shuffled = shuffle(pool);
   ...
   if (shuffled.length < count) { console.warn(...); return shuffled; }
   return shuffled.slice(0, count);
   ```
   `quizQuestionCount(room)` (modes/full.ts:141-143) sums both quiz stages'
   `questionCount` from `stagesFor(room)`, so a long game now draws **15**
   quiz questions (10 + 5, up from 10) via `getQuestionSet(mix, 15)`. Bank
   sizes by difficulty: easy 311, medium 371, hard 217 (899 total) —
   `DIFFICULTY_MIX_TO_ALLOWED` gives every mix (easy 682, normal 899, hard
   588 filtered questions) far more than 15 + the climb's own 24-question
   draw (`entering the climb — ... 24 unused question(s) drawn`, logged in
   both runs) combined; the `shuffled.length < count` fallback never
   triggers. A medium run is unchanged: `fullStagesForLength('medium')` gives
   stage1=3, stage6=3 (unaffected by the split, matching the pre-295 values).

4. **INVERSE — v1 long run.** `SCENARIO=V1 BOT_COUNT=4 npx tsx
   dev/295-stage1-question-count-check.ts`, same shape:
   - stage 1 `questionCount=10`, 10 QUESTION_SHOW events observed; stage 6
     `questionCount=5`, 5 observed — structure change applies to both
     speech policies (the 292 decision: `FULL_STAGES`/`fullStagesForLength`
     are shared, `speechPolicy` only gates which Socrates picker runs).
   - Per-reveal engine (v1) fires across all 10 stage-1 questions unchanged:
     `[socrates] fired moment=...` logged for every one of questions 1-10
     (EASY_MISS, HARD_HIT, GENERIC_TRANSITION, EVERYONE_CORRECT,
     HOT_STREAK_5, PERFECT_GAME_PACE ×2, EVERYONE_CORRECT, GENERIC_TRANSITION,
     ONLY_ONE_CORRECT), and the beat-kind tally shows `REVEAL: 15` total —
     exactly 10 consecutive REVEAL beats between stage 1's STAGE_INTRO and
     stage 2's, then 5 more for stage 6.
   - Typecheck ×3: `npm run typecheck --workspace={shared,server,client}` —
     all three clean, no errors.
   - `git rev-parse main` = `c87443a...` — main untouched.

## Files changed

- `shared/src/index.ts` — new `FULL_QUIZ_STAGE1_QUESTION_COUNTS` constant;
  `FULL_QUIZ_QUESTION_COUNTS` now documented as stage-6-only;
  `fullStagesForLength` matches by `definition.stage` (1 vs 6) instead of by
  segment alone.
- `dev/295-stage1-question-count-check.ts` — new harness (socket-level bots,
  in-process server, exits at stage 7's STAGE_ANNOUNCE rather than riding
  the climb to GAME_OVER).
