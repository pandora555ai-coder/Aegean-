# Task 179 — Phone-viewport screenshots in the harness

## Do
Extend dev/screenshot-phases.ts: alongside the existing 17 TV shots
(1280×720), capture the PLAYER phone view at 360×640 for the phases
where a phone renders UI: join form, LOBBY, QUESTION (with sabotage
ink active on that player), REVEAL, DRAW (as drawer), GUESS,
NUMERIC_QUESTION, BLITZ (mid-drag if feasible, else idle card),
GAME_OVER. Write them into the same dev-shots dir with a `phone-`
prefix and add them to index.html in their own section.

## Rules (inline)
- The agent NEVER opens the PNGs. Argyrios reviews at /dev-shots/.
- Bots answer at the socket level and never render a phone — the
  phone shots come from ONE real player page driven by Playwright.
- localhost only; do not disturb the shared dev servers (4001/5173).

## Acceptance criteria — report each one separately
1. One run produces the existing 17 TV PNGs PLUS the phone set —
   report the exact count of phone PNGs and their filenames.
2. Every phone shot is exactly 360×640 — report the dimensions read
   from the files (not assumed).
3. index.html lists both sections; report the total entries. Commit
   as task 179 and push.
