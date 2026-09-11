# Task 230 — regenerate intro + generate stage-intro lines, with audio tags

Audio generation only. Nothing wired into any pool, phase, or registry —
same scope discipline as Task 228/229.

## Tag vocabulary (Step 1)

`LINE_TAGS` (server/src/socrates.ts) holds exactly 254 entries, every one
tagged (0 untagged) — 11 distinct tags: `[dry]` 37, `[serious]` 42,
`[curious]` 32, `[amused]` 30, `[sarcastic]` 26, `[thoughtful]` 26,
`[deadpan]` 20, `[impressed]` 16, `[sighs]` 12, `[warm]` 9, `[laughs]` 4.
Format: square brackets, lower-case, single word, always prepended to the
spoken text with a space — `generate-voice-lines.ts`'s
`` `${tag} ${stripped}` ``. Three examples (template → spoken):
- `[serious]` "Πέντε συνεχόμενες. Αν πέσεις τώρα, θα πονέσει." → "[serious] Πέντε συνεχόμενες. Αν πέσεις τώρα, θα πονέσει."
- `[thoughtful]` "Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ." → "[thoughtful] Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ."
- `[warm]` "Καλώς ήρθατε στην Αγορά. Καθίστε, και μη βιαστείτε να μιλήσετε." → "[warm] Καλώς ήρθατε στην Αγορά. Καθίστε, και μη βιαστείτε να μιλήσετε."

My drafted tags used a richer vocabulary (warmly, dryly, sincere, measured,
mysterious, ominous, intense, urgent, wry, questioning, matter-of-fact,
solemn, grand) that doesn't exist in the bank, and one line (#16) had two
inline tags mid-sentence, which the bank's convention doesn't do (one tag,
prepended, per line). Adjusted every line to exactly one of the 11 existing
words:
warmly→warm, sincere→warm, dryly→dry, wry→dry, measured→thoughtful,
mysterious→thoughtful, ominous→serious, intense→serious, urgent→serious,
solemn→serious, grand→serious, questioning+matter-of-fact (line 16,
collapsed to one tag)→curious. `amused`, `sarcastic`, `curious` (elsewhere)
already matched and were kept as-is.

Voice ID `NOpBlnGInO9m6vDvFkFC`, model `eleven_v3`, via
`dev/voice/provider.ts` — same provider Task 228 used (no `style` field,
`mp3_44100_64` output), read from `.env` the identical way
`generate-voice-lines.ts` does. Filenames are `lineHash(text, tag)` —
Task 43's convention — so these lines drop into the standard bank layout
and are trivially wireable later without a rename.

## Generated lines (Step 2/3)

All 22 generated as separate files, verified with `ffprobe` (real decoded
duration, not the byte estimate):

| # | Group | Tag | File | Bytes | Duration |
|---|-------|-----|------|-------|----------|
| 1 | Εισαγωγή | warm | 35e4fb8b4163c1f6.mp3 | 16553 | 2.0s |
| 2 | Εισαγωγή | amused | 6dff7bac5460652f.mp3 | 79874 | 10.0s |
| 3 | Εισαγωγή | dry | 842169f9a829faaa.mp3 | 18434 | 2.3s |
| 4 | Εισαγωγή | sarcastic | a88a4ce657479a66.mp3 | 67753 | 8.4s |
| 5 | Εισαγωγή | warm | c47dc43c584f58b2.mp3 | 43511 | 5.4s |
| 6 | Εισαγωγή | thoughtful | 5ba8c95a8c49416b.mp3 | 86979 | 10.8s |
| 7 | Εισαγωγή | warm | 931e1a38950f65cf.mp3 | 49154 | 6.1s |
| 8 | Εισαγωγή | dry | 3e92ccdd463e2f28.mp3 | 26793 | 3.3s |
| 9 | Εισαγωγή | thoughtful | 16c6ea1676ae1cd9.mp3 | 99100 | 12.4s |
| 10 | Εισαγωγή | serious | 837d1d6393c61fb2.mp3 | 49781 | 6.2s |
| 11 | Παλαίστρα | serious | 4171b462473d2c7c.mp3 | 90114 | 11.2s |
| 12 | Παλαίστρα | serious | b55bbb406348b3b9.mp3 | 77366 | 9.6s |
| 13 | Παλαίστρα | amused | 15a41b1acf3b1073.mp3 | 61901 | 7.7s |
| 14 | Ζωγραφική | curious | 4b9a56cfe96d3269.mp3 | 53751 | 6.7s |
| 15 | Ζωγραφική | dry | 3dfea3c22bfefa6a.mp3 | 88233 | 11.0s |
| 16 | Εκτίμηση | curious | e4529417379f1c98.mp3 | 74231 | 9.2s |
| 17 | Εκτίμηση | amused | e827ecccaf3484e5.mp3 | 76739 | 9.6s |
| 18 | Η Λήθη | serious | 9e4102d2b03800ba.mp3 | 53751 | 6.7s |
| 19 | Η Λήθη | thoughtful | d5fa0083a1e96354.mp3 | 66499 | 8.3s |
| 20 | Η Ανάβασις | serious | 36ae9a28048b61c5.mp3 | 33271 | 4.1s |
| 21 | Η Ανάβασις | serious | a8ec509e4513305d.mp3 | 74858 | 9.3s |
| 22 | Η Ανάβασις | serious | b8399492286a98e1.mp3 | 111848 | 13.9s |

Totals: lines 1–10 (Εισαγωγή) = 537,932 bytes, 66.9s. Lines 20–22
(Η Ανάβασις) = 219,977 bytes, 27.4s. All 22 = 1,400,494 bytes, 173.5s.

Lines 9, 11, 15, 22 (12.4s/11.2s/11.0s/13.9s) exceed `SOCRATES_MAX_DURATION_MS`
(11000ms) — not a problem here (nothing plays them through the phase
machine), but flagged since any future wiring would need either a shorter
line or a widened backstop, per CLAUDE.md's "never raise the cap, shorten
the line" rule.

## Audition page (Step 3)

`client/src/screens/DevIntroLinesScreen.tsx` (Task 229's page, same route
`/dev/intro-lines`) — reworked into 6 grouped sections (Εισαγωγή,
Παλαίστρα, Ζωγραφική, Εκτίμηση, Η Λήθη, Η Ανάβασις), each line its own row
(number, tag, filename, duration, native `<audio>` player). The two
sequence groups (Εισαγωγή, Η Ανάβασις) each get their own "play all in
order" button; the four alternatives groups (Παλαίστρα, Ζωγραφική,
Εκτίμηση, Η Λήθη) are per-line audition only, no sequence control, per the
task's own grouping distinction.

Verified (Playwright, localhost:5173, dev server on 4001):
- 6 group sections, 22 line rows, 22/22 clips loaded, page-reported total
  173.5s — matches the ffprobe sum above.
- "Play all" on Εισαγωγή ran 1→10 in order: page-reported 75.5s (wall
  75.7s); 66.9s audio + 9×0.8s gaps ≈ 74.1s expected, remainder is
  headless-audio scheduling overhead, same pattern Task 229 measured.
- "Play all" on Η Ανάβασις ran 20→22 in order: page-reported 29.9s (wall
  30.4s); 27.4s audio + 2×0.8s gaps ≈ 29.0s expected.
- 0 console errors across both runs.
- Page: http://localhost:5173/dev/intro-lines (dev-only, not deployed by
  this task).

## Inverse (Step 4)

Voice bank: 271 files before this task → 283 after. Arithmetic: 271 − 10
(Task 228's untagged intro files, deleted after the 22 new ones verified
as valid decodable audio via `ffprobe`) + 22 (this task) = 283 — confirmed
by directory listing. The ten deleted hashes (untagged, `lineHash(text,
null)`): `7f2d66d6d53d0eb4`, `54aca0e610a5db0a`, `09e84ca59912d519`,
`f594a4de76f93812`, `96bc93a35558e23e`, `af1fd7d81ed79ab7`,
`f3b0211b4bf3ef87`, `99e69811562adf30`, `4eaa8d95482377db`,
`d0e47e114b87ee92`. No other file's mtime changed — a full `ls
--time-style=full-iso` pass shows exactly 22 files timestamped today, all
22 the newly generated ones; every other file in the bank (261, untouched)
carries its pre-existing timestamp.

## What's here

- `client/src/screens/DevIntroLinesScreen.tsx` — reworked for the 6 groups
  above; `client/src/devRoutes.tsx` untouched (route already registered by
  Task 229).
- No changes to `server/src/socrates.ts`, `generate-voice-lines.ts`, or any
  pool/registry. The one-off generator script used to produce the 22 mp3s
  was scratch, never committed (Task 228's own pattern).
