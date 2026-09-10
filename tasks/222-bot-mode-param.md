# Task 222 — `?bot=N&mode=full`

## Goal

`?bot=N&mode=full` on `/host` creates a bot room that is ALREADY in full
mode. An all-bot room self-starts (Task 217) but has no VIP — a bot never
claims one — so `vip:set_mode` is structurally unreachable there and every
bot room was stuck in `DEFAULT_GAME_MODE` ('quiz'). The fix sets the mode at
ROOM CREATION from the query parameter. No bot is given VIP, and nothing
routes through `vip:set_mode`.

## What changed

- `shared/src/index.ts`: `HostCreateRoomPayload` gains `mode?: GameModeId`.
- `client/src/screens/HostScreen.tsx`: reads `?mode=X` once at mount (the
  same "read once, never re-derive" shape `?bot=N` already uses), keeps it
  only if it is in `GAME_MODE_IDS`, and includes it in the `host:create_room`
  payload.
- `server/src/index.ts` (`host:create_room`): validates the id against
  `listGameModeOptions()` — the identical "never trust the client" check
  `vip:set_mode` makes — and passes it to `createRoom`. An unknown id is
  logged and ignored; the room opens in `DEFAULT_GAME_MODE`. The creation log
  line now carries `(mode=…)`.
- `server/src/state.ts`: `createRoom(hostSocketId, mode = DEFAULT_GAME_MODE)`
  — one optional, already-validated parameter (state.ts holds no registry
  import, so validation stays at the call site). `Room.mode`'s comment
  updated: it is no longer "always 'quiz'".

Nothing in stage logic, scoring or any game constant was touched.
`canStartRoom` needed no change: it already reads
`modeForRoom(room).minPlayers`, so a room created in 'full' gates on full's
own minimum from the first join, and Task 217's autostart gate (which
requires the FULL `requestedBotCount`, not just the mode minimum) is what
actually decides the start moment.

## Verification

`dev/bot-mode-param-check.ts` — real sockets against a real server, no
Playwright, no screenshots. The server runs IN-PROCESS on a throwaway port so
the harness can read `room.mode`, `room.vipPlayerId` and each `player.isVip`
straight off the live `Room` (criterion 4 needs VIP ownership MID-GAME, and no
socket payload carries `isVip` outside LOBBY). The host socket emits exactly
the `host:create_room` payload `HostScreen.handleCreateRoom` builds for the
URL under test (`createRoomPayloadForUrl`, copied in shape from that
function). Criterion 1's and 2's runs write every line to `dev/222-c1-
modefull.log` / `dev/222-c2-noparam.log` as it happens.

    npx tsx dev/bot-mode-param-check.ts --only 1 --port 3910 --log dev/222-c1-modefull.log
    npx tsx dev/bot-mode-param-check.ts --only 2 --port 3911 --log dev/222-c2-noparam.log
    npx tsx dev/bot-mode-param-check.ts --only 3a --port 3912
    npx tsx dev/bot-mode-param-check.ts --only 3b --port 3913

Results per criterion are in `tasks/222-report.md`.
