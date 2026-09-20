# Task 296 — spear-out branch, the duel's line, QUIZ_BEST registered

Branch `speech-policy`, on top of Task 295 (2187a64). Three changes, all of
them under **both** speech policies: a unique mechanic deserves a line
regardless of policy (Argyrios's rule, which deliberately supersedes Task 138's
silent-duel decision for the duel case).

## 1. SPEAR_OUT — Η Λόγχη finally speaks

**Fire site.** `startSpearOutBeatIfDue(room, climb)`, called from
`endClimbReveal` (server/src/phases.ts) *before* that function routes anywhere —
the hook tasks/291 §4 recorded as missing. Who was struck is read off THIS
round's own rows (`climb.lastResults`' `eliminated` flags, which
`endClimbQuestion` writes for that round only) intersected with
`eliminationOrder`, whose push order is `nextAfterSpearRound`'s own
fastest-reacting-first — so "the first" is a real order, not a Map's.

**Latch.** `ClimbState.spearBeatPlayed` (server/src/state.ts), a once-per-GAME
boolean. NOT on the stage ledger: `firedSlots` is cleared at every stage
boundary, and the climb is one stage. It resets for free, because
`resetRoomForNewGame` sets `room.climb = null`. It latches **on attempt**, the
same discipline as `pickSpeechSlot`: an exhausted pool spends the latch rather
than leaving a retry armed for the next strike.

**Resume path — it cannot stall the climb.** The beat is an ordinary held
SOCRATES phase armed by `enterSocratesBeat(room, 'SOCRATES', …)`. `'SOCRATES'`
is already in `QUIZ_CONTINUATIONS`, so a pause resumes it and the host's ack
finds a continuation. Every exit — the host's `socrates:audio_ended`, that ack
arriving immediately on a missing clip (Task 154), the per-beat backstop,
`vip:skip_socrates` — lands in `advanceFromSocrates`, whose new
`case 'SPEAR_OUT'` calls `resumeAfterClimbReveal(room)`: winner → `endClimb`,
duel → `startDuel`, otherwise → `startClimbQuestion`. That function is
`endClimbReveal`'s own former body, MOVED unchanged, so there is still exactly
one routing decision after a climb reveal rather than a second copy of it.
Deliberately NOT `continueAfterReveal`, which belongs to the quiz's post-REVEAL
sequence and would walk the finale into `advanceToNextQuestionOrGameOver`.

**Double-spear.** Two struck in one round: the first speaks, the second is
silent — the latch doing precisely what it exists for (two strikes in one reveal
are one dramatic beat, not two lines back to back). A spear DUEL's loser is
eliminated later, in `endDuelReveal`, which never passes through
`endClimbReveal` and therefore never speaks: the beat belongs to the strike
itself, not to the duel that settles who survives it.

**The name.** `recordSpearOutAndPickLine` (socrates.ts) puts the vocative into
the DISPLAY text unconditionally, exactly as `buildCoronationSequence` does —
`template` is left untouched, since that is what hashes to the mp3 — and the
caller splices the vocative CLIP only when `hasSocratesClip` finds it on disk.
No vocative clip exists for any preset name yet, so today the strike is READ
with the name and HEARD without it (the coronation's own interim behaviour).

## 2. DUEL_LOCKED — the pool Task 188b left empty

`DUEL_LINES.DUEL_LOCKED` now holds the three lines, which is the whole switch
Task 188b's own note described: `lockDuel` already waited for the host's ack
once a line fired. `SPEECH_V2_LINES.DUEL_LOCKED` **aliases that same array**
rather than restating it, so one mechanic has one set of three lines and one
`usedLines` entry per line whichever policy spoke it.

**What changed in timing:** before, `DUEL_LOCK_FLOOR_MS` (2000ms) was the whole
wait; now the reveal goes at `max(floor, line's end)`, i.e. the floor is back to
being what its name says — a minimum. **DUEL_PICK's 20s input window is
untouched**: `DUEL_PICK_TIME_MS` is armed in `startDuel`, and this beat only
ever runs *after* both picks are already in. No phase change either — the line
plays INSIDE DUEL_PICK, so its ack routes through `onDuelAudioEnded`
(index.ts), a branch that is load-bearing now instead of a no-op.

## 3. QUIZ_BEST — the 13th pool

Appended to `content/speech-policy-lines.md` (now 13 pools / 39 lines) and
registered in `SPEECH_V2_LINES` + `LINE_TAGS`. Wired as the quiz stage's
best-side pool. Dispatch diff (speechSlots.ts `SLOT_SPECS`):

```
- QUIZ_MID:   { prefer: 'worst', best: null,                        worst: slot('AGORA_WORST') }
+ QUIZ_MID:   { prefer: 'worst', best: slot('QUIZ_BEST'),           worst: slot('AGORA_WORST') }
- QUIZ_CLOSE: { prefer: 'best',  best: reservoir('RUNAWAY_LEAD'),   worst: reservoir('STUCK_IN_LAST') }
+ QUIZ_CLOSE: { prefer: 'best',  best: slot('QUIZ_BEST'),           worst: reservoir('STUCK_IN_LAST') }
```

Worst sides untouched, and reservoir pools remain as extra variety
(STUCK_IN_LAST on the close's worst side; DRAW_MID/NUMERIC_CLOSE still wholly
reservoir-backed). Both quiz slots name QUIZ_BEST, not just the close, because
`prefer` is only a preference: with the worst end TIED, Task 294's `best: null`
left the mid slot unable to say anything at all.

## Acceptance criteria

New check: `npx tsx dev/296-spear-duel-check.ts` (`SCENARIO=A|B|C`, socket-only,
real server in-process on 3966 — no browser, so Task 259's tap-to-start gate
never applies). **A 15/15, B 7/7, C 12/12 — 34/34.**

**1. Spear branch.** Fire site/latch/resume/double-spear as quoted above. Live
5-player climb (`?bot=0`, five preset-named sims), victim Γιώργος parked at step
0: counter 1/2 after round 1, struck at 2/2 in round 2's reveal,
`eliminationOrder [Γιώργος]`. ONE beat, kind SPEAR_OUT, beatId 4, tag `[dry]`,
`finale='climb'` (so the TV keeps the Anavasis world, Task 237), prefix `null`
(no vocative clip on disk), subtitle
`"Γιώργο. Δύο γύρους ρίζωσες στο ίδιο σκαλί. Η Ανάβαση δεν ανέχεται αγάλματα."`
with the hashed template NOT name-substituted. Round timestamps around it:
`CLIMB_REVEAL@11188ms -> SOCRATES@17192ms -> CLIMB_QUESTION@17194ms` — the climb
continued, `roundsPlayed` 2. Server log: `climb: Η Λόγχη struck Γιώργος out —
Socrates beat firing (vocative clip absent)`, then `Socrates (SPEAR_OUT) beat 4
backstop=15000ms` and `beat 4 ended (socrates:audio_ended) - advancing` — the
ack, not the backstop. Second strike (Τάκης, rounds 3–4):
`eliminationOrder [Γιώργος, Τάκης]`, still **1** SPEAR_OUT beat, climb still
running at `roundsPlayed` 4.

**2. Duel.** Forced two-arrival duel (both seeded at `CLIMB_TOP-1`, cause
`top`). `duel:locked` at 10936ms carrying tag `[dry]` and
`"Μοιραστήκατε την ανάβαση. Τη νίκη δεν τη μοιράζεται κανείς. Εμπρός."` from
`DUEL_LINES.DUEL_LOCKED`; server log says `reveal in >= 2000ms (waiting on
Socrates too)` — the suffix that is only reachable with a non-empty pool.
Pick window: `duel_pick:show durationMs=20000`, live timer 19961ms when sampled,
`DUEL_PICK_TIME_MS=20000` — unchanged. **0** SOCRATES phases during the duel
(the beat plays inside DUEL_PICK). lock → DUEL_REVEAL **2002ms** against a
2000ms floor, so the ack landed inside the floor and the 11s
`SOCRATES_MAX_DURATION_MS` backstop never applied. Ack clean.

**3. Registration.** `collectVoiceLineEntries` **514 → 517**, 517 unique
hashes — **+3, not +9**. The other six of the expected nine were ALREADY
registered: Task 294 put DUEL_LOCKED's and SPEAR_OUT's three lines each into
`SPEECH_V2_LINES`, and `collectVoiceLineEntries` dedups on line text, so moving
DUEL_LOCKED's three into `DUEL_LINES` only re-attributes their rows (moment
`DUEL_LOCKED` instead of `SLOT (DUEL_LOCKED)`) rather than adding any. 523 was
only reachable if those six had been unregistered; they were not. QUIZ_BEST's
three are the genuine addition. Content file: 13 pool headers / 39 spoken lines,
all 39 verbatim in the code with the same tag, same 13 pools in the same order,
sha256 `a14cb9e23077d0f6fe0d5fa7a3957b3ff3407819da632784e6eee47bab420005`.
QUIZ_BEST wired as best-side, read out of the real engine: `QUIZ_MID → ΓΑΜΑ /
AGORA_WORST`, `QUIZ_CLOSE → ΑΛΦΑ / QUIZ_BEST`, and on a tied worst end
`QUIZ_MID → ΑΛΦΑ / QUIZ_BEST` (previously silence).

**4. Inverse.** Typecheck ×3 (shared/server/client) exit 0, twice — before and
after the harness work. `dev/277-splice-check.ts` **24/24, 0 failed**.
`main` and tag `v1.0-playtest` both still **c87443a**, untouched.
`dev/294-slot-probe.ts` **16/16** after updating the ONE expectation my dispatch
change pins (`QUIZ_CLOSE pool` `'RUNAWAY_LEAD (reservoir)'` → `'QUIZ_BEST'`) —
that probe is the named check for this exact engine, not an unrelated harness
being rewritten; nothing else in it was touched.

**V1 control show**, `BOT_COUNT=5 SCENARIO=V1 npx tsx dev/294-speech-policy-check.ts`,
a full seven-stage `mode=full` run: **47 beats — REVEAL 15, GAME_INTRO 10,
STAGE_INTRO 9, WINNER 3, DRAW_MOMENT 3, DRAW_INTRO 2, NUMERIC_MOMENT 2,
AGORA_MOMENT 2, DRAW_WINNER 1**; 22 per-reveal beats, **0 SPEECH_SLOT beats and
0 `[slot]` log lines** (the v2 engine never runs under v1, unchanged). Stage
durations 102.9 / 79.5 / 124.6 / 40.2 / 45.0 / 71.4 / 63.7s.
`collectVoiceLineEntries()` 517 at the end of the show, matching C.

Neither new beat appears in that run — **0 spear strikes, 0 duel locks** —
because neither mechanic triggered: the climb entered with 5 climbers on entry
steps [1,2,4,3,3] and resolved in 63.7s, so nobody sat at step 0 through two
negative rounds and nobody tied at the top. That is exactly the criterion: v1 is
untouched except where the two mechanics fire.

**Both policies, demonstrated rather than asserted.** `DEFAULT_ROOM_SETTINGS.speechPolicy`
is `'v1'` (shared/src/index.ts:1948) and the harness creates its rooms with a
bare `create_room {}`, so **A 15/15 and B 7/7 above ARE the v1 runs**. Re-run
under `POLICY=v2` (a knob added for exactly this): **22/22 identical** — same
SPEAR_OUT beat (beatId 4, tag `[dry]`, `CLIMB_REVEAL@11193ms ->
SOCRATES@17195ms -> CLIMB_QUESTION@17197ms`), same duel line (tag `[serious]`),
lock → reveal 2002ms, `duel_pick:show durationMs=19999`. **0 `[slot]` lines in
either climb**, since no v2 slot is defined for the finale — these two mechanic
beats are the only speech there under either policy.

One counting curiosity worth knowing before it reads as a bug: the v1 harness
still reports "36 from the v2 slot pools". 12 pools x 3 was 36; it is now 13 x 3
minus DUEL_LOCKED's three, which are attributed to v1's own `DUEL_LOCKED` moment
since the arrays are aliased. Same number, different composition.

**Not covered by tsc:** `server/tsconfig.json` includes only `src`, so
`npm run typecheck` does not typecheck `dev/*.ts`. Both dev files here are
validated by EXECUTION instead — five clean runs between them (296 A, 296 AB,
296 AB under v2, slot probe before and after its one-line update).

## Deliberately not done

- **No mp3 exists for any of the 39 v2 lines** (October generation pass), so
  both new beats end on the client's immediate 404 ack (Task 154). Registering
  them does not generate them.
- **No vocative clip exists for any preset name**, so nothing is spliced today;
  the splice path is built and gated on `hasSocratesClip`.
- **A spear duel's loser never speaks** (eliminated in `endDuelReveal`, which
  does not route through `endClimbReveal`) — see Double-spear above.
- The blitz STAGE_INTRO pool still says «δώδεκα πράγματα», true of each window
  and not of the stage's 24 (Task 253's own documented, unfixed note): voice
  lines were out of scope here too.
