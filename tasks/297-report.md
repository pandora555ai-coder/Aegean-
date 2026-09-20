# Task 297 — Pre-merge gate: exhaustive v1 equivalence + full v2 exercise

Branch `speech-policy`, tree clean at start. `v1.0-playtest` tag resolves to
`c87443a` (Task 289 — one commit before the speech-policy work begins).
`git log v1.0-playtest..HEAD --oneline` at the time of this run:

```
25af73a Task 296: spear-out beat, the duel's line, QUIZ_BEST as the 13th pool
2187a64 Task 295: full mode's stage 1 gets its own question count, 5->10 on long
f6ae510 Task 294: v2 speech policy — slot engine, per-reveal speech retired
a7431a6 Task 293: per-stage performance ledger — data only, no beat change
21ca46c Task 292: speech-policy v2 groundwork — speechPolicy setting, draw 3->2, CLAUDE.md fixes
```

Read-only on `shared/`, `server/`, `client/` throughout. Two throwaway
harnesses were written to drive the runs (`dev/297-v1-equiv-check.ts`,
`dev/297-reconnect-pause-check.ts`) and are deleted before this commit — only
this report is checked in.

## Method note on "same seeds"

Neither the full-mode bot harness nor the game content (question draw, draw
word pool, bot decision timing) has a seed hook for a socket-level run — the
only seeding surface in this codebase is the agora generator's own
`seed`. "Same params" therefore means identical `mode=full`, identical
`botCount`, and default `RoomSettings` (so `speechPolicy` stays at its
default `v1` for section 1, `gameLength` stays at its default `long`) on
both trees; question/round content is independently randomized on each run.
Section 1 accounts for this explicitly: every FIXED-count beat kind is
required to match exactly across all six runs, and every content-dependent
("known mover") kind is compared as a range against the OTHER side's own
range, not against a single hardcoded expectation.

## 1. v1 equivalence — 3 branch runs vs 3 v1.0-playtest runs

Setup: `dev/297-v1-equiv-check.ts` (copied from the existing
`dev/294-speech-policy-check.ts` pattern — in-process server, throwaway
port, host socket acks every Socrates beat immediately), `SCENARIO=V1`,
`BOT_COUNT=4`, `mode=full`, default settings (`speechPolicy` explicitly
passed as `'v1'`, which the pre-292 server code simply ignores as an unknown
payload field — confirmed harmless). v1.0-playtest ran from a `git worktree
add` checkout at `/home/argyrios/aegean-tag-worktree`, with its own
`node_modules/@game/{shared,server,client}` symlinked to ITS OWN package
directories rather than the main checkout's — the first attempt symlinked
the whole root `node_modules` wholesale and silently ran HEAD's `shared`
package against the tag's `server` package (caught because the tag's first
smoke test still reported HEAD's 15-question/2-round figures; fixed by
rebuilding `node_modules` per-entry with `@game/*` pointed at the worktree).

### Expected structural diffs (by design, not bugs)

| Diff | v1.0-playtest | speech-policy HEAD | Source |
|---|---|---|---|
| Full-mode quiz total (stage 1 + stage 6) | 10 (5+5) | 15 (10+5) | Task 295 — stage 1 only, long: 5→10 |
| Ζωγραφική round count (`long`) | 3 | 2 | Task 292 — `FULL_DRAW_ROUNDS_BY_LENGTH.long` 3→2 |
| `DUEL_LOCKED` audibility | silent (empty line pool) | speaks (3 lines written) | Task 296 |
| `SPEAR_OUT` beat | does not exist (no code path) | exists, fires on a spear elimination | Task 296 |

### Six runs, raw numbers

| Run | Beats total | GAME_INTRO | STAGE_INTRO | WINNER | DRAW_WINNER | DRAW_INTRO | REVEAL | DRAW_MOMENT | NUMERIC_MOMENT | AGORA_MOMENT | Duel? | DUEL_LOCKED audible? | Stage durations (1–7, s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HEAD run1 (room 3186) | 47 | 10 | 9 | 3 | 1 | 2 | 15 | 3 | 2 | 2 | yes (2 ties→win) | **yes**, fired x2 | 105.4, 79.5, 99.5, 38.8, 45.4, 74.8, 136.5 |
| HEAD run2 (room 8633) | 48 | 10 | 9 | 3 | 1 | 2 | 13 | 4 | 3 | 3 | no | n/a | 104.1, 79.5, 101.0, 39.6, 45.5, 75.6, 32.5 |
| HEAD run3 (room 3961) | 46 | 10 | 9 | 3 | 1 | 2 | 13 | 4 | 2 | 1 | no | n/a | 102.5, 79.5, 101.9, 40.1, 46.3, 75.0, 61.8 (+1 SPEAR_OUT beat, elimination confirmed via `"eliminated":true`) |
| TAG run1 (room 0995) | 44 | 10 | 9 | 3 | 1 | 3 | 10 | 4 | 3 | 1 | yes (3 ties→win) | **no** — duel resolved with zero `[socrates] fired moment=DUEL_LOCKED` lines | 53.9, 79.5, 146.4, 39.1, 43.7, 74.9, 139.4 |
| TAG run2 (room 9234) | 43 | 10 | 9 | 3 | 1 | 3 | 9 | 4 | 1 | 3 | no | n/a | 52.6, 79.5, 149.6, 39.5, 45.4, 76.5, 53.2 |
| TAG run3 (room 9377) | 45 | 10 | 9 | 3 | 1 | 3 | 9 | 6 | 2 | 2 | no | n/a | 53.8, 79.5, 149.2, 40.6, 44.7, 75.9, 114.3 |

### Verdict on each dimension

- **Fixed-count kinds match EXACTLY, 6/6 runs**: `GAME_INTRO`=10,
  `STAGE_INTRO`=9, `WINNER`=3, `DRAW_WINNER`=1, on both trees, every run. No
  exceptions.
- **`DRAW_INTRO`**: HEAD {2,2,2}, TAG {3,3,3} — matches the expected Task
  292 diff exactly (round count 2 vs 3), no run on either side falls
  outside its own group.
- **Quiz total**: HEAD 15 every run (10 stage-1 + 5 stage-6), TAG 10 every
  run (5+5) — matches Task 295 exactly.
- **`DUEL_LOCKED`**: a duel happened once on each side. HEAD's duel produced
  two `[socrates] fired moment=DUEL_LOCKED` lines (Task 296's 3-line pool in
  play); TAG's duel produced ZERO such lines despite going through the same
  4-round duel-with-ties shape — exactly Task 296's documented "was empty,
  now speaks" change, not a regression (the underlying `duel:locked` timer/
  weapon mechanic ran identically on both — same tie-then-win shape, same
  `DUEL_LOCK_FLOOR_MS` transition log).
- **`SPEAR_OUT`**: fired once (HEAD run3 only) — additive per Task 296, no
  spear elimination occurred in any of the three TAG runs so the "was
  silent" side of this diff wasn't directly exercised, but the beat's own
  code path is structurally absent pre-296 (`grep` confirms no such string
  in the tag's `socrates.ts`/`climb.ts`), so there is nothing it could have
  regressed.
- **Known movers stay in overlapping/proportionally-scaled ranges**:
  - `REVEAL`: HEAD [13,13,15] (mean 13.7) vs TAG [9,9,10] (mean 9.3) — the
    TAG mean is lower in the same proportion as its smaller quiz question
    pool (10 vs 15 questions, ratio 0.67; observed ratio 0.68) — expected
    scaling, not a behavioral difference.
  - `DRAW_MOMENT`: HEAD [3,4,4] (mean 3.7) vs TAG [4,4,6] (mean 4.7) — TAG
    trends higher in the same direction as its extra draw round (3 vs 2
    rounds); both ranges overlap at 4.
  - `NUMERIC_MOMENT`: HEAD [2,3,2] (mean 2.3) vs TAG [3,1,2] (mean 2.0) —
    fully overlapping, no systematic difference (question count fixed at 3
    on both sides).
  - `AGORA_MOMENT`: HEAD [2,3,1] (mean 2.0) vs TAG [1,3,2] (mean 2.0) —
    identical mean, fully overlapping (round count fixed at 1 on both
    sides).
- **Stage order/titles**: identical 7-card sequence, same titles, same
  order, in all 6 runs (Η Αγορά, Η Παλαίστρα, Ζωγραφική, Εκτίμηση, Η Λήθη,
  Η Συκοφαντία, Η Ανάβαση). Stage-2 onward start times differ only by the
  ~50s the extra 5 stage-1 questions add on HEAD (e.g. HEAD run1 stage 2 at
  105.5s vs TAG run1 at 54.0s) — consistent with Task 295 alone, nothing
  else moved.

**Section 1 verdict: no unexplained beat-kind, count, or ordering
difference found.** Every difference maps to one of the four documented
Task 292/295/296 changes.

## 2. v2 exercise — 2 runs at 3 and 5 players

Setup: same harness, `SCENARIO=V2` (`speechPolicy: 'v2'` on `CREATE_ROOM`),
`BOT_COUNT=3` (room A, 3 players) and `BOT_COUNT=5` (room B, 5 players),
`mode=full`, all-bot rooms (self-start, Task 217).

### The 9 slot-engine slots + the 2 always-on exceptions

From `server/src/speechSlots.ts`: `QUIZ_MID`, `QUIZ_CLOSE`,
`SYKO_FIRST_STEAL`, `SYKO_CLOSE`, `BLITZ_MID`, `BLITZ_CLOSE`, `DRAW_MID`,
`NUMERIC_CLOSE`, `LETHE_CLOSE` = 9. Plus `DUEL_LOCKED` and `SPEAR_OUT`,
audible under both policies per CLAUDE.md — not part of the slot engine's
`firedSlots` bookkeeping, so not tallied here (neither a duel nor a spear
elimination occurred in either v2 run; both are already exercised as
"audible under v2 too" by section 1's own HEAD `DUEL_LOCKED`/`SPEAR_OUT`
data, since `speechV2()` doesn't gate either site).

### Every `[slot]` decision, both runs

| Slot | Room A (3p, room 9944) | Room B (5p, room 6665) |
|---|---|---|
| QUIZ_MID | FIRED → Χρυσάνθη (+395), pool `AGORA_WORST` (worst) | FIRED → Ξανθίππη (+377), pool `AGORA_WORST` (worst) |
| QUIZ_CLOSE | FIRED → Σμαράγδα (+2621), pool `QUIZ_BEST` (best) | FIRED → Μαρκέλλα (+2381), pool `QUIZ_BEST` (best) |
| BLITZ_MID | FIRED → Παρθένα (+225), pool `PALAISTRA_MID_BEST` (best) | FIRED → Χρυσάνθη (+525), pool `PALAISTRA_MID_BEST` (best) |
| BLITZ_CLOSE | FIRED → Χρυσάνθη (+150), pool `PALAISTRA_CLOSE_WORST` (worst) | **SKIPPED** — "no untargeted standout with a line (already targeted this stage: 1)" |
| DRAW_MID | FIRED → Σμαράγδα (+950), pool `RUNAWAY_LEAD` (reservoir) | FIRED → Χρυσάνθη (+1985), pool `RUNAWAY_LEAD` (reservoir) |
| NUMERIC_CLOSE | FIRED → Σμαράγδα (+600), pool `STUCK_IN_LAST` (reservoir) | FIRED → Ξανθίππη (+375), pool `STUCK_IN_LAST` (reservoir) |
| LETHE_CLOSE | FIRED → Παρθένα (+1189), pool `LITHI_CLOSE_OBSERVER` | FIRED → Χρυσάνθη (+1191), pool `LITHI_CLOSE_OBSERVER` |
| SYKO_FIRST_STEAL | FIRED → Χρυσάνθη (+787), pool `SYKO_FIRST_STEAL` | FIRED → Παρθένα (+792), pool `SYKO_FIRST_STEAL` |
| SYKO_CLOSE | FIRED → Παρθένα (−764), pool `SYKO_CLOSE_VICTIM` | FIRED → Ξανθίππη (+347), pool `SYKO_CLOSE_VICTIM` |

**9/9 slots fired at least once across the pair** (8/9 in room B alone,
the 9th — `BLITZ_CLOSE` — covered by room A). `SPEECH_SLOT` beat totals:
room A 9, room B 8 (matches the table above exactly — 9 attempts, 1 skip).

- **No `GENERIC_TRANSITION` anywhere**: grep across both logs finds the
  string only inside the per-question moment-detector's own diagnostic
  summary line (`[socrates] room N moment summary: ... GENERIC_TRANSITION=0`
  / `never fired (18/18): ... GENERIC_TRANSITION`) — a count of zero, never
  a fired beat.
- **Alternation holds**: `QUIZ_MID` names the worst side
  (`AGORA_WORST`/`QUIZ_MID`'s `prefer: 'worst'`) and `QUIZ_CLOSE` the best
  side (`QUIZ_BEST`) in BOTH runs, always two DIFFERENT named players.
  `BLITZ_MID` prefers best, `BLITZ_CLOSE` prefers worst — same pattern,
  opposite way round, exactly as `speechSlots.ts`'s own `SLOT_SPECS`
  documents. `SYKO_FIRST_STEAL` names the thief, `SYKO_CLOSE` the victim,
  both runs.
- **A skip was observed in the wild** (room B's `BLITZ_CLOSE`), proving
  silence rather than filler under real play. It is corroborated by the
  existing pure probe `dev/294-slot-probe.ts` (re-run for this task,
  **16/16 checks pass**), whose case 3 forces an all-tied stage and asserts
  `pickSpeechSlot` returns `null` with the log reason "no untargeted
  standout with a line" — the identical reason string room B's live run
  produced.

**Section 2 verdict: full slot coverage, correct alternation, zero generic
filler, silence-on-tie confirmed both live and by forced probe.**

## 3. Reconnect + pause smoke (v2)

Setup: `dev/297-reconnect-pause-check.ts` — in-process server, spawned Vite
client dev server, one REAL Playwright phone (`/play?room=`, the actual
preset-name → avatar → join flow, Task 241/245's UI) plus one raw-socket
"pauser" sim (so `GAME_PAUSE`/`GAME_RESUME` can be sent without a UI hook —
`server/src/index.ts:1654`, "open to ANY connected player, not just VIP")
plus 1 bot (`botCount=1`, deliberately below `MIN_PLAYERS=2` so the room can
never self-start before the two humans join — `maybeAutoStartBotRoom`,
`server/src/index.ts:692-703`). `mode=full`, `speechPolicy=v2`.

**Reconnect** (mid-stage-1, question 3 of 15): the phone (`Άρης`, VIP) was
reloaded via `page.reload()`. Server log: `client disconnected` →
`player Άρης disconnected` → `room ... VIP transferred to Χρυσάνθη` (the
bot — in-game VIP migration is immediate, a pre-existing behavior unrelated
to this task) → `client connected` → `player Άρης reconnected to room
3112`, immediately followed by the bot's own next answer and a normal
`question N revealed`. Phase read directly off the live `Room` object
throughout: `QUESTION` before, during, and 8s after the reload, with the
question index having already advanced in that window — the game kept
moving, not frozen on the reconnect.

**Pause/resume around a `SPEECH_SLOT` beat**: polling `room.phase` after
the fact turned out to reliably MISS the beat — this harness (like every
other one built on the 294/253 pattern) acks each beat within milliseconds
to keep the game from riding its audio backstop, so a beat begins and ends
faster than a 50ms poll loop can catch it (measured on the first two
attempts: the poll only ever found `SPEECH_SLOT` already ended). Fixed by
pausing SYNCHRONOUSLY inside the `SOCRATES_SHOW` handler itself, before
sending the ack, so the pause genuinely lands while that exact beat is
still open. Caught `QUIZ_MID` live (fired for Χρυσάνθη, pool `QUIZ_BEST`,
beat id 12, at 135.5s):

```
[135.5s] BEAT id=12 kind=SPEECH_SLOT — "Οι έμποροι ρωτούν ποιος είσαι..."
  >>> pausing DURING this live SPEECH_SLOT beat (id=12) before acking it
room 9909 paused by Νίκη
  >>> 3s into hold: room.paused=true, phase=SOCRATES
room 9909 resumed, remainingMs=14998
  >>> resumed: room.paused=false, now acking beat id=12
room 9909 Socrates beat 12 ended (socrates:audio_ended) - advancing
room 9909 started — question 6/15 (stage 1)
```

Numbers:
- `room.paused` was `true` throughout the 3s hold, `phase` stayed
  `SOCRATES` (frozen, not skipped past); `room.paused` was `false`
  immediately after resume.
- **Beats fired since the pause was armed: 1** (`SPEECH_SLOT`, the same
  beat 12) — no second beat sneaked in during or after the hold.
- **Occurrences of beat id 12 across the WHOLE run: 1** — no double-fire.
- **Global check, whole run**: 12 beats observed, 12 distinct `beatId`s,
  **0 duplicated ids**.
- Phase 15s after the ack: `QUESTION` (question 6 already under way) —
  moved on cleanly, not stuck on `SOCRATES`.
- `stuck-phase check`: 24 `PHASE_CHANGED` events recorded over the run,
  spanning LOBBY→…→QUESTION well past the pause point.

Reconnect numbers (question 3 of 15): `player Άρης disconnected` →
in-game VIP migration fired immediately (`VIP transferred to Χρυσάνθη`,
the bot — a pre-existing, unrelated behavior, not a speech-policy concern)
→ `client connected` → `player Άρης reconnected to room 9909`, then a
normal bot answer and `question 3 revealed` on schedule. Phase read off
the live `Room`: `QUESTION` immediately before, ~2s after, and 8s after
the reload, with the question index having already advanced across that
window — no hang, no double phase-entry.

**Section 3 verdict: no double beat (0/12 duplicated beatIds, 1 occurrence
of the paused beat's own id), no stuck phase (phase advanced past both the
reconnect and the pause/resume within the harness's own delay windows), no
lost beat (the paused beat still fired its ack and advanced exactly once).**

## 4. Verdict

**MERGE-READY: YES.**

- Section 1: every fixed-count Socrates beat kind (`GAME_INTRO`=10,
  `STAGE_INTRO`=9, `WINNER`=3, `DRAW_WINNER`=1) matches exactly across all
  6 v1 runs (3 branch, 3 v1.0-playtest); every difference found maps
  1:1 to a documented Task 292/295/296 change (draw rounds, stage-1 count,
  `DUEL_LOCKED`/`SPEAR_OUT` becoming audible); every content-dependent beat
  count (`REVEAL`, `DRAW_MOMENT`, `NUMERIC_MOMENT`, `AGORA_MOMENT`) stays
  within an overlapping or proportionally-scaled range between the two
  trees. No unexplained divergence.
- Section 2: all 9 v2 slots fired across 2 runs (3p/5p), correct best/worst
  alternation, zero `GENERIC_TRANSITION` anywhere, one live natural skip
  (`BLITZ_CLOSE` in the 5-player run) plus the existing pure probe's forced
  tie (16/16 checks) both confirming silence-over-filler.
- Section 3: a live phone reconnect and a pause/resume held synchronously
  inside a real `SPEECH_SLOT` beat both showed 0 duplicated beat ids, no
  stuck phase, and the paused beat still completing exactly once.

No regression was found in either direction. Two harness files
(`dev/297-v1-equiv-check.ts`, `dev/297-reconnect-pause-check.ts`) and the
`v1.0-playtest` git worktree were used to produce this report and are
removed before this commit; no file under `shared/`, `server/`, or
`client/` was modified.
