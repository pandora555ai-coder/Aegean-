# Task 222 — report

`?mode=X` on /host is now part of `host:create_room` (validated against the
mode registry, then passed to `createRoom`). No bot gets VIP; `vip:set_mode`
is untouched. Harness: `dev/bot-mode-param-check.ts` (real sockets, server
in-process on a throwaway port so VIP can be read off the live Room; no
Playwright, no screenshots). Logs: `dev/222-c1-modefull.log`,
`dev/222-c2-noparam.log`, `dev/222-c3a.log`, `dev/222-c3b.log`.

## 1. `?bot=6&mode=full` — PASS (room 7481, dev/222-c1-modefull.log)

Payload sent: `{"botCount":6,"mode":"full"}`. Mode BEFORE start, two
independent reads: in-process `room.mode = 'full'` at ROOM_CREATED, and the
wire's own `lobby:update.mode = 'full'` on all six lobby updates.
Observed stage sequence (7/7, in order): 1 Η Αγορά | 2 Η Παλαίστρα |
3 Ζωγραφική | 4 Εκτίμηση | 5 Η Μνήμη της Αγοράς | 6 Η Συκοφαντία |
7 Η Ανάβαση. Phase counts confirm each segment's mechanic really ran:
10 QUESTION (5+5, `long`), 1 BLITZ + 1 BLITZ_REVEAL, 3 DRAW + 18 GUESS,
3 NUMERIC_QUESTION, AGORA_EXPOSE + 3 AGORA_QUESTION, 5 STEAL,
7 CLIMB_QUESTION, then GAME_OVER. **Total wall clock: 750.5s** (start ->
GAME_OVER; 771.9s at Task 221 for the same 6-bot shape).

## 2. `?bot=6`, no mode parameter — PASS (room 2674, dev/222-c2-noparam.log)

Payload sent: `{"botCount":6}`. `room.mode = 'quiz'` in-process and
`lobby:update.mode = 'quiz'` on the wire. Observed stage sequence (4/4):
1 Η Αγορά | 2 Οι Σοφιστές | 3 Η Συκοφαντία | 4 Η Ανάβαση — the quiz's own
3 stages + the finale row, 12 questions (3/5/4), 4 STEALs in stage 3, then
10 CLIMB rounds to GAME_OVER in 363.3s. No blitz/draw/numeric/agora phase
appeared at any point. Unchanged from before this task.

## 3. Autostart — PASS

3a (`?bot=6&mode=full`, no other socket, dev/222-c3a.log): `lobby:update`
player counts seen while still in LOBBY were [1, 2, 3, 4, 5, 6]; the first
non-LOBBY phase (SOCRATES, the game intro) landed with
`getConnectedPlayers(room).length` = **6 of 6 bots**, mode 'full'. Not
earlier — Task 217's gate requires the full `requestedBotCount`, and full's
`minPlayers` alone would have allowed 2.
3b (same URL + one human socket, dev/222-c3b.log): human joined first and
took VIP; roster filled to 7 (6 bots + human), `canStart` true the whole
time, and the room stayed in **LOBBY for the full 45s watch** — autostart
never fired (`roomHasOnlyBots` is false forever once a human is in).

## 4. INVERSE — no bot ever holds VIP — PASS (criterion 1's run)

Observed by reading the LIVE Room object in-process (no payload carries
`isVip` outside LOBBY): `room.vipPlayerId` plus every `player.isVip` flag,
sampled 59 times across the 750.5s run — at ROOM_CREATED, at the start
instant, at each of the 7 stage announcements, every 15s mid-game, and at
GAME_OVER. **Value at every one of the 59 samples: `vipPlayerId = null`,
`isVip`-flagged players = none, with 6/6 bots in the roster** (0/0 at the
end, after cleanupRoomBots). Non-null samples: 0. For contrast, 3b's human
shows the flag working: `vipPlayerId=<human> holder=Ανθρωπος isBot=false`.

## Found, not fixed (out of scope)

Only SEVEN avatars have art on disk (`server/src/avatars.ts` cross-references
`client/public/avatars`), and `spawnBots` claims the first N by catalogue
order. A human joining a `?bot=6` room on one of those six avatars gets that
bot's `player:join` REJECTED (the bot logs the rejection and never retries),
so the room silently ends up one bot short — first hit in 3b's own first run
(5 bots, not 6), which is why the harness's human uses 'cerberus'.
Pre-existing since Task 176; nothing in this task touches it.
