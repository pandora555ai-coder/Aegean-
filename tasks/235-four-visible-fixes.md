# Task 235 — four small visible fixes

Verified against the already-running dev server (4001) + a freshly started
dev client (5173), and one throwaway socket-level harness (its own port
3988, cleaned up after use) for the full 7-stage `full`-mode trace. All
checks were real sockets + Playwright DOM reads (or, for C/D, real
`socket.io-client` payload capture) — no screenshots. Every throwaway
verification script and its logs were deleted after use.

## Changes

- `client/src/screens/host/StealView.tsx` — the resolved steal banner now
  shows two separate rows: thief name + `+amount`, victim name + `−amount`.
  Dropped "από τον/την" entirely (no declension guess needed).
- `client/src/screens/ControllerScreen.tsx` — rewrote all four steal-outcome
  phone strings (waiting/thief/victim/third-party) to drop every "Ο/Η"
  and "τον/την", keeping names nominative; the third-party case now states
  each side's own signed delta (`{thief} +{amount}  •  {victim} −{amount}`)
  instead of narrating one sentence with the sign floating in the middle.
- `client/src/components/SophistsRow.tsx` — `nameFontSizeCqh`: names over
  10 characters now get an extra per-character decay past Task 224's own
  harmonic formula (which is unchanged for names ≤10 chars, INCLUDING its
  exact 13.86px/8-char baseline). Fixes real clipping at 12 characters that
  224 never tested (it only measured 10-char names).
- No server-side change. C and D needed none — see below.

## 1. Steal banner — PASS

Real 6-player quiz game (2/2 previous questions no correct answer, so
stage 3's first steal fired on round 3), captured live:

TV (`steal-thief-gain`/`steal-victim-loss`, textContent — the visual layout
has a `gap: 1.25rem` flex space between name and amount that plain
`textContent` concatenates without):
```
"Νίκος+394"      (thief row: name, then +394)
"Θανάσης−394"    (victim row: name, then −394)
```
Phone, third-party spectator (`steal-outcome-detail`):
```
"Νίκος +394  •  Θανάσης −394"
```
Real payload: `attemptedAmount: 394, stolenAmount: 394` — thiefScore 3360,
victimScore 2571. Conservation: the full 394 moved, sign sits on the
correct row every time (thief always `+`, victim always `−`), no article
anywhere. An earlier round in a different run also exercised the
"spectator becomes victim, victim had 0 points" clamp path
(`stolenAmount: 0` against `attemptedAmount: 396`) with the same
unambiguous two-row shape.

## 2. TV scoreboard clipping — PASS

Real 6-player quiz LOBBY→QUESTION, Playwright `getComputedStyle`/
`scrollWidth`/`clientWidth` on `[data-testid="sophist-name"]`, 1280x720:

| name (chars) | fontSize (before) | fontSize (after) | clipped (before) | clipped (after) |
|---|---|---|---|---|
| ΑΒΓΔ (4) | 15.84px | 15.84px | false | false |
| ΕΖΗΘ (4) | 15.84px | 15.84px | false | false |
| ΑΒΓΔΕΖΗΘ (8) | 13.86px | 13.86px | false | false |
| ΙΚΛΜΝΞΟΠ (8) | 13.86px | 13.86px | false | false |
| ΑΒΓΔΕΖΗΘΙΚΛΜ (12) | 9.36px | 8.13px | false | false |
| ΝΞΟΠΡΣΤΥΦΧΨΩ (12) | 9.36px | 8.13px | **true** (scrollWidth 88 vs clientWidth 86) | false |

12-char clipping was real and reproduced live before the fix (wide-glyph
name only — the other 12-char name happened to fit even before). Zero
clipping at 12 chars after. 8-char baseline (13.86px, the 224 regression
target) is bit-for-bit unchanged.

## 3. Round-1 card + question dedupe — found already correct, nothing changed

Real `full`-mode game (bots=3, gameLength=short, finaleMode=trial), full
socket trace to GAME_OVER:

**C — round 1 card**: `stage:announce` DID fire for stage 1 with full data
(`{stage:1, totalStages:7, title:"Γύρος 1 — Η Αγορά", tagline:...}`) —
structurally identical to every later stage's card. What actually precedes
it: an 11-second `SOCRATES` (GAME_INTRO) beat plays FIRST, with no round
indicator of any kind, and ONLY THEN does the stage-1 card appear. Every
LATER stage transition shows its own "ΓΥΡΟΣ N/7" card as the very next
thing with no such preamble (`enterStage` → `enterStageAnnounce` directly,
`modes/full.ts:178-190`). So "round 1 opens cold" is real, but the cause is
the ORDER GAME_INTRO and the stage-1 announcement fire in
(`enterQuestionOrPowerUp`, `server/src/phases.ts:274-286`) — reordering
that is a phase-machine change. Per this task's own instruction ("if any
item turns out to require touching the phase machine, skip it and
report"), **not fixed**.

**D — question pool dedupe**: 19 quiz+trial question texts captured across
the whole game (4 quiz, both stages sharing one pre-shuffled array sliced
by stage; 15 trial, drawn via `getUnusedQuestionSet` against every quiz id
already used) — **19 unique, 0 duplicates**. Checked the full 899-question
bank separately for the stated baseline text ("δεύτερη μεγαλύτερη πόλη
της Ελλάδας"): exactly one entry exists in the whole file, and a
full-bank scan found zero duplicate `question` text across any two
different ids. Dedupe already holds by construction (`loadQuestions`
rejects duplicate ids at boot; `getQuestionSet` is called once for both
quiz stages combined; `getUnusedQuestionSet` excludes every id already in
`room.questions`; trial and climb are mutually exclusive per game) —
**no code change was needed**; could not reproduce the stated baseline.

## 4. Inverse checks — PASS

- Plaques (SophistsRow) at 6 players, 8-char name: **13.86px**, matching
  the Task 224 baseline exactly.
- Steal scoring itself: unchanged (`steal.ts` untouched) — the real round
  above shows `stolenAmount === attemptedAmount` when the victim could
  cover it, and the clamp path (0 available) still zeroes correctly.
  `git diff --stat` confirms `server/src/steal.ts` has no changes.
- No server file changed in this task at all — `git diff --stat` shows
  only the three client files listed above.

## Found, not fixed (out of scope / explicitly excluded)

- C's root cause (GAME_INTRO before the stage-1 card, unlike every later
  transition) requires reordering calls in `server/src/phases.ts`
  (`enterQuestionOrPowerUp`) — a phase-machine change, excluded by this
  task's own instructions.
