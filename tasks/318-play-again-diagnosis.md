# Task 318 — post-coronation "Ξανά, ίδια παρέα" / "Νέο παιχνίδι": diagnosis only

No code changed. Context check: branch main, clean tree, but HEAD = eea2c09 (CLAUDE.md
plugin rule, decision 010, committed in-session, NOT pushed) sitting one commit ahead of
origin/main = e949d36 (317). Read tasks/316 and tasks/317.

## 1. State inventory

Game state is created in ONE object literal: `createRoom`, server/src/state.ts:501-553
(Room literal 503-549), plus nested factories `createSocratesState` socrates.ts:149 and
`createStageLedger` stageLedger.ts:113. Today's play-again is `resetRoomForNewGame`
state.ts:966-1021 — exactly the field-by-field clearing the design forbids. It already
MISSES one field: `questionStartedAt` is never reset (harmless today, proof of the risk).

SURVIVES (same-room path): code, hostSocketId, createdAt, players (playerId, name,
avatarId, socketId, connected, isVip, isPresetName, isBot; `score` -> 0), mode, settings
(incl. speechPolicy, gameLength), requestedBotCount, vipPlayerId, audioVolume,
emptyTtlTimer and lobbyGraceTimers (live infrastructure, not game state — keep/re-arm).

RESETS: phase, stage, questions (rebuilt by buildRoomQuestions), currentQuestionIndex,
answers, questionStartedAt, activeTimer, lastReveal, paused, pausedByName, pausedAt,
socrates {players, usedLines, momentFireCounts, ledger {entries, targetedThisStage,
firedSlots — the v2 alternation/"never twice" state lives here}}, gameIntroPlayed,
pendingSocratesBeat, pendingSocratesQueue, skipVote, socratesBeatId, socratesBackstopMs,
socratesHoldMs, gameStartedAt, stageTimings, activeSabotageByTarget,
shuffledOptionsByTarget, powerUpChoices, pendingPowerUpByTarget, steal, climb (holds the
spear latch `spearBeatPlayed` state.ts:171 and duel picks; created phases.ts:1547),
crowdMood, crowdTensionTimer, drawWarningTimer, crowdIntensityCtx.

OUTSIDE the Room literal (a whitelist over Room would miss these):
- Mode state in WeakMaps keyed by the Room OBJECT: drawStateByRoom draw.ts:125,
  blitzStateByRoom blitz.ts:66, numericStateByRoom numeric.ts:63, agoraStateByRoom
  agora.ts:75. Never cleared by reset; each segment start delete+sets. If the rebuild
  REPLACES the Room object they orphan (fine), but so does every closure still holding
  the old object — rebuild onto the same object (assign fresh game-state fields) instead.
- botsByRoom bots.ts:105 (keyed by code). finishGame already disconnects bots; play-again
  re-spawns `requestedBotCount` FRESH bots (new playerIds) — "bots carry over" means that.
  Bot answer setTimeouts bots.ts:291-405 are untracked (no-ops once the socket is gone).
- socketAssociationBySocketId index.ts:210 and Socket.IO room membership (socket.join
  at index.ts:801/827/900/988) — both keyed by code, matter only for "Νέο παιχνίδι".
- Client: phone localStorage `lastSession` (lastSession.ts), TV `hostRoomCode`
  (hostRoomCode.ts), HostScreen's own field-by-field LOBBY clear (HostScreen.tsx:624-665,
  incl. podiumTimeoutRef) — the client twin of the same anti-pattern.
- socratesBeatId: reset puts it back to 0, so a late ack from game N can carry an id that
  is valid again in game N+1 (endSocratesBeat's stale-id guard, index.ts:630). Keeping it
  monotonic is safer, but dev/end-state-timer-subtitles-check.ts:516 ASSERTS it restarts
  at 1 — a decision, not a detail.
- Design decision flagged: today's reset keeps DISCONNECTED players too (with a lobby
  grace, index.ts:278); the brief says "connected players carry over".

## 2. End-of-game paths

Five GAME_OVER sites: phases.ts:2263 (finishGame — the full show; the climb's every
terminal path funnels through endClimb phases.ts:2250 -> the WINNER coronation sequence
-> advanceFromSocrates `case 'WINNER'` phases.ts:1414 -> finishGame; also direct at
1476/2255 when no coronation line is available), agora.ts:605, draw.ts:1034,
blitz.ts:445, numeric.ts:476 (standalone dev modes, each its own finishGame copy).
At GAME_OVER already: activeTimer cleared (phases.ts:2264), pendingSocratesBeat nulled
and closeSkipVote run at the one drain site (phases.ts ~1388-1393; the coronation opens
no vote anyway), bots cleaned. Still possibly pending: a stale host socrates:audio_ended
(rejected by the phase guard index.ts:604), emptyTtlTimer if the room is empty,
crowdTensionTimer/drawWarningTimer (null by then; reset clears them), the TV's
PODIUM_DELAY_MS 6000 timeout (HostScreen.tsx:1152). GAME_PAUSE is refused in GAME_OVER
(index.ts:1798), so no pause interplay.
Creation today: CREATE_ROOM index.ts:773 -> createRoom + optional speechPolicy/mode +
socket.join + ROOM_CREATED + spawnBots; TV stores the code (HostScreen.tsx:557) and
reloads via HOST_REJOIN index.ts:816. Same-room path = VIP_PLAY_AGAIN index.ts:1719
(reset + spawnBots + armLobbyGraceForAllDisconnected + PHASE_CHANGED LOBBY + lobby update).
"Νέο παιχνίδι" has NO existing event to tell old phones: today they learn only on their
next join (JOIN_REJECTED ROOM_NOT_FOUND -> clearLastSession, ControllerScreen.tsx:890).
It needs a new room-wide event emitted to io.to(oldCode) BEFORE deleteRoom(old)
(state.ts:559 clears its timers), telling phones to clearLastSession. Hazard: 4-digit codes
are reused; a phone that missed the event and auto-resumes a reused code whose room lacks
its playerId falls through PLAYER_JOIN's fast path (index.ts:883) into a NORMAL join of a
stranger's room. The TV needs socket.leave(old)/join(new), socketAssociation rewrite and
setStoredHostRoomCode(new).

## 3. Hook points

First-press-wins: both handlers check `room.phase === 'GAME_OVER'` and leave it
synchronously in the same tick (Node is single-threaded) — VIP_PLAY_AGAIN already guards
this way (index.ts:1725); "new game" must delete/mark the old room in that same tick, and
the idle timer's callback goes through the same guarded function. No extra latch needed.
CONFLICT to rule on: CLAUDE.md "TV = display only (no input)" / "TV cannot control the
game" — a TV button is a new input path, and the TV socket is role 'host', which
getVipRoomForSocket rejects.
5-min idle timer: new Room field (in the whitelist factory, RESETS), armed at GAME_OVER —
one helper called from all five finishGame sites, or phases.ts:2262 alone if only the
full show counts. Not via timers.ts' activeTimer (GAME_OVER is unpausable), a
SimpleTimer like crowdTensionTimer. Cancel in: both press handlers, the reset itself,
deleteRoom (state.ts:559, beside the crowd timers), and the disconnect handler
(index.ts:1870) when getConnectedHumans (state.ts:809) hits 0. Note ROOM_TTL_MS
(state.ts:294) is ALSO 300000 — without that cancel the two would race on an empty room.
Open: start at GAME_OVER or at the podium (+6s, client-only); re-arm on a human's return?

## 4. Flake verdict — harness sampling race, not a 316 behaviour change

6 sequential runs, interleaved (git worktree at 03cd60e, node_modules + voice symlinked):
HEAD 26/27, 26/27, 27/27; 03cd60e 27/27 x3. HEAD failures: run 1 "every captured
subtitle matches its payload" (1 mismatch), run 2 "one captured beat is an Ανάβασις rule
line — none found". Each run ~19-23 min (two full shows).
Mechanism (run 2, server log): all three Ανάβασις rule beats played (beats 20-22), but
all three ended on `socrates:audio_ended` — the VIP phone never pressed skip. The
harness samples the TV subtitle ONLY inside onBeforeSkip (dev/…-check.ts:242 ->
sampleCurrentBeat:206), so no press = no capture. The mismatch is the same sampler's
other edge: it stamps whatever subtitle is in the DOM onto the newest un-captured beat
(:207-211), i.e. the previous line if the TV hasn't rendered the new one yet.
316 cannot reach this: 03cd60e..HEAD touches no server/shared file and no in-game client
file (LandingScreen, LobbyView, hostStyles, and two lines of HostScreen — `autoFocus` on
the audio gate, `focusCreate` into LobbyView). Honest caveat: across 317+318 the tally is
HEAD 4/6 failing vs 03cd60e 0/5, and HEAD's game-1 skip presses ran 16-17 vs 18-19 at base;
no mechanism for that difference was found, so the lopsidedness is unexplained, but every
observed failure is the sampler, not the game.
Speed-up (the harness takes ~20 min for a few seconds of subtitle evidence): capture
subtitles with an in-page MutationObserver on `socrates-subtitle` (deterministic, no
dependency on skip presses), and split criterion 4 into its own harness that enters the
climb via startClimb (with `room.gameIntroPlayed = true`, Task 237) — minutes, not 20.
