# Task 217 report — ?bot=N: self-starting, replay-surviving bot rooms

Model: Sonnet. Room lifecycle + bot spawning only — no stage mechanic,
scoring, phase-machine transition logic, or climb/duel code touched.
`git diff --stat`: `server/src/index.ts` (+60/-5), `server/src/state.ts`
(+21). New verification harness: `dev/bot-room-lifecycle-check.ts`
(socket-level, throwaway servers, no Playwright).

## What changed

- `Room.requestedBotCount: number` (state.ts) — the `?bot=N` a room was
  created with, set once in `host:create_room`'s handler, never reset by
  `resetRoomForNewGame` (a room preference, like `settings`).
- `roomHasOnlyBots(room)` (state.ts) — every player in the roster `isBot`,
  and the roster is non-empty (guards the vacuous-`true`-on-0-players case).
- `startGame(room)` (index.ts) — the `buildRoomQuestions` +
  `currentQuestionIndex = 0` + `modeForRoom(room).start(room)` sequence,
  extracted so `vip:start_game` and the new auto-start call the exact same
  path.
- `maybeAutoStartBotRoom(room)` (index.ts) — fires `startGame` when
  `phase === 'LOBBY'`, `requestedBotCount > 0`, `roomHasOnlyBots`, the FULL
  requested count is connected (not just the mode's own minimum — see the
  criterion 1 bug below), and `canStartRoom`. Called once at the end of
  `player:join`'s new-join branch, after the lobby broadcast.
- `vip:play_again` and `vip:reset_to_lobby` both call
  `spawnBots(room.code, room.requestedBotCount)` (if `> 0`) right after
  `resetRoomForNewGame` — the former because `finishGame`'s own
  `cleanupRoomBots` already emptied the roster by the time `GAME_OVER` is
  reachable; the latter explicitly clears bots itself first (game may still
  be mid-flight) before doing the same re-spawn.

## Bug found and fixed during verification

Criterion 1's first run showed autostart firing at 2 of 3 requested bots —
`canStartRoom`'s check alone (`connected >= modeForRoom(room).minPlayers`,
i.e. quiz's `MIN_PLAYERS = 2`) was satisfied before the 3rd bot had joined.
Fixed by also requiring `getConnectedPlayers(room).length >=
room.requestedBotCount`, verified in the criterion 1 numbers below (all 3
bots joined before autostart).

## 1. AUTOSTART — PASS

`?bot=3`, only the host's own socket connected (a host connection is never
a "player" — `roomHasOnlyBots` never sees it), nothing else touched.
Observed: **autostart fired: YES**, no `vip:start_game` ever sent.
**Elapsed ROOM_CREATED → first QUESTION: 25557ms (25.6s)** — three bots
joining asynchronously plus `GAME_INTRO` (Socrates beat, held for its
`SOCRATES_MAX_DURATION_MS` = 11000ms backstop since nothing ever acks it in
this harness) plus `STAGE_ANNOUNCE_DURATION_MS` = 3500ms account for nearly
all of it. Full stage-1 phase sequence:
`SOCRATES@52ms → STAGE_ANNOUNCE(stage=1)@11053ms → SOCRATES@14556ms →
QUESTION@25557ms`.

## 2. REPLAY — PASS

`?bot=3` + one scripted human (VIP; `vip:play_again`/`vip:reset_to_lobby`
require a VIP and a bot can never hold one, so this criterion necessarily
includes the same "?bot=N + one scripted human" shape every prior harness
in this repo already uses — mode set to `blitz` purely for speed).

- Game A: **reached GAME_OVER**.
- `vip:play_again` fired → **4 players (1 human + 3 bots), canStart=true**.
- Game B started, abandoned mid-`BLITZ` with `vip:reset_to_lobby` → **4
  players (1 human + 3 bots), canStart=true**.
- The game that played out after that reset (mode set again, started
  again): **reached GAME_OVER: true**.
- **VIP throughout**: the scripted human's `playerId` — a bot never held
  it, confirmed at every `LOBBY_UPDATE`.
- **canStart false anywhere it should have been true: NO (never false)**.

## 3. HUMAN GUARD (inverse) — PASS

`?bot=2`, one real client joins before both bots. Observed: **VIP
holder = the human's own `playerId`**, `LOBBY_UPDATE`'s `isVip: true` for
that row. Watched 5s of quiet after all 3 (1 human + 2 bots) had joined:
**auto-start fired despite a human present: NO (correct)**. The human's own
`vip:start_game` was then sent and the game **reached QUESTION (or
further) normally: true** — confirmed via a `host:rejoin` state:sync
(`phase=SOCRATES`, i.e. past `LOBBY`) after an environment-level socket
hiccup dropped the harness's own host/human sockets a few seconds into
`GAME_INTRO` (see "Harness-only findings" below — not a server bug).

## 4. NO-BOT REGRESSION (inverse) — PASS

A room created with no `botCount` at all, two real clients joining in
turn (distinct avatars — see below).

- After 1 human joins: **player count=1, VIP=that player (isVip=true),
  canStart=false** (quiz's `MIN_PLAYERS` = 2, unmet by 1).
- After a 2nd human joins: **player count=2, VIP UNCHANGED — still the
  first player (isVip=true) — the 2nd player's own isVip=false,
  canStart=true**.

Exactly the pre-217 rule (`claimVipIfVacant` only fires when
`vipPlayerId === null`), unaffected by any of this task's changes.

## Harness-only findings (not server bugs, not fixed — reported for the record)

1. **Criterion 4's first two attempts weren't a server issue**: both
   scripted humans defaulted to `avatarId: 'sphinx'`, so the second
   `player:join` was legitimately `JOIN_REJECTED` (`AVATAR_TAKEN`) — correct
   server behavior. The harness wasn't listening for `JOIN_REJECTED` at
   all, so it misreported the immediate rejection as a 15s timeout. Fixed
   in the harness by giving each scripted human its own avatar and by
   racing `player:joined` against `join_rejected`.
2. **A transient socket.io disconnect**, observed twice (criterion 3, both
   before and after isolating it onto its own idle server — ruling out
   cross-criterion CPU contention as the cause), dropped an otherwise-idle
   host/human socket a few seconds into a `GAME_INTRO`/`STAGE_INTRO`
   Socrates hold. Root cause not identified (didn't reproduce on a 3rd,
   successful attempt); worked around with a `host:rejoin` + `state:sync`
   fallback. Server-side logs confirm the ROOM was never affected — "game
   continues running" — only the harness's own observing sockets were.

## Bug found, NOT fixed (out of this task's scope)

**`migrateVipAwayFrom` (state.ts, pre-existing, untouched by this diff)
does not exclude bots** when picking the next VIP after the current VIP
disconnects mid-game: `getConnectedPlayers(room)[0]` — unlike
`claimVipIfVacant`, which explicitly never lets a bot claim a vacant VIP —
has no `!player.isBot` filter. Reproduced repeatedly in this session's
harness runs (a human VIP disconnecting mid-game, in a room with connected
bots, left `isVip: true` on a bot). This directly contradicts the Core
rule "a bot never claims VIP" and predates Task 217 (this diff never
touches `migrateVipAwayFrom`) — flagged here rather than fixed, since
fixing it would mean editing VIP-migration logic tied to the disconnect
path, outside "room lifecycle + bot spawning" as scoped for this task.

## Typecheck

`npm run typecheck` (shared + server + client): clean, no output, on every
revision of the server changes in this task.
