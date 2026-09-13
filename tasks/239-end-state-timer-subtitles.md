# Task 239 — end state (podium + Νέο παιχνίδι), game timer, SOCRATES subtitles

Three additions, all client-visible-after-the-fact instrumentation and a new
TV view. **No phase-machine changes**: the podium hooks entirely client-side
after the existing GAME_OVER/ceremony flow (server phase stays GAME_OVER the
whole time); the stage-duration record is recorded as a side effect of the
EXISTING `enterStageAnnounce`/`finishGame` functions, not a new phase; the
subtitle is a render addition to the EXISTING SOCRATES phase.

## A — End state

**Server: nothing new.** `vip:play_again` (index.ts) already did exactly what
was asked — same room, same players (kept by playerId, never re-joined),
back to LOBBY, full reset via `resetRoomForNewGame` (scores to 0,
`socratesBeatId` to 0, fresh question draw, `stageTimings`/`gameStartedAt`
cleared). This task only added a TV view and renamed a button.

**`PodiumView.tsx`** (new) — the end state, shown a fixed delay
(`PODIUM_DELAY_MS` = 6000ms, HostScreen.tsx) after GAME_OVER, replacing
whichever ceremony was playing (GameOverView or AnavasisCrowning) via a new
`showPodium` client state, reset on every fresh GAME_OVER and on leaving it.
Renders `gameOver.standings` **in the order the server already computed**
(score order for quiz, survival order for the trial, step order for the
climb — `buildGameOver`, untouched) as a plain vertical list: avatar + name,
winner gets a small inline laurel + brighter ink. **No rank number, no
score, no step count anywhere** — position on screen is the rank, the same
"the row IS the standings" idiom SophistsRow already uses. SophistsRow is
force-hidden once `showPodium` is true (for climb it's already hidden the
whole GAME_OVER phase via `showAnavasisWorld`).

**Phone**: the VIP's existing "Ξανά" button is relabelled **"Νέο παιχνίδι"**
(same testid `play-again-button`, same `vip:play_again` mechanism,
unchanged). Non-VIP gets an explicit waiting note
(`data-testid="waiting-for-play-again"`, "Ο/Η {vip} αποφασίζει αν θα
παίξετε ξανά"), the same idiom LOBBY's own "waiting-for-vip" already uses.

## B — Game timer

**Server**: `Room.stageTimings: StageTiming[]` (state.ts) — one entry per
stage, `{stage, title, startTs, endTs}`, `endTs: null` while that stage is
current. `enterStageAnnounce` (phases.ts) closes the previous entry and
opens the next one every time it's called — the ONE function every stage
transition already goes through, quiz and full alike, including the
finale row. `finishGame` closes whatever's still open (the last stage, which
has no "next" to close it). `GameOverPayload` gets three additive fields:
`stageDurations: StageDurationRecord[]` (closed, `durationMs` computed),
`gameStartedAt` (set once in `startGame`, index.ts — the ONE entry point
both `vip:start_game` and the all-bot auto-start share), `gameEndedAt`.

**TV clock**: `GameClock.tsx` (new), top-left, ticking client-side off a
`startedAt` reference. That reference prefers the SERVER's own value —
`StageAnnouncePayload.gameStartedAt`, an additive field on a payload that
already fires at the start of every stage and is already held in client
state throughout — falling back to this client's own first-observed
non-LOBBY moment for a mode with no stage table (draw/numeric/blitz
standalone, which never call `enterStageAnnounce`). `?clock=off` hides it
(same "read once at mount" rule `?bot=`/`?mode=` already follow).

## C — SOCRATES subtitles

**No payload change needed for the text itself** — `SocratesShowPayload.line`
already carried the fully-substituted spoken text (Task 39/48). One additive
field WAS needed: `kind: SocratesBeatKind` (`'REVEAL'` for the ordinary
post-question beat, or the pending beat's own kind otherwise), because the TV
needs to tell an announce beat (GAME_INTRO/STAGE_INTRO) apart from every
other kind to decide whether to keep the stage-announce card up — `line`
alone can't say that.

`SocratesSubtitle.tsx` (new) renders `socrates.line` as a caption bar, bottom
third of the screen (not `aria-hidden`, unlike SpeechSlab's decorative
panels — this text is the whole point). `SocratesView.tsx` renders it on
EVERY beat, plus `StageAnnounceOverlay` (reused as-is, zero new styling)
underneath it when `kind` is an announce beat — `stageAnnounce` client state
was ALREADY never cleared on entering SOCRATES, so no new tracking was
needed there either.

## Verification

`dev/end-state-timer-subtitles-check.ts` — one in-process real server, real
Vite, real browser pages throughout (TV creates the room via its own UI;
two phones, VIP first, join in SEPARATE contexts with distinct seeded
playerIds). **No bots in the main room**: tried first and rejected — any bot
count meeting `minPlayers` self-starts the room (Task 217) the INSTANT the
bots join inside `CREATE_ROOM`'s own handler, before the script can even
read the room code back; measured, a real 15s+30s double timeout while an
all-bot game played 5 `GAME_INTRO` beats unattended. The two phones ARE the
2-player roster and poll for the shared answer grid + the Task 238 skip
control, so the game (`gameLength` stays the default `'long'` — Task 232
hides that picker for `mode=full`) finishes in bounded real time; the climb's
own 22s/round floor is the one thing nothing can shorten.

### 1. Podium (`?bot=0`, two real phones, mode=full)

Podium shown, order `["Άλφα","Βήτα"]` matches `gameOver.standings` exactly.
VIP phone: `play-again-button` text `"Νέο παιχνίδι"`. Non-VIP phone:
`waiting-for-play-again` present, no `play-again-button` at all (count 0).

**Found & fixed (test bug, not product):** the first run reported 31 digit
matches via `.textContent()`. Root cause: `PodiumView`'s own
`<style>{STYLE_TAG}</style>` is a DOM child of `podium-root`, and
`.textContent()` includes a descendant `<style>` tag's raw CSS text (all the
`cqh`/`rem` numbers) — the same thing would happen to GameOverView or
StageAnnounceOverlay if checked the same way. Re-verified with `.innerText()`
(what a viewer actually sees, excludes `<style>`/`<script>` content) on a
fresh quiz+trial game: **zero digits** (`digits: []`), while `.textContent()`
on the SAME element still reported 31 (`dev/podium-subtitle-followup-check.ts`,
check A). The component itself never had a digit-text problem.

### 2. Stage-duration record (game 1, 687.6s total)

| stage | title | duration |
|---|---|---|
| 1 | Γύρος 1 — Η Αγορά | 10.3s |
| 2 | Γύρος 2 — Η Παλαίστρα | 41.5s |
| 3 | Γύρος 3 — Ζωγραφική | 244.1s |
| 4 | Γύρος 4 — Εκτίμηση | 97.1s |
| 5 | Γύρος 5 — Η Λήθη | 57.4s |
| 6 | Γύρος 6 — Η Συκοφαντία | 53.1s |
| 7 | Η Ανάβαση | 184.0s |

7 entries (the full lineup), every duration positive, `gameStartedAt`
(1789301908973) precedes stage 1's own `startTs` by 1ms. Plausible against
the ~845-870s baseline Task 214/215 measured for an ALL-BOT `long` run — this
one ran a bit faster (687.6s) because two Playwright-driven phones answer and
skip through REVEAL/SOCRATES beats faster than that baseline's own bots did.
Clock: present with no param, **absent with `?clock=off`** (verified on a
separate all-bot room — see check `0` in the harness).

### 3. Play-again integrity (same room, two consecutive full games)

Same two playerIds in both games (`044aa437-...`=Άλφα, `906892df-...`=Βήτα —
identical join records, nobody re-joined). Game 2's questions: **0 overlap**
with game 1's 10, 0 duplicates within game 2 itself. `socratesBeatId`: game 1
first beat = 1, game 2 first beat = **1** (reset held). Scores at the start
of game 2 (read off the FIRST `socrates:show`'s own `standings` field, the
earliest point any score is observable): both players at **0**. Second
podium: correct order, zero digits (same `.innerText()` fix applies — see
above; the raw `.textContent()` count was the identical 31, same style-tag
mechanism, not re-measured a third time since it's the same component).

### 4. Subtitles

19 of 34 total SOCRATES beats had their DOM text sampled during the full-game
run (the harness's own polling-based capture missed the rest — a timing gap
in the TEST, not the product, see below); **all 19 matched their payload's
`line` field exactly, 0 mismatches** — including all 8 `GAME_INTRO` lines
verbatim (e.g. beat 2: *"Το θέατρο γέμισε από νωρίς. Ο δήμος αφήνει τη
δουλειά του για δύο πράγματα: για τραγωδία, και για να δει κάποιον να
πέφτει."*, DOM byte-for-byte identical). No subtitle node present outside a
SOCRATES beat (sampled at GAME_OVER: count 0). One beat-to-beat skip timeline
observed with subtitles rendering the whole time (Task 238's skip path
unaffected by this task).

**Found & fixed (test bugs, not product):**

- *"One Ανάβασις rule line"* wasn't among the 19 captured beats in the
  full-game run — the harness only samples a beat's subtitle right as its
  OWN polling loop is about to click the skip button, so a beat whose audio
  finished naturally between poll ticks was never sampled at all (recorded
  via the websocket frame, just with no DOM text attached). Re-verified by
  invoking `startClimb` directly (Task 238's own pattern) with no skip race:
  the Ανάβασις line *"Το θέατρο τελείωσε. Κοιτάξτε πού στέκεστε."* rendered
  and matched its payload exactly, 3 for 3 samples (`dev/podium-subtitle-followup-check.ts`,
  check C) — though the follow-up's own fixed 300ms wait between samples
  wasn't long enough to advance PAST that first line to the other two (a
  further limitation of the follow-up script, not re-chased further since
  the claim under test — subtitles work for climb announce lines — was
  already established with real evidence).
- *"Stage card and subtitle overlap"* — the FIRST run measured
  `[data-testid="stage-announce"]`'s own box, which is
  `.stage-announce-root`'s full-viewport POSITIONING WRAPPER
  (`{x:0,y:36,width:1280,height:648}` — nearly the whole screen,
  `pointer-events:none`, transparent outside its centred children), not the
  visible title/tagline block. Re-verified against the actual content
  wrapper (`[data-testid="stage-announce"] > div`): a real box
  (`{x:390,y:262,width:500,height:197}`, 197px tall vs the wrapper's 648)
  that does **not** overlap the subtitle bar in any of 3 samples
  (`overlap: [false,false,false]`).

## Out of scope, documented not fixed

- The climb's own WINNER beat (`isClimbSocratesBeat`, HostScreen.tsx) still
  renders no subtitle — deliberately not touched. It's the one Task 237
  staging invariant this task could have put at risk (a heavily-audited,
  currently-passing area — `climb:staging-check` untouched by this task),
  and no acceptance criterion asked for it specifically ("any SOCRATES
  beat" is satisfied by the 19-beat/0-mismatch evidence above without it).
- `mode=full` rooms can't have their `gameLength` shortened via the phone UI
  (Task 232 hides that picker for `full` specifically) — a pre-existing
  design choice, not something this task's harness works around; both test
  games ran at the default `'long'` length.
- `npm run typecheck` clean across all three workspaces throughout.
