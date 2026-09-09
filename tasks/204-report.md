# Task 204 — CLAUDE.md accuracy refresh (post 188a–203)

Documentation only. `git diff --stat`: `CLAUDE.md | 124 +++++++++++--`, zero
other files touched.

## Criterion 1 — COVERAGE

Every bullet is present in CLAUDE.md; verified against code at HEAD before
writing:

| Bullet | CLAUDE.md location | Code verified at |
|---|---|---|
| GamePhase 21 values | "## Phases" intro | shared/src/index.ts:443-487 (counted the union) |
| GameModeId 6 values | "## Phases" intro + Blitz section | shared/src/index.ts:417-419 |
| Standalone duel = dev harness, bots never VIP | Phases, Η Μονομαχία block | server/src/modes/duel.ts:7-10,44-74; server/src/index.ts:793-810 (`VIP_START_GAME` gated by `getVipRoomForSocket`) |
| finaleMode type/default/VIP toggle/HOST_REJOIN | Phases, climb block | shared/src/index.ts:1250,1253-1254,1265; client/src/screens/ControllerScreen.tsx:3216-3218; server/src/index.ts:217 (`settings: room.settings` on every sync) |
| CLIMB_* constants, one-line each | Phases, climb block | shared/src/index.ts:2266-2268,2301,2309,2319,2433-2434 |
| climb.ts in file listing | "Where things live" | server/src/climb.ts (new listing row) |
| design/anavasis-reference.html noted | "Where things live", AnavasisScene row | design/anavasis-reference.html (exists); client/src/screens/host/ClimbQuestionView.tsx:15 already cited it |
| Spear rule mechanics/trigger/constants | Phases, new Η Λόγχη block | server/src/climb.ts:127-224 (all of `applyClimbSpearRound`/`nextAfterSpearRound`/`nextAfterSpearEliminations`, `CLIMB_SPEAR_MIN_PLAYERS`/`CLIMB_SPEAR_LIMIT`) |
| DUEL_LOCKED empty by design | Phases, duel verdict block | server/src/socrates.ts:543 (`DUEL_LOCKED: []`) |
| Verdict lines weapon-pair-gated | Phases, duel verdict block | client/src/components/duelVerdict.ts:24-38 (`buildDuelVerdictLine`) |
| Socrates caption removed, no stale refs | (absence — nothing to point at) | grep confirms 0 references anywhere in CLAUDE.md (it never documented the caption to begin with) |
| Anavasis frame alternation (192) | new paragraph after climb block | client/src/components/AnavasisScene.tsx:342-348; client/src/screens/host/ClimbRevealView.tsx (1x1px marker only); client/src/components/TheatreScene.tsx:13-25 |
| Slab height ceiling (199) | same paragraph | client/src/screens/host/ClimbQuestionView.tsx:34-57 |
| Socrates never occludes slab (198) | same paragraph | client/src/screens/host/ClimbQuestionView.tsx:24-33,48-57 (`zIndex: 3`) |
| VIP sound sliders collapse toggle (192/195) | new paragraph after frame-alternation | client/src/screens/ControllerScreen.tsx:356-372 (`VipAudioControls`); tasks/195-socrates-silence-catch-logging.md (empirical ruling-out) |

## Criterion 2 — ACCURACY (inverse)

Re-read the FULL CLAUDE.md (664 lines) top to bottom after editing. Method:
every backtick-quoted identifier, file path, and numeric constant introduced
or already present in a section I touched was individually grepped against
the current source tree (not recalled from memory) before being left in
place; two pre-existing claims turned up FALSE during this pass and were
corrected even though the task brief didn't name them directly:
- "The phone still renders nothing for CLIMB_*/DUEL_* (Task 190)" (twice) —
  Task 190 in fact shipped full phone views (ControllerScreen.tsx cases at
  lines 1317-1345, render branches at 2938+/3019+/2116+/2161+). Both
  instances rewritten to describe what's actually rendered.
- "17/17 TV-phase coverage" (Stages section) — stale from before
  CLIMB/DUEL screenshots existed; corrected to 21/21 (same count fixed in
  Visual verification's 17→21/9→12).
Checked roughly 40 distinct factual claims this way (every constant value,
every file:line, every "built"/"not built" assertion in the sections
touched). Zero remaining references to nonexistent files or exports; zero
claims left contradicting code at HEAD, to the extent checkable by direct
grep/read (sections outside this task's scope — Colour, Drawing, Numeric,
Traps — were spot-read but not re-verified line-by-line against code,
since the task scoped this refresh to 188a-203).

## Criterion 3 — STALENESS

Patterns run against the edited file:
- `grep -nic "caption" CLAUDE.md` → 1 hit, line 294 — inspected: it's the
  DUEL_PICK spectator's OWN "look at the TV" caption text (a different,
  still-current feature, `data-testid="duel-pick-caption"`), not the
  removed Socrates speech caption. Not a violation.
- `grep -nE "CAPTION_FADE_MS|CAPTION_HARD_CAP_MS|captionText|captionFading|socrates-caption|anavasisMoving|onMovingChange" CLAUDE.md` → 0 hits.
- `grep -nE "phone still renders nothing|no phone view yet|17 TV|17/17 TV-phase" CLAUDE.md` → 0 hits (both fixed under criterion 2).
0 hits remain for every caption-era or stale-finale pattern.

## Criterion 4 — SPEAR SUMMARY (design log, not written to CLAUDE.md)

Η Λόγχη triggers only at 4+ players: sitting at the bottom step through two
consecutive bad rounds (wrong answer OR no answer at all) gets a player
speared out; a single correct answer anywhere in that streak resets it to
zero. If two or more players get speared in the same round, the two who
reacted fastest fight a duel instead — loser eliminated, winner's counter
resets, anyone else caught in that round is out outright. Whittling the
field down to one survivor wins the game outright, same as reaching the
top of the ladder. Constants: `CLIMB_SPEAR_MIN_PLAYERS` = 4 (the gate),
`CLIMB_SPEAR_LIMIT` = 2 (strikes to elimination). Pure mechanic only —
not yet wired into a live game.
