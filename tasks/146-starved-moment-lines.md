# 146 — 19 new Socrates lines for the six starved moments

A voice-rating pass (via /dev/voice) left six moments with 0-1 usable
lines: ALL_CLUSTERED, PERFECT_GAME_PACE, CATEGORY_CALLOUT, SPLIT_GUESS,
DRAW_WINNER, and STAGE_INTRO stage 3 (Η Συκοφαντία, shared with stage 4 of
`full` via SYKOPHANTIA_INTRO_LINES). "Usable" is a rating tracked outside
this file (the voice rating page), not the pool array length — every one
of these six pools already had 5-6 lines in server/src/socrates.ts before
this task.

19 new lines were added (server/src/socrates.ts): 4 to
NUMERIC_LINES.ALL_CLUSTERED, 3 to LINES.PERFECT_GAME_PACE, 3 to
INTRO_LINES.CATEGORY_CALLOUT, 3 to DRAW_LINES.SPLIT_GUESS, 3 to
DRAW_LINES.DRAW_WINNER, 3 to SYKOPHANTIA_INTRO_LINES (keyed as both stage
3 and 4 in STAGE_INTRO_LINES). Each line was also added to LINE_TAGS with
its voice tag, in one consolidated "Task 146 additions" block at the end
of that map. No existing line, tag, or LINE_RATINGS entry was touched.

## Acceptance criteria

1. LINE_TAGS count: 235 -> 254. Verified with a tsx script importing
   `LINE_TAGS` from socrates.ts and counting `Object.keys`. No collisions:
   all 19 new template texts are distinct from every existing key.

2. Per-moment pool size after the change (actual array length, not the
   "usable" rating count the task brief's expected figures referred to):
   ALL_CLUSTERED 9 (5 existing + 4 new), PERFECT_GAME_PACE 9 (6+3),
   CATEGORY_CALLOUT 9 (6+3), SPLIT_GUESS 8 (5+3), DRAW_WINNER 8 (5+3),
   STAGE_INTRO stage 3 and stage 4 (same pool) 8 (5+3). The task brief's
   "expected 4" line was written as if these pools started empty, but
   none of the six did — see the note above.

3. lineHash(text, tag) for all 19 new lines computed via shared's real
   lineHash + sha256Hex, cross-checked against every existing LINE_TAGS
   key's hash: zero collisions with a different line, and all 19 new
   hashes are unique among themselves.

## Constraints honored

- No voice:generate run, no ElevenLabs call.
- No existing line, tag, or rating deleted or edited.
- All 19 texts copied character-exact from the brief, em dashes and
  {category} placeholders included.
- No screenshots, no Playwright — server/src/socrates.ts only, typecheck
  (`npx tsc --noEmit -p server/tsconfig.json`) passes clean.
