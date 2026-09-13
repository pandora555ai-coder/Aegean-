# Task 244 — the climb's entry narration renders the quiz scene (wreath family #4)

## The defect

During Η Ανάβασις' entry window — the stage-announce card plus the three
`ANAVASIS_INTRO_SEQUENCE` rule lines (Task 236), before any CLIMB payload —
the TV rendered `TheatreScene` and the wreathed `SophistsRow`.

`isClimbFinale` (HostScreen) is the ONE flag that swaps in the Anavasis
world, and it was set only by a climb/duel payload: `climb_question:show`,
`climb_reveal:show`, `duel_pick:show`, `duel_reveal:show` (live handlers and
their `state:sync` cases). The climb's own card is emitted by
`enterStageAnnounce` from `startClimb` (phases.ts) and the rule lines are
plain `SOCRATES` beats, so nothing in that whole window identified the stage
as the climb. Fourth member of the family Tasks 227 (×2) and 237 (×1)
documented; diagnosed in 237 and left as "known, not fixed" because fixing it
needs a server-side signal.

Reproduced at HEAD (0a4fe67) by `npm run climb:lane-check`: **21 passed, 1
failed**, the failure being check 3 (the SophistsRow wreath watcher).

## The fix

An additive field on the two payloads that can be on screen during that
window — no phase-machine reordering, no new event:

- `StageAnnouncePayload.finale: FinaleMode | null` (shared) — set by
  `buildStageAnnounce` (payloads.ts) from the same `room.climb`/`room.trial`
  the card's WORDS already swap off. `buildStageAnnounce` is also the
  `state:sync` builder (index.ts:447), so a TV reloading on the card gets it.
- `SocratesShowPayload.finale: FinaleMode | null` (shared) — set by
  `buildSocratesPayload` the same way. The rule lines are ordinary SOCRATES
  beats, so a TV reloading mid-narration syncs into `SOCRATES` with no card
  and no CLIMB payload; without this it came back to the theatre.

Client (HostScreen): `handleStageAnnounce`, `handleSocratesShow` and both
`state:sync` cases set `isClimbFinale` when `finale === 'climb'`. A new
`isClimbAnnounceBeat` joins `showAnavasisWorld`; `SocratesFigure`'s temple
pose now also covers `STAGE_ANNOUNCE` under `climbFinale`, so he is not
planted mid-stair at 44% for the card and glided to 57% when the narration
starts.

Scoping is by construction: `resetRoomForNewGame` clears
`room.climb`/`room.trial`, so game 2's stage 1 announces `finale: null`, and
every ordinary stage card already returns `null` from the other branch.

### Task 239 regression avoided

Once `isClimbFinale` is true at the card, `renderPhaseView`'s SOCRATES branch
(`!isClimbFinale`) stops rendering — which would have silently dropped Task
239's subtitle AND the card underneath it for the three rule lines. A new
branch renders those two pieces directly (the same two `SocratesView`
composes, without its `GameLayout` shell, which `AnavasisChrome` would
duplicate). The climb's WINNER beat still falls through to nothing, exactly
as Task 237 left it.

## Files

- `shared/src/index.ts` — `finale` on `StageAnnouncePayload`, `SocratesShowPayload`
- `server/src/payloads.ts` — `buildStageAnnounce` (both branches), `buildSocratesPayload`
- `client/src/screens/HostScreen.tsx` — 4 setters, `isClimbAnnounceBeat`,
  `showAnavasisWorld`, the climb STAGE_INTRO render branch, one import
- `client/src/components/SocratesFigure.tsx` — temple pose covers `STAGE_ANNOUNCE`
- `client/src/screens/DevSceneScreen.tsx` — two static mocks get `finale: null`
- `dev/climb-entry-check.ts` — NEW harness (criteria 1, 3, 4i, 4ii)

## Results

Context: HEAD `0a4fe67`, clean tree. `npm run typecheck` passes across
shared + server + client.

### Criterion 2 — the existing climb suites

| suite | at HEAD | at HEAD+fix |
| --- | --- | --- |
| `npm run climb:lane-check` | 21 passed, **1 failed** (check 3, the wreath watcher) | **22 passed, 0 failed** |
| `npm run climb:staging-check` | 35/35 | **35 passed, 0 failed** |
| `npm run climb:ceremony-check` | 94/94 | **94 passed, 0 failed** |

lane-check's check 3 at HEAD+fix now reads:

```
ok   3: the SophistsRow wreath never appeared at any point during the climb — no sightings
ok   3: the CEREMONY wreath is present at GAME_OVER — count=1, winner="Άλφα"
ok   3: the ceremony crowned the forced winner (Άλφα) — winner banner "Άλφα"
```

### Criterion 4iii — all climb terminal paths (staging-check's own table)

Every path reports the same shape: the scene never leaves the temple, the
row wreath is gone, exactly the ceremony wreath remains, and Socrates is
seen at 57% (the temple threshold) and nowhere else for the whole finale.

```
  1:    scene=temple, duel overlay=false, ceremony wreath=1, row wreath=0, winner="Άλφα",  figures=4
  3:    scene=temple, duel overlay=false, ceremony wreath=1, row wreath=0, winner="Βήτα",  figures=4
  4-P3: scene=temple, duel overlay=false, ceremony wreath=1, row wreath=0, winner="Άλφα",  figures=3
  4-P4: scene=temple, duel overlay=false, ceremony wreath=1, row wreath=0, winner="Βήτα",  figures=3
  4-P5: scene=temple, duel overlay=false, ceremony wreath=1, row wreath=0, winner="Άλφα",  figures=4
  4-P6: scene=temple, duel overlay=false, ceremony wreath=1, row wreath=0, winner="Δέλτα", figures=4
  4-P7: scene=temple, duel overlay=false, ceremony wreath=1, row wreath=0, winner="Άλφα",  figures=3
  (each also: "Socrates left% seen across the whole finale: [57]")
```

Scenario 2/B prints no terminal row — it is the slab-vs-leader geometry
check, not a terminal path.

### Criterion 1 — the climb entry timeline at HEAD+fix

One real `?bot=1&mode=full` show, played end to end (`gameLength: 'short'`,
`finaleMode: 'climb'`), TV in a real browser at 1280x720, scene sampled
every 50ms plus a MutationObserver for single-frame flashes:

```
card "Η Ανάβαση" (stage 7/7, finale="climb")        @ 394.61s
rule-line beat #31 (STAGE_INTRO)                    @ 398.12s  "Το θέατρο τελείωσε. Κοιτάξτε πού στέκεστε."
rule-line beat #32 (STAGE_INTRO)                    @ 402.22s  "Δεν είστε όλοι στο ίδιο ύψος. …"
rule-line beat #33 (STAGE_INTRO)                    @ 411.54s  "Από δω και πέρα δεν μετράει τι ξέρετε. …"
first CLIMB_QUESTION                                @ 425.49s
```

Across that whole 30.9s window — 617 samples:

- worlds seen: **[temple]** — 0 theatre samples of 617
- **0** wreathed samples, and the MutationObserver recorded **no transition
  to VISIBLE** (baseline: wreath @~7.3-8.2s after the card, theatre
  throughout)
- the card was up in all 617 samples, the Task 239 subtitle in 547 of them
  (the three rule lines) — so the new direct-render branch works
- Socrates' `left%`, in chronological order:
  `[5, 8.1, 18.6, 35, 41, 47.7, 52, 54.8, 56.3, 57]` — a single ONE-WAY
  450ms glide from the stage-6 orchestra position to the temple as the card
  lands, then steady at 57%. Not the 57 → 5 → 57 round trip Task 237 fixed
  for the WINNER beat; the intermediate values are that one CSS transition
  sampled at 50ms.

### Criterion 4i — every other stage's announce

| stage | card | committed scene |
| --- | --- | --- |
| 1/7 | Γύρος 1 — Η Αγορά @ 0.31s | theatre (32 samples, row mounted in 32) |
| 2/7 | Γύρος 2 — Η Παλαίστρα @ 102.98s | theatre (32/32) |
| 3/7 | Γύρος 3 — Ζωγραφική @ 130.99s | theatre (32/32) |
| 4/7 | Γύρος 4 — Εκτίμηση @ 231.00s | theatre (32/32) |
| 5/7 | Γύρος 5 — Η Λήθη @ 285.91s | theatre (32/32) |
| 6/7 | Γύρος 6 — Η Συκοφαντία @ 345.72s | theatre (32/32) |

All six announce `finale=null` on the wire; exactly one card in the game
announced a finale.

### Criterion 4ii — play again

GAME_OVER at 443.05s (the climb was forced to a verdict by seeding steps, so
the run did not sit through up to 24 rounds — how it ended is irrelevant to
this criterion). After `vip:play_again` + `vip:start_game`:

```
game 2 stage 1/7 "Γύρος 1 — Η Αγορά" finale=null
committed scene: {"world":"theatre","wreathVisible":false,"card":true,"subtitle":false,"climbers":0}
```

The signal is reset — game 2 opens on the theatre, not the temple.

`npx tsx dev/climb-entry-check.ts` — **9 passed, 0 failed**.

### Criterion 3 — refresh resilience

A second real `?bot=1&mode=full` show (`RELOAD=on`, own ports 3922/5923, run
concurrently with the one above). Its climb card landed at 402.41s with
`finale="climb"`; the TV was reloaded twice inside the entry window:

```
reload ON THE CARD:
  before {"world":"temple","wreathVisible":false,"card":true, "subtitle":false,"climbers":0}
  after  {"world":"temple","wreathVisible":false,"card":true, "subtitle":false,"climbers":0}
reload DURING A RULE LINE:
  before {"world":"temple","wreathVisible":false,"card":true, "subtitle":true, "climbers":0}
  after  {"world":"temple","wreathVisible":false,"card":false,"subtitle":true, "climbers":0}
```

Both reloads come back into **AnavasisScene, not TheatreScene**, with no
wreathed row — the card reload via `buildStageAnnounce` (the sync's own
builder) and the rule-line reload via `buildSocratesPayload`, which is
exactly why the signal had to ride BOTH payloads. **4 passed, 0 failed.**

**Outside scope, documented not fixed:** after the rule-line reload
`card:false` — the stage-announce card underneath the subtitle is gone,
because `state:sync`'s SOCRATES case carries no card (HostScreen clears
`stageAnnounce` on sync and only a live `stage:announce` refills it). That
is pre-existing Task 239 behaviour for EVERY mode's announce beats, not
something this task introduced, and the criterion under test is the scene.
The subtitle itself survives, since it comes from the beat's own payload.
