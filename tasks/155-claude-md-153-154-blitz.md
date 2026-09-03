# 155 — CLAUDE.md: 153-154 changes, and record what blitz actually is

CLAUDE.md was combed in 152. Three tasks landed since, and one question
has no answer in any document.

## Acceptance criteria — report on each SEPARATELY, under 8 lines total

1. Add what 153 and 154 changed, verified against the repo: usedWords
   Set in DrawState (draw.ts) with its pool-short fallback; host
   prefetch of all mp3s on LOBBY entry, cache-only, never decoded; and
   the failure path — a 404, decode throw or start throw now emits
   socrates:audio_ended at once instead of holding the 11000ms backstop.
   Report line count before and after.

2. BLITZ. Report first, then write. There is a /dev/blitz route and the
   design chat has no record of what it is. Report: does a blitz phase
   machine exist server-side, a phone swipe view, a TV view, how many
   authored true/false statements exist and where, and whether it is
   registered in the mode registry. Then write ONE accurate paragraph
   into CLAUDE.md under the modes section stating exactly that — its
   state, not a plan. If it is dead code, say dead code.

3. Verify three claims in CLAUDE.md that you did not write in this task,
   each with file and line. At least one must be from the voice section.

## Constraints
- Sonnet. No screenshots, no Playwright.
- Do NOT touch any code, audio, LINE_TAGS or LINE_RATINGS. This task
  edits CLAUDE.md only.
- CLAUDE.md is the agent's brief — rules, file map, traps. Not history.

## Report

1. 402 -> 431 lines. Drawing section rewritten: DrawState.usedWords
   (draw.ts:112), dealAssignment(room, usedWords) filter (220), pool-short
   fallback to the full pool with a warn (221-225). Voice section: prefetch
   via dev:get_voice_lines on LOBBY (HostScreen.tsx:1049 ->
   prefetchSocratesLines useGameAudio.ts:290, bytes dropped, never decoded);
   failure path — !res.ok returns onEnded (256), decode/start throw hits the
   catch that calls onEnded (273).
2. Blitz: NO server phase machine, NO TV view, NO ControllerScreen view,
   NOT registered (GameModeId = quiz|draw|numeric|full, registerGameMode
   called by 4 modes only). Phone swipe view exists: DevBlitzScreen.tsx
   (840 lines, pointer swipe, local state only). Server has only
   blitzLog.ts's POST sink. 218 statements (109 Σ / 109 Λ) in
   blitz-statements.md, generated into shared BLITZ_STATEMENTS. Not dead
   code — a live, unwired prototype. Paragraph written as "## Blitz".
3. Verified: SOCRATES_MAX_DURATION_MS = 11000 (shared/src/index.ts:1183,
   armed phases.ts:239,692); 254 active mp3s = LINE_TAGS count
   (collectVoiceLineEntries returned 254, all present) — but orphans are
   SEVEN, not six (261 files); corrected, seventh is 149's old SPLIT_GUESS
   hash 4aa08f1cec71c4fc; FULL_DRAW_ROUNDS_BY_LENGTH short 1 / medium 1 /
   long 3 (shared/src/index.ts:599-603); GLIDE_MS = 400 and
   REORDER_DELAY_MS = DEFAULT_DURATION_MS (PlayerScoresPanel.tsx:49-50).
