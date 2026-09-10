# Task 226 — two small correctness fixes

## Defect A — bots submitted a blank tile in Ζωγραφική

`server/src/bots.ts`'s `PLACEHOLDER_DRAWING` was a literal 1x1 transparent
PNG, so a bot drawer's turn showed a blank/black tile on the TV during
GUESS/GUESS_REVEAL. Replaced it with `generateBotDrawing()`: a hand-written
PNG encoder (CRC32 table, chunk framing, `node:zlib` deflate — no canvas
library in this dependency tree) that draws 2-4 random thick ink strokes
(Bresenham line + disc stamping) on a paper-coloured 256x256 canvas, using
the same PAPER hex as `DrawingCanvas` and the palette's `--wine`/`--wine-2`/
`--carve` inks (restated as literals — server-generated pixel data, not a
screen the palette rule governs). Doesn't need to resemble the round's word.

## Defect B — Εκτίμηση's NOBODY_CLOSE line fired on a close miss

`recordNumericRoundAndPickLine` (server/src/socrates.ts) already gated the
line on `bestDistance / answer >= 0.5` (added at Task 138) — but that ratio
alone breaks down for the pool's many small answers (Πόσοι πλανήτες = 8,
Πόσα λίτρα αίμα = 5, Κάθε πόσα χρόνια οι Ολυμπιακοί = 4...): missing a 4 by
2 is a 50% ratio, same as missing a 100 by 50, but a miss of 2 reads as a
near guess, not "nobody was close" (κανείς δεν έπεσε κοντά στο σωστό,
NOBODY_CLOSE's actual pool text). Added `NOBODY_CLOSE_MIN_ABSOLUTE_DISTANCE
= 3` as a floor under the ratio: an absolute miss below it never counts as
far, whatever the answer's own size. Only the candidate-selection condition
changed — `scoreNumericSubmissions`, the ranking, and every other
NumericMoment (`EXACT_HIT`/`WILDLY_OFF`/`ALL_CLUSTERED`) are untouched.

**Threshold chosen: 3.** Off-by-1/2 happens even when someone is clearly
aiming at the right number (rounding, a last-second slider nudge); off-by-3
is the smallest miss that reads as more than that. First guess, to be tuned
at playtest per the task brief.

**Found, not fixed (documented in code):** `modes/numeric.ts`'s crowd-mood
cheer/boo decision reused the *old* bare-ratio NOBODY_CLOSE threshold
verbatim (its own comment said so). Task scope was line selection only, so
it's left as the bare ratio — now diverging from the line's gate on small
answers (mood can go 'boo' on a miss too close to fire the line). Comment
added at the call site pointing this out for a future task.

## Acceptance criteria

**1. Bot run, Ζωγραφική.** `?bot=3&mode=draw` via Playwright against the
existing dev server (localhost:5173 client / localhost:4001 server, no
process of my own started or killed). The drawer bot (Γιώργος) submitted;
GUESS phase's `[data-testid="guess-drawing"]` `<img>` resolved to
`naturalWidth`/`naturalHeight` **256x256** (was 1x1), `src` length **1818**
chars of real `data:image/png;base64,...`, alpha channel constant **255**
(fully opaque, no blank/transparent tile), red channel spanning **43-246**
across 65536 pixels — real ink-on-paper contrast, not a single flat colour.
No blank/1x1 tile.

**2. Εκτίμηση, close answer.** Isolated test (`recordNumericRoundAndPickLine`
called directly, same function the real reveal calls): true value **4**
(the actual "Κάθε πόσα χρόνια γίνονταν οι αρχαίοι Ολυμπιακοί" pool answer),
closest submitted guess **2**, distance **2**. Selected line: **none**
(`null`) — before this fix, the same inputs fired NOBODY_CLOSE
("Τόσο μακριά πέσατε όλοι, που το σωστό νούμερο δεν ακούστηκε καν...").

**3. Εκτίμηση, all far.** Same true value **4**, submitted guesses
`[9, 10, 11]`, closest distance **5** (ratio 1.25, chosen to stay clear of
the separate WILDLY_OFF candidate so NOBODY_CLOSE is isolated). Selected
line: **"Κανείς δεν έπεσε κοντά στο σωστό. Αναρωτιέμαι πώς ψωνίζετε στην
αγορά χωρίς να κλαίτε."** (NOBODY_CLOSE) — confirms the line still fires
when genuinely nobody was close.

**4. Inverse — scoring/ranking unchanged.** `scoreNumericSubmissions`
(server/src/numeric.ts, never touched by this task) run on answer=4,
max=20 (maxForAnswer(4)), submissions `{p1:2, p2:6, p3:7}` — before (git
stash of all three edited files) and after: **byte-identical** (`diff`
reported no differences). Result both ways: p1 dist=2 rank=1 pts=400,
p2 dist=2 rank=1 pts=400, p3 dist=3 rank=3 pts=100.

## Typecheck

`npx tsc --noEmit -p server/tsconfig.json` — clean, no errors, both before
and after.
