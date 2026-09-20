# Task 299 — Diagnosis: skip-vote for Socrates sequences (READ-ONLY)

Branch `skip-vote`, cut from `main` at `d025b43`, tree clean at start. No file
under `shared/`, `server/` or `client/` was modified — this report is the only
commit. No deploy.

Scope of the feature under diagnosis: during SEQUENCE beats only
(`GAME_INTRO_SEQUENCE` 10 lines, `ANAVASIS_INTRO_SEQUENCE` 3 lines — never a
single-line slot/moment beat), every connected phone shows a skip button;
one-way vote; TV counter; threshold = more than half of currently-connected,
recomputed on disconnect; on success the clip stops MID-PLAY, the rest of the
sequence is discarded, ONE `SKIP_INTERRUPTED` beat plays, then the flow resumes
where the sequence's end would have led.

## 1. Sequence playback anatomy, and what Task 238's skip actually does

- Start: `startSocratesSequence` (phases.ts:614) sends `picked[0]` to
  `enterSocratesBeat` and parks the tail in `room.pendingSocratesQueue`
  (state.ts:351). Two callers: `startGameIntro` (phases.ts:359, `mode==='full'`
  only) and `resumeAfterStageAnnounce` (phases.ts:301, the climb).
- Per line: `enterSocratesBeat` (phases.ts:395) does `socratesBeatId += 1` (401),
  sets `socratesBackstopMs` (410), `armActiveTimer` (416), then emits
  PHASE_CHANGED, `SOCRATES_BEAT {beatId}` ROOM-WIDE (421) and `SOCRATES_SHOW`
  HOST-ONLY (426).
- Client: `handleSocratesShow` (HostScreen.tsx:707) plays only when
  `!payload.paused` (731) and acks `{beatId}` (737). The state:sync branch
  (HostScreen.tsx:1214) sets state and never plays — a reconnect mid-beat is
  silent and that beat rides its backstop.
- Advance: ack → `endSocratesBeat` (index.ts:591) → `continuationForActiveTimer`
  → `advanceFromSocrates` (phases.ts:1172) → drain (1183-1207) re-enters the
  SAME `kind`; empty queue → the kind switch (1209+): GAME_INTRO →
  `resumeAfterStageAnnounce`, STAGE_INTRO → `startClimbQuestion` (1393) or
  `beginStageOrRound` (327), WINNER → `finishGame`.
- Task 238 skip: phone (ControllerScreen.tsx:1876) → handler (index.ts:1362) →
  the SAME `endSocratesBeat`, whose three guards are phase≠SOCRATES (596),
  paused (604) and stale id (608).
- **Exact difference: it is a LINE-BOUNDARY advance, nothing more.** It cannot
  stop audio (no server→client audio-control event exists at all) and cannot
  discard the queue — the drain at 1183 is unconditional, which is why
  index.ts:1354-1360 documents a mid-sequence skip as playing the NEXT line.
- Reusable half: the interrupted clip keeps playing, its `onEnded` acks with the
  OLD id, and 608 rejects it because the next beat already incremented
  `socratesBeatId`. That staleness guard is exactly what the new feature needs;
  the stop and the queue discard are what it does not have.

## 2. The dangerous part — stopping audio mid-clip

- Cancellation support today: **none**. `playSocratesLine` (useGameAudio.ts:660)
  builds its source inside `play()` (723) as a LOCAL `const`, connects it to
  `voiceGain` and calls `source.start()`; nothing retains a handle. Grep over
  useGameAudio.ts finds **0 `.stop(` calls** on any Socrates source — the only
  "stop" is a comment (169), and mute is a gain ramp (283), not a stop.
  `playFrom` (740) binds `onEnded` to the LAST clip of the prefix/line/suffix
  chain only.
- Do nothing and the room HEARS the interrupted line to its end; the late ack is
  then rejected as stale (index.ts:608). Safe, but it defeats the feature.
- Minimum client change: retain the live source + a generation counter, expose
  `stopSocratesLine(beatId)` that sets `source.onended = null` BEFORE
  `source.stop()` and marks that beat's ack suppressed — the chain has four
  `await` points (679/681/706/708), so a generation check is what stops a clip
  that is still mid-fetch from ever scheduling.
- The pending ack must be SUPPRESSED, never synthesised. A synthetic ack would be
  a second advance and re-open precisely the double-advance Task 236 closed.
- No stranded backstop is possible: `armActiveTimer` (timers.ts:61-68) clears the
  previous `handle` before arming, so the interruption beat's own arm cancels the
  stopped beat's backstop as a side effect.
- Proposed sequence: (1) vote passes; (2) `room.pendingSocratesQueue = []` +
  latch; (3) emit host-only `socrates:stop {beatId: current}`; (4) host stops and
  suppresses that ack, emitting NOTHING back; (5) same tick,
  `enterSocratesBeat(...)` for the interruption line — it bumps the id (so any
  escaped ack is stale), clears the old timer, arms a new backstop and
  broadcasts SOCRATES_SHOW; (6) its ack drains an EMPTY queue and falls into the
  existing kind switch.
- **Design key: do NOT add a `SKIP_INTERRUPTED` beat kind to the switch.** Keep
  the ORIGINAL kind on the beat and mark the interruption with a separate field.
  Routing at 1209+ then resumes exactly where the sequence's end would have led
  with zero new routing code, and the TV keeps the announce card up underneath
  the subtitle (the card behaviour is keyed off `SocratesBeatKind`, shared:2083).
- Today the clip 404s, so Task 154 acks at ~0ms and the beat is subtitle-only —
  the same interim every unrecorded pool has (39 v2 lines are in this state).

## 3. Vote plumbing — nearest patterns to clone

- (a) **No vote/ready mechanism exists.** A sweep of `vote|tally|readyplayer`
  across server/shared/client returns only blitz's swipe tally (blitz.ts:17/88).
  Nearest clones: `room.powerUpChoices: Map<string, PowerUpChoice>`
  (state.ts:395) with `haveAllConnectedPlayersChosenPowerUp` (state.ts:765) and
  `haveAllConnectedPlayersAnswered` (state.ts:751) — both identity-based, and
  752 says explicitly that a `.length` comparison is the wrong shape.
- Authorisation for a NON-VIP player event: `getPlayerRoomForSocket`
  (index.ts:623), whose existing open-to-anyone user is GAME_PAUSE
  (index.ts:1656). The one-way client guard to copy is `socratesSkipSent`
  (ControllerScreen.tsx:522): set on send (1880), reset on every SOCRATES_BEAT
  (778) and on any phase change out of SOCRATES (789).
- (b) **TV counter**: the live-ticker path is ANSWER_PROGRESS
  (index.ts:1119-1122) → `agoraQuestionAnsweredIds` (HostScreen.tsx:319) →
  `lockedInPlayerIds` (2600) → `isLockedIn` per figure (SophistsRow.tsx:80/590).
  For a numeric "2/3" the overlay idiom is `SocratesSubtitle` (fixed, inset 0,
  zIndex 45, top of the safe area) — the counter belongs in that same band, in
  the chip treatment `SURFACE_GLOW` (hostStyles.ts:16).
- (c) **Connected count**: `getConnectedPlayers` (state.ts:748). Disconnect
  recompute belongs at index.ts:1768 (`player.connected = false`) alongside the
  existing recheck family (1806-1866: draw/guess/numeric/climb/blitz/agora), as
  `recheckSkipVoteOnDisconnect(room)` — a no-op outside a sequence. It must be
  able to PASS the vote with no new vote cast, since a disconnect alone can
  cross the threshold.

## 4. Smallest-change plan, ordered and sized

1. **shared/src/index.ts (S)** — `SKIP_VOTE: 'player:skip_vote'`;
   `SKIP_VOTE_PROGRESS: 'skip:progress'` (room-wide: votes/threshold/eligibility)
   and host-only `SOCRATES_STOP: 'socrates:stop'`; payload types beside
   `SocratesBeatPayload` (shared:2373).
2. **server/src/socrates.ts (S, Opus — the Greek)** — `SKIP_INTERRUPTED_LINES`
   beside `DUEL_LINES` (779)/`SPEECH_V2_LINES` (871), its `LINE_TAGS` entries
   (load-bearing: the clip is `lineHash(template, tag)`), a picker on
   `pickGameIntroLine`'s shape, and `add('SKIP_INTERRUPTED', ...)` in
   `collectVoiceLineEntries` (2240-2266) so `voice:generate` and /dev/voice see
   them. Registration only — no mp3 until October.
3. **server/src/state.ts (S)** — `room.skipVote` beside `pendingSocratesQueue`
   (351); cleared in `resetRoomForNewGame` (910). The **once-per-sequence latch
   lives here**, set in `startSocratesSequence` (phases.ts:614) and cleared when
   the drain empties (1209).
4. **server/src/phases.ts (M, Opus)** — `startSequenceSkip(room)`: discard queue,
   emit stop, re-enter `enterSocratesBeat` carrying the ORIGINAL kind. No new
   switch case, no new routing.
5. **server/src/index.ts (S)** — the `player:skip_vote` handler via
   `getPlayerRoomForSocket` (623), refusing while `room.paused` for the same
   reason `endSocratesBeat` does (604); plus the disconnect recheck (1806-1866).
6. **client/src/hooks/useGameAudio.ts (M, Opus — the risky one)** — source ref,
   generation counter, `stopSocratesLine`, ack suppression across the four
   awaits.
7. **client HostScreen (S)** — `socrates:stop` → `stopSocratesLine`;
   `skip:progress` → the counter in the subtitle band.
8. **client ControllerScreen (S)** — the button on both SOCRATES branches
   (2186, 3511), non-VIP included, gated on a sequence-in-flight flag and hidden
   on own-vote/passed/over.

### Risks to the paths the 297 gate just proved

- 297 §3 measured **0 duplicated beatIds across 12 beats** and a pause held
  inside a live beat. The stop path must not synthesise an ack (see §2) or that
  result stops holding.
- **`bots.ts:427-428` acks every `SOCRATES_SHOW` after `totalDurationMs` with NO
  beatId**, and index.ts:608 only validates `typeof beatId === 'number'` — so a
  harness host's late ack for a STOPPED line will end the interruption beat
  early. Any 299 harness must ack by id, or its timings are wrong.
- A host that reconnected mid-beat has no live source (HostScreen.tsx:1214 never
  plays), so `stopSocratesLine` must be a no-op there and the beat must still end
  via its backstop.
- A phone reconnecting mid-sequence needs the counter re-sent; `SOCRATES_BEAT`
  (421) carries only the id today.
- Open question for Argyrios: the spec says the interruption beat is never
  skippable by VOTE. Task 238's separate VIP `Παράλειψη` (ControllerScreen:2186/
  3511) would still end it unless deliberately hidden — not assumed either way
  here.
