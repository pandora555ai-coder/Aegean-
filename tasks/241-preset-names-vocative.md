# Task 241 — preset-only Greek names, vocative lookup, and lane width for long names

Context: HEAD `89cf2f5`, clean tree. `npm run typecheck` passes across
shared + server + client throughout.

## Diagnosis (reported first, per the task brief — nothing resolved here)

- **Current preset list**: `shared/src/index.ts` `PRESET_NAMES`, **165 names**
  (not "~150" as its own comment claimed), masculine block then feminine
  block, no vocative forms, no per-name gender tag.
- **Bot names**: a SEPARATE, hardcoded 10-name array (`server/src/bots.ts`
  `BOT_NAMES`), cycled by `i % BOT_NAMES.length` — NOT drawn from
  `PRESET_NAMES` and NOT "from the end" the way avatars are. All 10
  happened to also appear in `PRESET_NAMES`, but nothing enforced that.
- **Custom name input**: today's FALLBACK, not the default. Task 26 already
  built a two-step preset-name-then-avatar picker (search box, tap a name,
  no live grey-out) with "Άλλο όνομα" opening a free-text field
  (`sanitizeCustomName`, `MAX_NAME_LENGTH = 12`). **No name-uniqueness at
  all** — `shared/src/index.ts` carried an explicit comment: "NAME_TAKEN is
  gone (Task 26) - names may repeat now that identity is name+avatar
  together." Avatars, by contrast, already had live grey-out via
  `room:peek`/`ROOM_PEEK_RESULT.takenAvatarIds` and real `AVATAR_TAKEN`
  join rejection.
- **Diff, current 165 vs. the new 98(→99)-name list**: the new list is
  NOT a subset — 102 current names are dropped, 36 are new. Full lists are
  in the diagnosis transcript (not reproduced here to keep this short); the
  36 additions are mostly short/nickname forms (Μήτσος, Λάκης, Σάκης,
  Μπάμπης, Άρης, Θωμάς, Χάρης, Βάσω, Εύα, Χαρά…) that weren't in the old
  list at all.
- **Count discrepancy in the task brief itself**: the brief says "98 names"
  and labels ΠΑΝΑΓΙΩΤΗΣ "11 chars" — actual counts, verified by script:
  the given list is **53 male + 46 female = 99 names**, and ΠΑΝΑΓΙΩΤΗΣ is
  **10 characters**. Implemented as given (99 names), not resolved/trimmed
  to 98 — Argyrios's call if a name should come out.
- No "vocative" or "κλητική" handling existed anywhere in the codebase
  before this task (confirmed by grep). Two existing comments
  (`socrates.ts`, `StealView.tsx`/`ControllerScreen.tsx`) explicitly
  document that grammatical case/gender was deliberately never attempted.
  **No second-person, name-bearing address existed anywhere in the client
  either** (checked every `joined.name`/`myName` usage) — the closest thing
  was the LOBBY waiting screen's `<div>{joined.name}</div>` title, which is
  a label, not a sentence addressing the player.

## Implementation

### A — preset-only names, live grey-out, bot claiming

- `shared/src/index.ts`: `PRESET_NAMES` replaced wholesale with the given
  99-name list (53 male, 46 female), in the order given.
- `JoinRejectedReason` gets `NAME_TAKEN` back; `RoomPeekResultPayload`
  gains `takenNames: string[]` alongside `takenAvatarIds`.
- `server/src/state.ts`: `isValidPlayerName` now also requires PRESET_NAMES
  membership (no more free text can pass); new `isNameTaken`/
  `allPresetNamesTaken`, exact mirrors of `isAvatarTaken`/
  `allAvailableAvatarsTaken`.
- `server/src/index.ts`: `ROOM_PEEK` echoes `takenNames`; `PLAYER_JOIN`
  rejects `NAME_TAKEN` the same way it already rejects `AVATAR_TAKEN`
  (with the same pool-exhaustion escape hatch, inert in practice at 99
  names / `MAX_PLAYERS=8`).
- `server/src/bots.ts`: `BOT_NAMES` deleted; bots now claim
  `PRESET_NAMES[PRESET_NAMES.length - 1 - i]` — the exact "from the end"
  convention Task 223 already used for avatars, one line above it.
- `client/src/screens/ControllerScreen.tsx`: custom-name mode, its state
  (`customNameMode`/`customDraft`), handlers, JSX, and the now-dead
  `customNameButton` style all removed. The name list gets the same
  `data-taken`/disabled treatment the avatar grid already had, driven by a
  new `peekedTakenNames` state fed by `ROOM_PEEK_RESULT.takenNames`, plus a
  `namePoolExhausted` escape hatch mirroring the avatar grid's
  `poolExhausted`. `NAME_TAKEN`/`INVALID_NAME` rejections drop the pick and
  send the player back to the name step, mirroring `AVATAR_TAKEN`.

### B — vocative lookup

- `shared/src/index.ts`: `VOCATIVE_FORMS` — an explicit
  `Readonly<Record<string,string>>`, one entry per `PRESET_NAMES` name (no
  runtime regex), generated from the stated rule (drop final Σ for
  masculine -ΟΣ/-ΗΣ/-ΑΣ names, feminine unchanged, ΞΕΝΟΦΩΝ unchanged,
  ΦΙΛΙΠΠΟΣ→ΦΙΛΙΠΠΕ as the one exception) and verified by script that every
  masculine entry but ΞΕΝΟΦΩΝ ends in `ς`. `getVocative(name)` looks it up,
  falling back to the input unchanged (defensive only).
- Since no second-person surface existed, one was added: the LOBBY waiting
  screen's title (`ControllerScreen.tsx`) is now a real greeting —
  `` `Καλώς ήρθες, ${getVocative(joined.name)}!` `` — tagged
  `data-testid="lobby-greeting"`. Every third-person surface (SophistsRow
  plaques, `StealView`'s `steal-thief`/`steal-thief-gain`/
  `steal-victim-loss`, `ControllerScreen`'s own steal text, `PodiumView`)
  was left untouched — none of them called `getVocative`, and none needed
  to.

### C — long names on the four surfaces

No code changes were needed here (see Results) — Task 242, landed after
241 was queued but before it ran, already gave both `SophistsRow`'s plaque
(`nameFontSizeCqh`, Task 224/235b) and `AnavasisScene`'s duel/climb lanes
(`laneNameFontSizeCqh`) a shrink-to-fit formula; `PodiumView`'s own
`.podium-name{max-width:44cqw}` plus its already-generous font sizing
had headroom to spare. All three were re-measured against the REAL new
names (not old synthetic 4/8/12-char stand-ins) to confirm they still hold.

## Files

- `shared/src/index.ts` — `PRESET_NAMES` (replaced), `VOCATIVE_FORMS` +
  `getVocative` (new), `JoinRejectedReason`, `RoomPeekResultPayload`,
  `Player.isPresetName` comment
- `server/src/state.ts` — `isValidPlayerName` (strengthened),
  `isNameTaken`/`allPresetNamesTaken` (new)
- `server/src/index.ts` — `ROOM_PEEK`, `PLAYER_JOIN` handlers
- `server/src/bots.ts` — `BOT_NAMES` deleted, bot naming now off `PRESET_NAMES`
- `client/src/screens/ControllerScreen.tsx` — custom-name mode removed,
  name grey-out added, lobby greeting is now vocative
- `dev/241-name-check.ts`, `dev/241-steal-check.ts` — new Playwright/socket
  harnesses (criteria 2/3/4 below)

## Results

Verified with two harnesses, real in-process server + real Vite client +
real Playwright pages (TV at 1280x720, phone at 360x640) + raw
socket.io-client "bot-like" auto-answering players — never screenshots,
numbers only.

### Criterion 2 (A) — `npx tsx dev/241-name-check.ts`, section A

```
ok   no custom-name-toggle in the DOM — count=0
ok   no custom-name-input in the DOM — count=0
ok   name-list renders all 99 PRESET_NAMES entries — count=99
ok   a name taken by phone 1 greys out on phone 2 — synced 623ms after join
ok   the greyed-out name is actually untappable on phone 2
ok   bot names are drawn from the END of PRESET_NAMES
ok   a human front-of-list name never collides with a bot room
```

(First run's bot-name check failed on a false alarm: it compared the
`room.players` Map's ITERATION order — which follows async socket-connect
arrival, not spawn index — against a strict positional expectation. Fixed
by comparing as sorted sets; the underlying server logic was correct both
times.)

### Criterion 3 (B) — `dev/241-name-check.ts` sections B/B2 + `dev/241-steal-check.ts`

Six real joins, each read back via the phone's own `lobby-greeting`:

```
"Παναγιώτης" -> "Καλώς ήρθες, Παναγιώτη!"
"Ξενοφών"    -> "Καλώς ήρθες, Ξενοφών!"
"Φίλιππος"   -> "Καλώς ήρθες, Φίλιππε!"
"Ευαγγελία"  -> "Καλώς ήρθες, Ευαγγελία!"
"Μαρία"      -> "Καλώς ήρθες, Μαρία!"
```

Same six names in one real game (quiz, `finaleMode:'trial'`), checked at
every third-person surface:

- **Plaques** (SophistsRow, TV): `ΠΑΝΑΓΙΩΤΗΣ ΞΕΝΟΦΩΝ ΦΙΛΙΠΠΟΣ ΕΥΑΓΓΕΛΙΑ
  ΜΑΡΙΑ ΑΡΗΣ ΚΥΡΙΑΚΟΣ` — nominative throughout, `ΦΙΛΙΠΠΕ` never appears.
- **STEAL banner** (host, separate run with default `gameLength` so the
  Η Συκοφαντία stage actually occurs — see note below): `steal-thief`
  read `"Φίλιππος"` — nominative, not `"Φίλιππε"`.
- **Podium**: `Ευαγγελία Φίλιππος Άρης Ξενοφών Μαρία Παναγιώτης Κυριάκος`
  — nominative, `Φίλιππε` never appears.

All **ok** — no vocative form leaked into any third-person surface.

### Criterion 4 (C) — same game + two dedicated runs

- **Plaques**: `ΠΑΝΑΓΙΩΤΗΣ` — fontSize 11.088px, scrollWidth 86 ==
  clientWidth 86 — full text, no ellipsis. `ΚΥΡΙΑΚΟΣ` (8 chars, the
  224/235b baseline) — **13.86px**, unchanged (the formula is `cqh`-based
  off the fixed 1280×720 TV viewport, so it's independent of player count —
  6 vs. this run's 7 players makes no difference to the math).
- **Podium**: `Παναγιώτης` and `Ευαγγελία` both render in full
  (scrollWidth == clientWidth for every one of the 7 names).
- **Duel lane** (17cqh = 122.4px rendered): `ΠΑΝΑΓΙΩΤΗΣ` plaque 109.6px,
  `ΕΥΑΓΓΕΛΙΑ` 104.8px — both under the lane width, full text.
- **Climb lane** (8cqh = 57.6px rendered — matching the task brief's own
  figure exactly): `ΠΑΝΑΓΙΩΤΗΣ` plaque 52.9px, `ΕΥΑΓΓΕΛΙΑ` 48.1px, `ΑΡΗΣ`
  (4 chars) 43.6px, `ΚΥΡΙΑΚΟΣ` 49.7px — all under the lane, all full text,
  no plaque spills its lane. **The existing shrink-to-fit formula
  (`laneNameFontSizeCqh`, landed in Task 242) was sufficient — no lane
  widening or two-line names were needed**, so neither alternative was
  pursued.

All four surfaces: **ok**, full text, no ellipsis, for both the 10-char
and 9-char stress names plus a 4-char control.

### One finding outside the named scope, documented not fixed

`ΞΕΝΟΦΩΝ` (7 characters — at `NAME_BASE_CHARS`, so the plaque formula never
shrinks it) contains three wide glyphs (Ξ, Φ, Ω) and measured
**scrollWidth 90px vs. clientWidth 86px** on the SophistsRow plaque only —
a real 4px ellipsis clip, invisible to a `.textContent()` check but real on
screen. Task 224/235b's wide-glyph compensation only applies past
`NAME_HARMONIC_MAX_CHARS`; nothing accounts for a wide-glyph name sitting
exactly at the flat-size threshold. Not touched here: ΞΕΝΟΦΩΝ was named by
the brief only for the vocative test (B), not the four-surface fit test
(C, scoped to ΠΑΝΑΓΙΩΤΗΣ/ΕΥΑΓΓΕΛΙΑ/a 4-char name), and the shared
`nameFontSizeCqh` formula carries pinned, previously-measured baselines
(the 13.86px above included) that a broader change risks disturbing.

### Second finding outside scope: `gameLength` gates standalone quiz's STEAL stage

Setting `gameLength:'short'` on a standalone `quiz` room (not just `full`)
was observed to skip stage 3 (Η Συκοφαντία / STEAL) entirely — a `short`
game went `Η Αγορά (3q) → Οι Σοφιστές (5q) → Η Δίκη`, never reaching
STEAL, where the default (`long`) settings ran all `3+5+4=12` questions
including STEAL. This is pre-existing behaviour, unrelated to names, and
is why the STEAL check above needed its own small standalone harness
(`dev/241-steal-check.ts`) with default settings rather than reusing the
`short` game already used for the plaque/podium checks.
