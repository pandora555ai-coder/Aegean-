# Task 247 — winner gender + coronation wiring

`NAME_GENDER` (shared, 201 entries) plus the two surfaces that read it: the
winner screen's title (Ο ΣΟΦΙΣΤΗΣ / Η ΣΟΦΙΣΤΡΙΑ, replacing the fixed
Ο ΜΑΘΗΤΗΣ) and the WINNER beat's coronation line, which now has a masculine
and a feminine variant. The WINNER beat also gets Task 239's subtitle, which
it had never had.

## What changed

- **shared/src/index.ts** — `NAME_GENDER`, one `'m' | 'f'` per PRESET_NAMES
  entry, plus `genderForName` (null for an unknown name) and
  `winnerTitleForName`. The table was generated from the gender groups
  PRESET_NAMES is *already written in* — its own four `// masculine` /
  `// feminine` blocks — and never from a suffix rule. That is the whole
  point: see criterion 2, where a suffix rule cannot classify 32 of the 201.
- **server/src/socrates.ts** — `CORONATION_LINES` (m/f) and
  `pickCoronationLine(gender)`, which returns null for an unknown gender.
  Registered for `voice:generate` so the clips can be produced later.
- **server/src/phases.ts** — `winnerNameForBeat` + `pickWinnerBeatLine`. The
  three WINNER beat sites were byte-identical, so they collapse to ONE call;
  the differences between them live in the helper instead (the climb and the
  trial each declare a winner outright, while the plain quiz path has none
  computed yet and uses the score leader — and only if they lead ALONE).
- **client** — `GameOverView` and `AnavasisCrowning` render the gendered
  title; `HostScreen` adds `WINNER` to the climb's subtitle branch.

Two details worth keeping:

- `GameOverView` reads `standings[0].name`, NOT `winnerName`: on a tie the
  server joins winnerName with `" & "` (payloads.ts), which matches no
  NAME_GENDER entry. `AnavasisCrowning` can use `winnerName` directly because
  the climb crowns exactly one climber.
- HostScreen's new branch gates the stage CARD to the announce kinds only.
  `stageAnnounce` is never cleared on entering SOCRATES (Task 244), so adding
  `WINNER` to the existing branch unguarded would have put the Η Ανάβασις
  card back up over the crowning.

## Criterion 1 — 1:1 integrity, enforced not asserted

`dev/245-name-check.ts` now checks all three tables against each other in
BOTH directions for every pair (six checks), plus that every gender value is
exactly `m`/`f`. The old check looked only PRESET_NAMES → VOCATIVE_FORMS, one
way, so an entry added to one table alone would have passed unnoticed.

Counts: **PRESET_NAMES=201, VOCATIVE_FORMS=201, NAME_GENDER=201**; all six
directions "all 201 present"; suite **31 passed, 0 failed**.

Deliberately removing `'Νίκος': 'm'` and re-running: counts became
**201/201/200** and the suite went to **29 passed, 2 failed**, failing exactly
the two directions that should — `every PRESET_NAMES entry exists in
NAME_GENDER` and `every VOCATIVE_FORMS entry exists in NAME_GENDER`. The
reverse directions correctly still passed (all 200 present), which is the
right semantics: the smaller table is a subset, not a mismatch. Restored and
re-verified: byte-identical to the pre-removal backup (`diff -q` clean), 201
entries, counts back to 201/201/201, split back to m=98/f=103, and the suite
back to **31 passed, 0 failed**.

## Criterion 2 — gender correctness

Split: **m=98, f=103** (201 total).

A naive ending rule (-ΟΣ/-ΗΣ = m, -Α/-Η = f), with the tonos stripped first,
states the **WRONG gender for 0 names** and **cannot classify 32**. Stripping
the tonos first matters: without it Χαρά/Ζωή/Αγγελική/Παρασκευή and friends
read as unclassifiable purely because of an accent, which overstates the case
badly. So the honest finding is not that endings mislead — it is that for
these 32 they say nothing at all:

Κώστας, Ηλίας, Θωμάς, Μηνάς, Λουκάς, Ανδρέας, Ξενοφών, Οδυσσέας, Αχιλλέας,
Βάσω, Φωφώ, Μάρω, Κλειώ, Εμμανουήλ, Ιάσονας, Λεωνίδας, Πλάτωνας, Σάββας,
Σεραφείμ, Τρύφωνας, Ραφαήλ, Γαβριήλ, Κοσμάς, Παρασκευάς, Ορφέας, Μυρτώ,
Άρτεμις, Ελισάβετ, Θεανώ, Βίκυ, Ζωζώ, Φρόσω.

## Criterion 3 — observed from running games

`dev/247-winner-gender-check.ts`: a real server, a real Vite client, a real
browser TV, real player sockets; a climb seeded so one named player is crowned.

| winner | NAME_GENDER | on-screen label | line variant selected |
|---|---|---|---|
| Νίκος | m | **Ο ΣΟΦΙΣΤΗΣ** | "Σ' εσένα το λέω σοβαρά. **Σοφιστή**. Δεν το έχω πει ποτέ σε **κανέναν**… Πήγαινε να το πουλήσεις. Απόψε αξίζει." |
| Μαρία | f | **Η ΣΟΦΙΣΤΡΙΑ** | "Σ' εσένα το λέω σοβαρά. **Σοφίστρια**. Δεν το έχω πει ποτέ σε **καμία**… Πήγαινε να το πουλήσεις. Απόψε αξίζει." |

**Subtitle** — it renders, with the coronation text verbatim, confirmed in
both genders (Γιώργος m / Μαρία f):

> "Σ' εσένα το λέω σοβαρά. Σοφιστή. Δεν το έχω πει ποτέ σε κανέναν… Πήγαινε να το πουλήσεις. Απόψε αξίζει."
> "Σ' εσένα το λέω σοβαρά. Σοφίστρια. Δεν το έχω πει ποτέ σε καμία… Πήγαινε να το πουλήσεις. Απόψε αξίζει."

…but ONLY once the beat lasts long enough to see. See the finding below: at
natural timing it is on screen for a few milliseconds.

## Criterion 4 — inverse: the gender entry missing

With `'Νίκος': 'm'` deleted and Νίκος winning:

- **screen**: `Ο ΣΟΦΙΣΤΗΣ` — `winnerTitleForName` degrades to the masculine
  form, which is what that kicker said for EVERY winner before this task
  ("Ο ΜΑΘΗΤΗΣ"), so an unknown name is no worse off than it used to be.
- **beat**: fell back to the original `WINNER_LINES` pool — "Ο μαθητής
  βρέθηκε. Η γνώση, όπως πάντα, μας διέφυγε." — not a coronation variant, and
  not silence. `pickCoronationLine(null)` returns null and
  `pickWinnerBeatLine` takes the `??` branch.
- **subtitle**: rendered, and for ~9s, because that fallback line HAS audio
  (backstop 9066ms).

Nothing crashed and nothing rendered blank. The same path covers a TIE, where
there is no single winner to inflect for.

## Finding — the coronation beat is ~0ms until its audio exists

The coronation clips do not exist yet (this task's own scope). A missing clip
makes the host call `onEnded()` immediately (Task 154), so the WINNER beat
ends on that ack within milliseconds — it never reaches its 15000ms backstop.
The beat therefore *works*, but its brand-new subtitle is effectively
invisible: a 100ms DOM poll never caught it at natural timing, and only did
once the 404 was held back (`VOICE_DELAY_MS`, which changes no product code —
same missing-clip path, just not resolved instantly). Generating the two
clips fixes this on its own; no code change is implied. Documented, not fixed.

## Other discoveries — documented, not fixed

- The harness's `MutationObserver` never recorded anything, in any run — not
  even the seconds-long STAGE_INTRO subtitles a plain poll caught every time.
  `page.addInitScript` runs before the document exists, so touching
  `document.documentElement` there throws and aborts the rest of the script;
  deferring and wrapping the install did not revive it either. The 100ms DOM
  poll is what the harness reports, and the observer's count is kept beside
  it in the `[diag]` line so the disagreement stays visible.
- Moving the `localStorage` write below that observer setup broke the TV's
  host attachment outright (label `(never rendered)`) — which is what proved
  the throw was real rather than suspected.
