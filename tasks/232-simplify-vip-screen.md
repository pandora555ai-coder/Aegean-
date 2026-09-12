# Task 232 — simplify the VIP screen

The VIP settings panel offered every registered mode plus a long list of
quiz-only knobs, which confused players. It now offers one game (full)
and one setting (seconds per question). No mode was deleted or
unregistered — every standalone mode stays fully playable, reachable via
`?mode=` on the host URL, exactly as the dev harnesses and Task 231's
quiz-only Socrates lines require.

## Changes

**`client/src/screens/ControllerScreen.tsx`**
- The "Παιχνίδι" mode-picker's `options` are filtered to the single
  `'full'` entry (`availableModes.filter((o) => o.id === 'full')`). The
  underlying mechanism (`vip:set_mode`, the registry, `availableModes`
  itself) is untouched — this only narrows what the row renders.
- The "Χρόνος" (`questionTimeMs`) row moved out from the `mode === 'quiz'`
  gate so it always renders, since the real room is `'full'` by default
  now and full's quiz stages read the same `room.settings.questionTimeMs`.
- Every other quiz-only row (Διάρκεια, stage-summary, Δυσκολία, Σοφιστικά
  τεχνάσματα, Φινάλε, estimated-length) and the draw-only Γύροι row are
  unchanged in code — still there, still gated to their own mode, just
  never shown in the normal `full` flow a real VIP now gets. They remain
  reachable by testing with `?mode=quiz` / `?mode=draw` on the host URL.

**`client/src/screens/HostScreen.tsx`**
- `handleCreateRoom`: a room created with no `?bot` and no `?mode` (a real
  party) now requests `mode: 'full'` explicitly, instead of omitting the
  field and falling through to the server's `DEFAULT_GAME_MODE` ('quiz').
- `?bot=N` alone (no `?mode`) is UNCHANGED — mode is still omitted, so the
  server still defaults that path to `'quiz'`. This preserves every
  bot-driven dev/screenshot harness that relies on the old default.
- An explicit `?mode=` always wins, with or without bots, exactly as
  before.

No server-side default, mode registry entry, stage logic, scoring, or
game constant changed.

## Acceptance criteria (observed live — real dev server + client, Playwright)

**1. VIP panel, as rendered.** `data-testid="settings-panel"` shows:
fullscreen toggle, `"Παιχνίδι"` with exactly one option
(`"Πλήρες παιχνίδι"`), `"Χρόνος"` with `10΄΄ / 20΄΄ / 30΄΄`. Zero DOM nodes
for `setting-length-*`, `setting-difficulty-*`, `setting-powerups-*`,
`setting-finale-*`, `setting-draw-rounds-*`, `stage-summary`,
`estimated-length`.

**2. Seconds-per-question changes real duration.** Two real players
joined a fresh no-param room (defaults to `full`), nobody answered so only
the server timer (never the "all answered" early-exit) could end the
phase:
- `questionTimeMs = 10000` → observed QUESTION-phase duration **9877ms**.
- Fresh room, `questionTimeMs = 30000` → observed **29998ms**.

**3. `?bot=N` default preserved / `?mode=full` still full.**
- `?bot=5` (no mode): log `room created ... (mode=quiz)`,
  `auto-starting - 5 bot(s), no human ever joined`,
  `entering stage 1/4 — Η Αγορά` → `stage 2/4 — Οι Σοφιστές` (standalone
  quiz's fixed 12-question, 3-stage-plus-trial structure).
- `?bot=5&mode=full`: log `room created ... (mode=full)`,
  `full show: 10 quiz question(s) over 2 stages, 12 blitz statement(s), 3
  drawing round(s), 3 numeric question(s), 1 agora round`,
  `entering stage 1/7 — Η Αγορά`. A separate earlier run (2 real players,
  no bots, no params) progressed the same 7-stage lineup through stages
  1→6 (Η Αγορά, Η Παλαίστρα, Ζωγραφική, Εκτίμηση, Η Λήθη, Η Συκοφαντία)
  before being left to idle out.

**4. Inverse — nothing deleted.** Server startup log lists all 7 modes
still registered: `agora, draw, blitz, numeric, quiz, duel, full`.
`server/src/socrates.ts`'s `QUIZ_STAGE_INTRO_LINES_EXCLUDED_IN_FULL`
filter (the three Task 231 lines) is untouched and still keyed on
`mode === 'full'` only — in standalone quiz that filter never applies, and
a live standalone-quiz bot room (`?bot=5`, room 1483) fired a
`STAGE_INTRO` line from that exact pool at its "Οι Σοφιστές" stage,
confirming the pool stays reachable there.

## Typecheck

`npm run typecheck` (shared + server + client) — clean.
