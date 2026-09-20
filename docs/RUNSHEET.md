# Aegean — Run Sheet: the full show, beat by beat

Read-only survey of `mode=full` (Η Παράσταση) as it actually runs at HEAD
(`a43dbdc`, 2026-09-19). Every row below is traced to real code, not to the
docs — CLAUDE.md itself is stale on two points this sheet corrects (see the
box right below). Audience: reading this cold on GitHub, no source open.

Three columns, every step:
- **WHO ACTS** — what players do on their phones / what the TV shows.
- **SOCRATES** — which moment pool(s) CAN speak here, the trigger, one
  example line if the pool is populated, or "silent by design" if nothing
  can speak at this beat.
- **AUDIO REALITY** — how many of that pool's lines actually have a
  playable mp3 in the bank TODAY. ⚠ SILENT GAP = the pool is live (its pick
  really reaches a spoken beat) but has zero playable clips. ☠ DEAD PIPE =
  the pool's output never reaches a spoken beat at all, regardless of the
  bank — a wiring bug, not a recording gap.

## Two corrections to CLAUDE.md, found while building this

1. **Η Δίκη (the trial finale) no longer exists.** Task 258
   (commit `d8324bc`, 2026-09-17) deleted `server/src/trial.ts`, the
   `TRIAL_QUESTION`/`TRIAL_REVEAL` phases, `TRIAL_INTRO_LINES`, and
   `room.settings.finaleMode`/`FinaleMode` entirely. `GamePhase` is 22
   values now, not 24 (`shared/src/index.ts:997-1043`, comment at
   `:1020-1024` names the removal). **Η Ανάβαση (the climb) is the ONLY
   finale**, for `full` and standalone quiz alike —
   `advanceToNextQuestionOrGameOver` (`server/src/phases.ts:1099-1137`)
   calls `startClimb(room)` unconditionally at line 1122, no branch left to
   take. `StageSegment` (`shared/src/index.ts:1233`) still carries a
   `'trial'` value, kept only as the finale row's wire label — that rename
   is explicitly deferred to its own task, not a sign the mechanic is back.
2. **The voice bank is not 283 clips any more — it's 137.** Between the doc
   being written and today, most of the bank was moved to
   `voice-deleted` as a review backup and never restored (dropping it to
   130), Task 284's deploy was blocked by the deploy script's own
   `VOICE_MIN=283` floor check finding 130 < 283, and Task 286 promoted 7
   newly-approved clips back in, landing at 137 (verified directly:
   `ls /opt/party-game/client/public/voice | wc -l` = 137, cross-checked
   against `client/public/voice`, the dev symlink to the same directory).

---

## The night, in order

### 0 — Lobby
**WHO ACTS:** Players join by 4-digit code; TV shows the roster waiting for
VIP to press start. **SOCRATES:** silent by design — nothing calls into
Socrates from LOBBY. **AUDIO REALITY:** n/a.
`vip:start_game` → `fullMode.start` (`server/src/modes/full.ts:171`) →
`enterQuestionOrPowerUp` (`server/src/phases.ts:314`).

### 1 — Stage 1 card: "Γύρος 1 — Η Αγορά"
**WHO ACTS:** TV shows the stage-announce card; phones wait.
**SOCRATES:** nothing yet — the card itself is silent, the intro sequence
below plays after it. **AUDIO REALITY:** n/a.
`enterStageAnnounce` (`server/src/phases.ts:204-226`) — the one documented
exception that emits its card BEFORE `PHASE_CHANGED`. Title from
`shared/src/index.ts:1469`.

### 2 — Opening narration: GAME_INTRO_SEQUENCE
**WHO ACTS:** Everyone watches/listens; no input possible.
**SOCRATES:** `GAME_INTRO_SEQUENCE` (`server/src/socrates.ts:443-454`), 10
lines played IN ORDER (a sequence, not a random pick) — full mode's own
opening narration, fired once, gated on `!room.gameIntroPlayed`. Trigger:
first `endStageAnnounce` of a `full` game
(`server/src/phases.ts:246-248, 331-337`). Example line 1: *"Καλώς ήρθατε
στην Αθήνα."* **AUDIO REALITY: 10/10 playable — fully covered.**

### 3 — Stage 1 intro: STAGE_INTRO (identity `'quiz'`)
**WHO ACTS:** Still watching; question 1 is seconds away.
**SOCRATES:** `STAGE_INTRO_LINES['quiz']` (`server/src/socrates.ts:529-578`,
12 lines — the merged standalone-quiz "Η Αγορά"+"Οι Σοφιστές" pool). Trigger:
`resumeAfterStageAnnounce` (`server/src/phases.ts:268-295`, line 291) once
per stage, keyed by `stageIntroIdentity(definition)`
(`socrates.ts:518-527`) — NOT table position (Task 218 fixed a bug where
this broke on stage reordering). Example: *"Βρισκόμαστε στην Αγορά, εκεί
όπου ξεκινούν όλες οι συζητήσεις. Εδώ χάνονται και οι περισσότερες."*
**AUDIO REALITY: 9/12 playable.**

### 4 — Stage 1 loop: QUESTION → REVEAL, ×5 (long) / ×3 (medium)
**WHO ACTS:** Phones show a 4-option grid and lock in an answer; TV shows
the question, then who was right and the new scores.
**SOCRATES, two separate mechanisms here:**

- **Question-intro caption** — `INTRO_LINES` (`socrates.ts:370-407`, 4
  keys: FINAL_QUESTION, HALFWAY_POINT, CATEGORY_CALLOUT, GENERIC_INTRO),
  picked by `pickQuestionIntro` (`socrates.ts:1661-1683`), called once per
  question at `server/src/phases.ts:657` right before `QUESTION_SHOW`.
  **☠ DEAD PIPE.** Its result IS sent to the host as
  `QuestionShowHostPayload.socratesIntro`
  (`server/src/phases.ts:672`/`:677`) — but `grep -an "socratesIntro"
  client/src/screens/HostScreen.tsx` returns **zero hits**. Task 219
  removed the on-screen caption entirely (comment at
  `client/src/screens/host/QuestionView.tsx:41-47`: "low-contrast text on
  the night sky, unreadable from a couch") and no audio path was ever wired
  to it either — `pickQuestionIntro` returns bare `text`, not the
  `{template, tag}` pair every audio-driven picker needs
  (`socrates.ts:1686` says so explicitly). The reconnect path agrees:
  `server/src/index.ts:455` hardcodes `socratesIntro: null` with a comment
  calling it "never re-picked here." Real side effect anyway: every pick
  permanently burns one line from a 6–9-line pool for zero player benefit.
  Audio counts for the record: FINAL_QUESTION 6 total/**0 onDisk**,
  HALFWAY_POINT 6/**0**, CATEGORY_CALLOUT 9/4, GENERIC_INTRO 6/1 — moot,
  since none of it plays either way.
- **Post-reveal moment** — `LINES` (`socrates.ts:186-367`, 18 keys), the
  quiz's generic per-question pool. Picked by `recordRoundAndPickLine`
  (`socrates.ts:1385-1656`), called from `endQuestion`
  (`server/src/phases.ts:771`). Conditional: candidates are collected,
  ranked HIGH→MEDIUM→LOW, filtered by a 3-question per-player cooldown and
  a per-game cap of 2 fires; `GENERIC_TRANSITION` is the unconditional
  floor so something (almost) always speaks. Fires via
  `startSocratesIfLineFired` (`server/src/phases.ts:971-1020`) inside
  `continueAfterReveal`. Example (ONLY_ONE_CORRECT, 9 lines, 5 onDisk):
  *"Ένας. Μόνο ένας ανάμεσά σας. Κοιτάξτε καλά."*
  **AUDIO REALITY: 16 of 18 keys have ≥1 playable line. Two do not:
  HOT_STREAK_3 (8 total, ⚠ 0 onDisk) and CLOSE_SCORES (6 total, ⚠ 0
  onDisk)** — both emptied by a prior voice-review deletion pass; the
  candidate loop simply skips them and falls through, so nothing crashes,
  the moment is just unreachable.

POWER_UP is skipped here — `room.settings.powerUpsEnabled` defaults
**false** — and stage 1 never STEALs.

### 5 — Stage 2 card + intro: "Γύρος 2 — Η Παλαίστρα" / STAGE_INTRO (`'blitz'`)
**WHO ACTS:** watching the card, then the swipe tutorial beat.
**SOCRATES:** `STAGE_INTRO_LINES['blitz']` (3 lines). Example: *"Στην
Παλαίστρα δεν συζητούσαν. Πάλευαν. Θα σας πω κάτι, κι εσείς θα το δεχτείτε ή
θα το ρίξετε. Όποιος διστάσει, έχασε."* **AUDIO REALITY: 3/3 playable.**
`server/src/modes/full.ts:202-204` → `startBlitzSegment`
(`server/src/modes/blitz.ts:112-117`).

### 6 — Stage 2: BLITZ → BLITZ_REVEAL, ×2 rounds (12 statements each)
**WHO ACTS:** Phones swipe right/left on true/false statements under a
timer; TV shows the live tally, then round results.
**SOCRATES:** silent by design — no per-round moment call site exists in
`blitz.ts`; confirmed by reading `endBlitz`
(`server/src/modes/blitz.ts:264-309`) and `endBlitzReveal`
(`:372-387`), neither calls into `socrates.ts`. **AUDIO REALITY:** n/a.
Round 2 reopens via `startNextBlitzRound` (`blitz.ts:126-131`) without
re-announcing the stage (`room.stage` doesn't move).

### 7 — Stage 3 card + intro: "Γύρος 3 — Ζωγραφική" / STAGE_INTRO (`'draw'`)
**WHO ACTS:** watching the card. **SOCRATES:**
`STAGE_INTRO_LINES['draw']` (2 lines). Example: *"Οι λέξεις σάς βοήθησαν ως
τώρα. Ας δούμε τι κάνετε χωρίς αυτές."* **AUDIO REALITY: 2/2 playable.**
`full.ts:208-211` → `startDrawSegment` (`server/src/modes/draw.ts:328-334`).

### 8 — Stage 3: DRAW → (GUESS → GUESS_REVEAL) × N, × 3 cycles (long)
**WHO ACTS:** Everyone draws their assigned word at once; then, one drawing
at a time, everyone else picks the matching word from 4 options.
**SOCRATES, three mechanisms:**
- **DRAW_INTRO** (`socrates.ts:702-746`, part of `DRAW_LINES`, 5 lines) —
  `pickDrawIntroLine` (`socrates.ts:1779-1781`), fires once per cycle
  before the canvas opens (`draw.ts:353-365`). Example: *"Αφήστε τα λόγια
  και πιάστε το πινέλο. Ομολογώ ότι αυτό με τρομάζει περισσότερο."*
  **AUDIO REALITY: 4/5 playable.**
- **DRAW_MOMENT** (3 keys: NOBODY_GUESSED, EVERYBODY_GUESSED, SPLIT_GUESS)
  — `recordDrawGuessRoundAndPickLine` (`socrates.ts:1801-1832`), once per
  `GUESS_REVEAL` (`draw.ts:878`). Example (SPLIT_GUESS, 8 lines, 2 onDisk):
  *"Ο καθένας είδε κάτι διαφορετικό στο ίδιο σχέδιο. Έτσι γεννιούνται οι
  αιρέσεις."* **AUDIO REALITY:** all 3 keys ≥1 playable (NOBODY_GUESSED
  4/5, EVERYBODY_GUESSED 3/5, SPLIT_GUESS 2/8) — no gap.
- **DRAW_WINNER** (8 lines) — `pickDrawWinnerLine`
  (`socrates.ts:1786-1788`), fires once at stage end, naming the
  best-scoring drawer (`draw.ts:567-580`). Example: *"Ένα χέρι ξεχώρισε
  σήμερα ανάμεσα σε όλα. Θα το θυμάμαι όταν διαλέγω μαθητή."*
  **AUDIO REALITY: 5/8 playable.**

### 9 — Stage 4 card + intro: "Γύρος 4 — Εκτίμηση" / STAGE_INTRO (`'numeric'`)
**WHO ACTS:** watching the card. **SOCRATES:**
`STAGE_INTRO_LINES['numeric']` (2 lines). Example: *"Πόσα; Αυτή είναι όλη η
ερώτηση."* **AUDIO REALITY: 2/2 playable.**
`full.ts:217-219` → `startNumericSegment` (`server/src/modes/numeric.ts:138-140`).

### 10 — Stage 4: NUMERIC_QUESTION → NUMERIC_REVEAL, × 3 (fixed)
**WHO ACTS:** Phones submit a single number guess; TV reveals the real
answer and distance-ranked scores.
**SOCRATES:** `NUMERIC_LINES` (`socrates.ts:755-789`, 4 keys, first
qualifying wins). `recordNumericRoundAndPickLine`
(`socrates.ts:1850-1899`), called once per reveal (`numeric.ts:334`).
Example (EXACT_HIT, 5 lines, 3 onDisk): *"Κάποιος βρήκε τον αριθμό
ακριβώς. Δεν πιστεύω στην τύχη τόσο πολύ — άρα μου κρύβετε πράγματα."*
**AUDIO REALITY:** all 4 keys ≥1 playable (EXACT_HIT 3/5, WILDLY_OFF 2/5,
ALL_CLUSTERED 3/9, NOBODY_CLOSE 3/5) — no gap.

### 11 — Stage 5 card + intro: "Γύρος 5 — Η Λήθη" / STAGE_INTRO (`'agora'`)
**WHO ACTS:** watching the card. Note: displayed as "Η Λήθη," not "Η Μνήμη
της Αγοράς" (Task 231 renamed it — the old title read as a return to
stage 1). **SOCRATES:** `STAGE_INTRO_LINES['agora']` (2 lines). Example:
*"Η Λήθη δεν παίρνει όσα ξεχνάτε. Παίρνει όσα δεν προσέξατε ποτέ."*
**AUDIO REALITY: 2/2 playable.**
`full.ts:205-207` → `startAgoraSegment` (`server/src/modes/agora.ts:141-145`).

### 12 — Stage 5: AGORA_EXPOSE → (AGORA_QUESTION → AGORA_REVEAL) × 3
**WHO ACTS:** TV shows the market scene for 12s with no input possible;
then phones answer questions about what was on display; reveal highlights
the real stall/animal.
**SOCRATES:** agora has no lines of its own — its reveal reuses the SAME
`LINES` pool as step 4, forced to `difficulty:'medium'`, via
`recordRoundAndPickLine` called from `server/src/modes/agora.ts:409`. Same
18-key breakdown, same two silent gaps (HOT_STREAK_3, CLOSE_SCORES) apply
here too. **AUDIO REALITY:** see step 4.

### 13 — Stage 6 card + intro: "Γύρος 6 — Η Συκοφαντία" / STAGE_INTRO (`'steal'`)
**WHO ACTS:** watching the card. **SOCRATES:**
`STAGE_INTRO_LINES['steal']` = `SYKOPHANTIA_INTRO_LINES`
(`socrates.ts:476-486`, 8 lines). Example: *"Η Συκοφαντία. Οι κατήγοροι
έβγαζαν ψωμί από τις κατηγορίες — τώρα θα βγάλετε κι εσείς."*
**AUDIO REALITY: 6/8 playable.**

### 14 — Stage 6 loop: QUESTION → REVEAL → STEAL, × 5 (long) / × 3 (medium)
**WHO ACTS:** Same answer grid as stage 1, but every reveal is followed by
one eligible player stealing points from another.
**SOCRATES:** same two mechanisms as step 4 (question-intro ☠ dead pipe;
`LINES` reveal pool with its two ⚠ gaps) — identical wiring, just a
different `room.currentQuestionIndex` range. The STEAL outcome itself
(`resolveSteal`, `server/src/phases.ts:909-934`) is an on-screen banner
only — no Socrates pool is attached to it; **silent by design**, not a gap.

### 15 — Finale gate
**WHO ACTS:** nothing visible — a server-side decision.
**SOCRATES:** none — `startClimb` (`server/src/phases.ts:1151-1210`) is
just a check (≥2 connected players, unused questions available). Called
unconditionally from `advanceToNextQuestionOrGameOver`
(`server/src/phases.ts:1122`) — the single site left since Task 258 removed
the branch that used to pick Η Δίκη instead.

### 16 — Finale card: "Η Ανάβαση" + ANAVASIS_INTRO_SEQUENCE
**WHO ACTS:** watching the card and the 3-line rules narration; TV switches
to the temple/staircase scene. **SOCRATES:** `ANAVASIS_INTRO_SEQUENCE`
(`socrates.ts:466-470`, 3 lines, sequential). Trigger:
`resumeAfterStageAnnounce` (`server/src/phases.ts:276`) once `room.climb`
is set. Example line 1: *"Το θέατρο τελείωσε. Κοιτάξτε πού στέκεστε."*
**AUDIO REALITY: 3/3 playable — fully covered.**

### 17 — Climb loop: CLIMB_QUESTION → CLIMB_REVEAL, up to 24 rounds
**WHO ACTS:** Same 4-option grid, but correct answers move you up a
staircase toward step 10; wrong or slow answers can move you down or (at
4+ players) spear you out after two rounds stuck at step 0.
**SOCRATES:** silent by design — confirmed no call into `socrates.ts`
anywhere in `endClimbQuestion` (`server/src/phases.ts:1358-1519`) or
`endClimbReveal` (`:1522-1540`). The climb's only voice moments are the
stage intro (step 16) and the winner beat (step 20). **AUDIO REALITY:**
n/a.

### 18 — Duel branch (conditional): DUEL_PICK → DUEL_REVEAL
**WHO ACTS (duelists only):** pick xifos/dory/aspida on a 20s timer;
everyone else watches. Triggered by 2+ simultaneous top-step arrivals, a
tied leader at the round cap, or a same-round double-spear-strike.
**SOCRATES:** `DUEL_LINES['DUEL_LOCKED']` (`socrates.ts:751-753`) —
**empty array by design** (`DUEL_LOCKED: []`, confirmed still empty at
HEAD), the same "detect but stay silent" pattern Task 138 established.
Detection fires unconditionally (`recordDuelLockedAndPickLine`,
`socrates.ts:1904-1919`, called at `phases.ts:1643-1667`); a fixed 2s floor
timer carries the beat instead of a line. **AUDIO REALITY:** n/a — this
pool has zero registered lines, not zero recorded clips; it is not counted
as a gap.

### 19 — Winner beat: the coronation
**WHO ACTS:** nothing — the whole TV becomes Socrates at the temple, no
input possible. **SOCRATES:** `endClimb` (`server/src/phases.ts:1812-1818`)
calls `pickWinnerBeatSequence` (`:476-495`) → `buildCoronationSequence`
(`server/src/socrates.ts:683-696`). One of two 3-line SETS is chosen by a
plain uniform coin flip, independent of who won or how
(`pickCoronationSet`, `socrates.ts:655-663`, verified directly):
- **Set B** ("the name," `CORONATION_SET_B`, `socrates.ts:610-614`) ends
  on *"Το δικό σου."* — its last line, `CORONATION_NAME_LINE`
  (`socrates.ts:630`), gets the winner's own name **spliced on as a
  suffix** (a separate audio clip appended after the line, never baked
  into the sentence — `coronationVocative`, `socrates.ts:637-643`). The
  on-screen subtitle always shows the name; the spoken vocative clip only
  plays if that specific name has one recorded.
- **Set C** ("the silence," `CORONATION_SET_C`, `socrates.ts:619-623`)
  opens *"Ήρθα απόψε να κοροϊδέψω σοφιστές. Εύκολη δουλειά, συνήθως."* —
  names no one, by construction, ever.

**AUDIO REALITY: 6/6 set lines playable** (Task 286 promoted the last
batch in) — fully covered either way the coin lands. The **suffix** itself
is a separate 201-entry `VOCATIVE` pool (one clip per preset player name):
**only 1 of 201 is recorded (Νίκο)** — every other winner's name is
spoken only in the on-screen subtitle, the spliced audio silently omitted.
This is documented as an accepted gap, not a crash: `coronationVocative`
returns `null` cleanly when a name has no clip.

The superseded `WINNER_LINES` pool (`socrates.ts:580-589`, 8 lines) is
orphaned rather than a dead pipe in the strict sense — its own picker,
`pickWinnerLine`, was deleted in Task 278, so there is no longer any code
path attempting to read it at all. It stays in the file only so
`collectVoiceLineEntries` (`socrates.ts:1989`) keeps registering its
already-generated clips as non-orphaned bank files — of which there
currently are **0 onDisk** anyway.

### 20 — Game over
**WHO ACTS:** Phones/TV show the podium ceremony (client-only —
`room.phase` stays `GAME_OVER` throughout); VIP can press "Νέο παιχνίδι."
**SOCRATES:** none — `finishGame` (`server/src/phases.ts:1824-1851`) just
builds `buildGameOver` (`server/src/payloads.ts:475`) and emits it.
**AUDIO REALITY:** n/a.

---

## Pools not reachable in a `full` show, for completeness

- **`GAME_INTRO_LINES`** (`socrates.ts:419-428`, 7 lines, 3 onDisk) — the
  plain (non-sequence) opening line used by standalone quiz/draw/numeric/
  blitz/agora entry points; `full` mode always uses the 10-line
  `GAME_INTRO_SEQUENCE` instead (`phases.ts:334-336` routes on
  `room.mode==='full'`).
- **`STAGE_INTRO_LINES['finale']`** — no entry exists in the table at all
  (comment at `socrates.ts:513-515`); the finale's own announcement is
  `ANAVASIS_INTRO_SEQUENCE` (step 16), never this table.
- Standalone `duel` mode reaches `DUEL_PICK`/`DUEL_REVEAL` directly with no
  climb rounds first (`server/src/modes/duel.ts:44-63`) — same functions
  as step 18, different entry point, not part of the `full` night.

---

## One-screen summary

| | count |
|---|---|
| Ordered transitions/beats documented above (steps 0–20) | **21** |
| Distinct Socrates moment-pool constants referenced | **12** — `LINES`, `INTRO_LINES`, `GAME_INTRO_LINES`, `GAME_INTRO_SEQUENCE`, `ANAVASIS_INTRO_SEQUENCE`, `STAGE_INTRO_LINES`, `WINNER_LINES`, `CORONATION_SET_B`, `CORONATION_SET_C`, `DRAW_LINES`, `DUEL_LINES`, `NUMERIC_LINES` |
| Individual moment-keys walked (sub-entries of the above) | **~43** |
| Moment-keys with ≥1 playable clip | **~38** |
| ⚠ SILENT GAP (live pool, 0 playable clips) | **2** — `HOT_STREAK_3`, `CLOSE_SCORES` (both inside `LINES`) |
| ☠ DEAD PIPE (output never reaches a spoken beat) | **1** — `pickQuestionIntro` / `INTRO_LINES` (4 keys, all moot) |
| Orphaned pool (no live caller left) | **1** — `WINNER_LINES`, superseded by coronation since Task 278 |
| Fully-covered sequences (100% playable) | **3** — `GAME_INTRO_SEQUENCE` (10/10), `ANAVASIS_INTRO_SEQUENCE` (3/3), coronation `SET_B`+`SET_C` (6/6) |
| Bank reconciliation | 137 files on disk today (125 active + 12 orphans of 478 total registered lines); a separate voice-review log (`server/src/data/voice-line-review.json`) tracks 274 reviewed lines, 155 marked "deleted" (matches the 155 files in `voice-deleted` exactly), 119 "kept" |

Numbers for "moment-keys walked" / "with ≥1 playable clip" are the sum of
every per-step count given above (18 `LINES` + 5 `DRAW_LINES` + 4
`NUMERIC_LINES` + 1 `DUEL_LOCKED` (empty, excluded from the gap count) + 4
`INTRO_LINES` (dead pipe, excluded from the gap count) + 1 `GAME_INTRO_LINES`
+ 1 `GAME_INTRO_SEQUENCE` + 1 `ANAVASIS_INTRO_SEQUENCE` + 6 `STAGE_INTRO`
identities + 2 coronation sets = 43); the 201-entry `VOCATIVE` name pool is
reported separately (1/201) since it is a per-player splice, not a
per-moment pool, and its near-total absence is an accepted, gracefully
handled gap rather than a newly-found one.
