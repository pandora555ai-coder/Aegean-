# Task 231 — rename to Η Λήθη, retire two stale line pools

Stage naming and Socrates line eligibility only — no audio generated, no
Task 230 lines wired in, no stage order/scoring/constant change.

## Change A — full's stage 5 renamed

`shared/src/index.ts`'s `FULL_STAGES[4]` (stage 5, segment `agora`):
title `'Γύρος 5 — Η Μνήμη της Αγοράς'` → `'Γύρος 5 — Η Λήθη'`, tagline
rewritten around forgetting rather than remembering (`'Κοιτάξτε καλά όσο
προλαβαίνετε. Η Λήθη δεν επιστρέφει ό,τι σας πήρε.'`). The internal
`'agora'` segment/phase identity, the standalone agora mode's own
`agoraMode.label` ('Η Μνήμη της Αγοράς', a separate surface — the VIP mode
picker, not a stage card), and the mechanic itself are all untouched — this
is a display rename of the one stage card, per the task's own scope.

## Change B — GAME_INTRO_LINES: one line names a round count

Swept the whole 8-line pool for any line stating a round count. Found
exactly one: `'Τρεις γύροι σας χωρίζουν από την απάντηση που ήρθατε να
ακούσετε. Ελάχιστοι φτάνουν ως εκεί όρθιοι.'` ("three rounds separate you
from the answer") — true of standalone quiz's 3 stages, false of full's 7.
Filtered out when `room.mode === 'full'` via a new
`GAME_INTRO_LINES_EXCLUDED_IN_FULL` set in `pickGameIntroLine`, which now
takes `mode: GameModeId`. Line kept verbatim in the pool (its mp3 stays
valid) — only eligibility changed.

## Change C — three quiz STAGE_INTRO_LINES filtered out of full

`STAGE_INTRO_LINES.quiz` is a merged 12-line pool (Task 218) shared by
standalone quiz's stage 1 (Η Αγορά) and stage 2 (Οι Σοφιστές) *and* full's
one non-stealing quiz stage. Three lines are Οι Σοφιστές' own "second
round" framing:

- "Οι Σοφιστές. Από εδώ και πέρα δεν αρκεί να ξέρετε."
- "Δεύτερος γύρος. Τώρα μπορείτε να βλάψετε ο ένας τον άλλον."
- "Οι Σοφιστές δίδασκαν πώς να κερδίζεις, όχι πώς να έχεις δίκιο. Θα σας
  φανεί χρήσιμο."

Correct in standalone quiz (a real second stage), wrong in full (the quiz
pool fires once, at stage 1). Filtered out when `mode === 'full' &&
identity === 'quiz'` via `QUIZ_STAGE_INTRO_LINES_EXCLUDED_IN_FULL` in
`pickStageIntroLine`, which now also takes `mode: GameModeId`. Lines kept
verbatim in the pool and still selectable in standalone quiz.

Both new call-site parameters are threaded from `phases.ts`'s two call
sites (`endStageAnnounce`, `startGameIntro`) via `room.mode`, already on
hand at both.

## Acceptance criteria

Observed with an all-bot socket-level harness (throwaway server, `mode` set
at `host:create_room` per Task 222 so the room needs no VIP and self-starts
per Task 217 — no human socket needed at all, since every event this task
cares about is host-only). Harness deleted after use, not committed.

**1. Full game, stage 5 card.** Title **"Γύρος 5 — Η Λήθη"**, tagline
**"Κοιτάξτε καλά όσο προλαβαίνετε. Η Λήθη δεν επιστρέφει ό,τι σας πήρε."**
Contains "Μνήμη": **false**. Contains "Αγορά": **false**.

**2. Full game, every Socrates line before stage 1's STAGE_ANNOUNCE.**
Exactly one line played: **"Δεν ρωτάω για να μάθω τι ξέρετε. Ρωτάω για να δω
ποιοι είστε όταν δεν ξέρετε."** — no round count mentioned (this is the
GAME_INTRO beat; the flagged "Τρεις γύροι..." line never appeared across
this and the 10 runs in criterion 3, confirming the mode filter holds).

**3. Full mode, 10 runs of stage 1 (fresh room each time).** Lines observed
per run, none from Change C:
```
run 1: Δεν ρωτάω...  / Τα πρώτα ερωτήματα...
run 2: Εγώ ένα ξέρω...  / Βρισκόμαστε στην Αγορά...
run 3: Ας αρχίσει η διαμάχη...  / Βρισκόμαστε στην Αγορά...
run 4: Ένας από εσάς...  / Ελπίζω να μην έχετε φίλους...
run 5: Ας αρχίσει η διαμάχη...  / Πρώτος γύρος...
run 6: Ας αρχίσει η διαμάχη...  / Ένα όπλο ο καθένας...
run 7: Ας αρχίσει η διαμάχη...  / Ξεκινάμε ήρεμα...
run 8: Ας αρχίσει η διαμάχη...  / Πρώτος γύρος...
run 9: Ήρθατε για τη γνώση...  / Η Αγορά είναι γεμάτη...
run 10: Ένας από εσάς...  / Η Αγορά είναι γεμάτη...
```
None of the three Change-C lines appeared in any of the 10 runs.
Standalone quiz mode, run repeatedly (5 runs to first hit): run 5 selected
**"Οι Σοφιστές δίδασκαν πώς να κερδίζεις, όχι πώς να έχεις δίκιο. Θα σας
φανεί χρήσιμο."** — confirms the line still fires there.

**4. Inverse.** `ls client/public/voice | wc -l` → **283**, unchanged.
`git diff` shows only: two new `Set` constants + two function-signature
additions in `server/src/socrates.ts`, two call-site arg additions in
`server/src/phases.ts`, the title/tagline pair in `shared/src/index.ts`,
and a doc-comment update in `server/src/modes/full.ts` — no line string was
edited or removed from `GAME_INTRO_LINES` or `STAGE_INTRO_LINES.quiz`.

## Typecheck

`npm run typecheck` (shared + server + client) — clean, no errors.
