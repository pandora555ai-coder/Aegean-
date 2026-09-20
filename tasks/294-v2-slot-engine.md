# Task 294 — v2 slot engine: speak at slots, silence per-reveal (Opus, branch `speech-policy`)

Branch `speech-policy`, started at HEAD `a7431a6` (Task 293), tree clean. No deploy.

Naming (binding): quiz-stage = display **«Η Αγορά»**; `modes/agora.ts` = display **«Η Λήθη»**.

The v2 speech path, gated on `room.settings.speechPolicy === 'v2'` (Task 292's setting).
v1 is the exact original call at every site — the gate is a ternary whose false branch is
the untouched expression, so v1 is unchanged BY CONSTRUCTION, not merely by observation.

---

## 1. The v2 gate at the four retired sites, and the slot dispatch table

**Gated at the PICKER, not at the beat.** The picker CONSUMES lines (`state.usedLines` is
game-scoped) and several v2 slots draw from those same reservoir pools, so gating only the
beat would have quietly emptied the reservoir for beats that never play. Gating the picker
also makes "no per-reveal beat" structural: with no line, every downstream
`startSocratesIfLineFired` / `continueAfter*Reveal` falls through on its existing null check.

| # | Retired v1 site | file:line | Gate |
|---|---|---|---|
| 1 | quiz reveal engine (`endQuestion`) | `server/src/phases.ts:890` | `const pickedLine = speechV2(room)` `? null : recordRoundAndPickLine(...)` |
| 2 | Η Λήθη (`endAgoraQuestion`) | `server/src/modes/agora.ts:427` | `const pickedLine = speechV2(room)` `? null : recordRoundAndPickLine(...)` |
| 3 | draw DRAW_MOMENT (`endGuessRound`) | `server/src/modes/draw.ts:908` | `state.pendingSocratesLine = speechV2(room)` `? null : recordDrawGuessRoundAndPickLine(...)` |
| 4 | numeric (`endNumericQuestion`) | `server/src/modes/numeric.ts:354` | `state.pendingSocratesLine = speechV2(room)` `? null : recordNumericRoundAndPickLine(...)` |

**KEPT in v2**, unchanged: GAME_INTRO sequence, every STAGE_INTRO, the anavasis sequence,
the coronation (WINNER), DRAW_WINNER (now the draw close slot), and DRAW_INTRO — but
**once per stage rather than once per cycle** (`modes/draw.ts:358`: v2 asks for the intro
line only while `state.cycleIndex === 0`). Observed as DRAW_INTRO 1 in v2 vs 2 in v1.

**Slot dispatch** — slot → hook (file:line) → pool set → target rule. Pools marked
*(reservoir)* are existing v1 pools reused; the rest are Task 294's new ones.

| Slot | Hook | Pools (best / worst) | Target rule |
|---|---|---|---|
| `QUIZ_MID` | `phases.ts:542` via `continueAfterReveal` | — / `AGORA_WORST` | prefers WORST; fires on the reveal completing the stage's first half (`isQuizMidpoint`) |
| `QUIZ_CLOSE` | `phases.ts:539` | `RUNAWAY_LEAD` *(res.)* / `STUCK_IN_LAST` *(res.)* | prefers BEST; fires after the stage's last reveal |
| `SYKO_FIRST_STEAL` | `phases.ts:534` | `SYKO_FIRST_STEAL` | the thief (max `stealTaken`), once-latched per stage |
| `SYKO_CLOSE` | `phases.ts:539` | `SYKO_CLOSE_THIEF` / `SYKO_CLOSE_VICTIM` | thief, or the victim (max `stealGiven`) if the thief was already named |
| `BLITZ_MID` | `modes/blitz.ts:404` | `PALAISTRA_MID_BEST` / `PALAISTRA_MID_WORST` | prefers BEST; between the stage's two swipe windows |
| `BLITZ_CLOSE` | `modes/blitz.ts:404` | `PALAISTRA_CLOSE_BEST` / `PALAISTRA_CLOSE_WORST` | prefers WORST |
| `DRAW_MID` | `modes/draw.ts:568` | `RUNAWAY_LEAD` *(res.)* / `STUCK_IN_LAST` *(res.)* | prefers BEST; between cycles |
| `NUMERIC_CLOSE` | `modes/numeric.ts:155` | `RUNAWAY_LEAD` *(res.)* / `STUCK_IN_LAST` *(res.)* | prefers WORST |
| `LETHE_CLOSE` | `modes/agora.ts:219` | `LITHI_CLOSE_OBSERVER` / `LITHI_CLOSE_BLIND` | prefers BEST |

Table itself: `server/src/speechSlots.ts:76-88` (`SLOT_SPECS`) plus `:139-161`
(`stealCandidates`, which reads the ledger's steal columns rather than its extremes).
Targets come from Task 293's `stageExtremes` (ranked on the stage's score delta); **ties
leave null and the slot SKIPS** — never `GENERIC_TRANSITION`. A stage's mid and close
prefer OPPOSITE ends, which is what produces the alternation; the hard guarantee is
`ledger.targetedThisStage` (`stageLedger.ts`), cleared at the stage boundary.

Every slot beat rides the existing beat path: `startSpeechSlotBeat` (`phases.ts:508`) →
`enterSocratesBeat`, same ack, same backstop, same pause behaviour, under the calling
mode's OWN timer kind (the ack resolves its continuation from the mode's continuations
table by kind — `modes/registry.ts:66` — not from the closure, so `BLITZ_SOCRATES` was
added to `BLITZ_CONTINUATIONS`).

**One mechanism was required and is new:** `speechPolicy` on `host:create_room`
(`shared/src/index.ts:822`, applied `server/src/index.ts:731`). An all-bot room self-starts
inside CREATE_ROOM with no VIP (Task 217), so `vip:update_settings` is unreachable there —
exactly why Task 222 put `mode` on that same payload. Validation is `updateRoomSettings`'
own, not a second copy.

## 2. v2 bot run — `?bot=4&mode=full`, `speechPolicy=v2`

`SCENARIO=V2 npx tsx dev/294-speech-policy-check.ts` (in-process real server, port 3972,
room 7828). Server log: `room 7828 created with speechPolicy=v2`.

**All 9 slots fired — every one named a player, none fell back to a generic line:**

```
stage 1 QUIZ_MID         FIRED target=Σμαράγδα (+373)   pool=AGORA_WORST
stage 1 QUIZ_CLOSE       FIRED target=Ξανθίππη (+1878)  pool=RUNAWAY_LEAD (reservoir)
stage 2 BLITZ_MID        FIRED target=Χρυσάνθη (+300)   pool=PALAISTRA_MID_BEST
stage 2 BLITZ_CLOSE      FIRED target=Σμαράγδα (+75)    pool=PALAISTRA_CLOSE_WORST
stage 3 DRAW_MID         — pool RUNAWAY_LEAD (reservoir) exhausted for Χρυσάνθη
stage 3 DRAW_MID         FIRED target=Παρθένα (+530)    pool=STUCK_IN_LAST (reservoir)
stage 4 NUMERIC_CLOSE    FIRED target=Χρυσάνθη (+600)   pool=STUCK_IN_LAST (reservoir)
stage 5 LETHE_CLOSE      FIRED target=Ξανθίππη (+1122)  pool=LITHI_CLOSE_OBSERVER
stage 6 SYKO_FIRST_STEAL FIRED target=Χρυσάνθη (+793)   pool=SYKO_FIRST_STEAL
stage 6 SYKO_CLOSE       FIRED target=Ξανθίππη (−44)    pool=SYKO_CLOSE_VICTIM
```

**Beat list:** GAME_INTRO 10, STAGE_INTRO 9, SPEECH_SLOT 9, WINNER 3, DRAW_INTRO 1,
DRAW_WINNER 1 — **33 beats**, in order:
`GAME_INTRO×10, STAGE_INTRO, SLOT, SLOT, STAGE_INTRO, SLOT, SLOT, STAGE_INTRO, DRAW_INTRO,
SLOT, DRAW_WINNER, STAGE_INTRO, SLOT, STAGE_INTRO, SLOT, STAGE_INTRO, SLOT, SLOT,
STAGE_INTRO×3, WINNER×3`.

**Proof of no per-reveal beats: `REVEAL + DRAW_MOMENT + NUMERIC_MOMENT + AGORA_MOMENT = 0`**
(19 in each v1 control on the same harness).

**Alternation visible — mid target ≠ close target in every stage that has both:**
stage 1 Σμαράγδα (worst) → Ξανθίππη (best); stage 2 Χρυσάνθη (best) → Σμαράγδα (worst);
stage 6 Χρυσάνθη (thief) → Ξανθίππη (victim).

**Lines registered: `collectVoiceLineEntries()` 478 → 514, of which 36 are the slot pools**
(12 pools × 3, counted against `content/speech-policy-lines.md`: 36 spoken lines, 12 pool
headers). None has an mp3 until the October pass — the subtitle renders and the audio is
silent, and because a missing clip makes the client ack at ~0ms (Task 154) the beat ends
immediately rather than holding the unknown-clip backstop.

**`DRAW_MID` is the honest detail:** the reservoir pools are heavily depleted by the
deletion filter — measured against the real `isLineDeleted`: `RUNAWAY_LEAD` 9 authored/**1
alive**, `STUCK_IN_LAST` 9/**3**, `CLOSE_SCORES` 6/**0**, `HOT_STREAK_3` 8/**0**. So
`QUIZ_CLOSE` spent the single surviving RUNAWAY_LEAD line and `DRAW_MID` found it exhausted,
then fell to the other end rather than repeating or going generic. The four
reservoir-backed slots will mostly be silent until pools are written for them; the eight
new-pool slots are unaffected.

**Deterministic complement — `npx tsx dev/294-slot-probe.ts`, 16/16 checks** (pure, no
server/port, Task 293's probe pattern). It pins the rules a stochastic run can't be made to
produce on demand: mid→worst/close→best on a plain quiz stage and the reverse on blitz
(two different people both times), an all-tied stage → **null (silence)**, thief then
victim on Η Συκοφαντία, a slot refusing a second attempt, and the stage boundary clearing
both `targetedThisStage` and `firedSlots`.

## 3. TWO v1 runs vs TWO pre-change v1 runs

Same harness, `SCENARIO=V1`, `?bot=4&mode=full`. The pre-change pair ran with all tracked
changes stashed — verified mid-run: `speechV2` had **0** hits in tracked code, and neither
pre-change log contains a `created with speechPolicy` line (the old server has no such
field), so those two genuinely ran the old code.

| Beat kind | pre-1 | pre-2 | post-1 | post-2 |
|---|---|---|---|---|
| GAME_INTRO | 10 | 10 | 10 | 10 |
| STAGE_INTRO | 9 | 9 | 9 | 9 |
| DRAW_INTRO | 2 | 2 | 2 | 2 |
| DRAW_WINNER | 1 | 1 | 1 | 1 |
| WINNER | 3 | 3 | 3 | 3 |
| REVEAL | 10 | 10 | 8 | 10 |
| DRAW_MOMENT | 4 | 2 | 2 | 3 |
| NUMERIC_MOMENT | 2 | 2 | 2 | 3 |
| AGORA_MOMENT | 3 | 2 | 2 | 3 |
| **total** | **44** | **41** | **39** | **44** |

**All five STRUCTURAL kinds are identical across all four runs.** The four that move are the
outcome-dependent detectors, and the decisive point is that they move **within the
pre-change pair itself**, on byte-identical code: DRAW_MOMENT 4 vs 2, AGORA_MOMENT 3 vs 2.
That is the variance Task 293 documented (DRAW_MOMENT 4/2/3, NUMERIC_MOMENT 3/1/2) and is
why two runs a side were asked for — a bare one-vs-one diff would have read as a regression.

**Stated plainly rather than glossed:** `REVEAL = 8` in post-1 is the widest excursion and
the only one not matched inside the pre pair (both pre runs, and Task 293's three runs, sat
at 10). It is the same family — a REVEAL beat fires only when a moment both qualifies and
still has an unused line, under `MOMENT_FIRE_CAP` — and post-1 was the shortest show of the
four (39 beats). The structural argument stands independently: in v1 the gate's false
branch is the verbatim original call, so no v1 decision can read anything new. **0 slot
lines and 0 SPEECH_SLOT beats appear in any of the four v1 logs.**

One v1-visible change exists and is NOT a beat change: the host's LOBBY prefetch now lists
36 more hashes, all of which 404 and are dropped (Task 154). No pool a v1 picker reads was
touched — in particular `DUEL_LINES.DUEL_LOCKED` is still empty by design; Task 294's own
`DUEL_LOCKED` lines live in the separate `SPEECH_V2_LINES` table, so the v1 early-lock beat
stays silent. `SPEAR_OUT` and that `DUEL_LOCKED` pool are **registered only** — neither has
a hook in the phase machine (tasks/291 §4), which this task did not add.

## 4. INVERSE

- **`git diff --stat`:** 11 files modified, +514/−31 — the 10 code files (`server/src/`:
  `phases.ts` +124, `socrates.ts` +159, `modes/{agora,blitz,draw,numeric}.ts`, `index.ts`,
  `stageLedger.ts`, `state.ts`; `shared/src/index.ts` +14) plus `CLAUDE.md`, which gains
  the `speechSlots.ts` and `SPEECH_V2_LINES` entries. 4 new files:
  `server/src/speechSlots.ts`, `dev/294-speech-policy-check.ts`, `dev/294-slot-probe.ts`,
  and this report. **No client file is touched at all** — v2 needed no TV change, since
  `SocratesBeatKind: 'SPEECH_SLOT'` falls into the existing non-announce branch and
  renders as any ordinary beat does.
- **Typecheck ×3:** shared, server, client — clean, zero errors (run before the bot runs and
  again after the stash pop).
- **Harnesses unchanged:** `npm run agora:validate` — "VERDICT: no category exceeds 2x
  uniform skew"; `npm run blitz:draw-check` — pool 218, 15 + 15, overlap 0. Neither was
  edited.
- **`dev/277-splice-check.ts`: 24 passed, 0 failed** — still 24/24, unedited.
- **`main` and the tag are untouched:** `main` = `c87443a`, tag `v1.0-playtest` = `c87443a`.
  All work is on `speech-policy`. **No deploy.**
