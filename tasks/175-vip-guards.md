# Task 175 — VIP guards: no double start, no accidental lobby return

## Problem (observed in playtesting)
The active «Έναρξη» button remained on the VIP's phone during the
game intro — a second tap risks a second game instance. And
«Επιστροφή στο lobby» is one accidental tap from killing a night.

## Rules (inline)
- VIP = first player to join, by playerId. The TV cannot control
  the game.
- Server-authoritative: the client hiding a button is cosmetics;
  the SERVER must reject an invalid start.
- Phone UI: no motion not driven by the finger; the confirm dialog
  appears as a state change, no animation. Palette tokens only.

## Do
- Hide «Έναρξη» on the VIP phone the moment the game starts (phase
  leaves LOBBY), and on rejoin/resume into a running game.
- Server: vip:start_game while a game is already running in that
  room is REJECTED (no state change, optionally a log line). Use
  canStartRoom from task 172 if it fits.
- «Επιστροφή στο lobby» mid-game requires a confirm step (two taps:
  the button, then a visible confirm) — single tap does nothing
  destructive.

## Acceptance criteria — report each one separately, with numbers
1. Double-start: fire vip:start_game TWICE in quick succession at
   the socket level (bypassing the UI, worst case): exactly ONE game
   instance runs — report the phase transitions the server emitted
   and the room's game count.
2. Start while running: with a game mid-QUESTION, send
   vip:start_game again — server rejects, phase unchanged (report
   the phase before/after and the rejection evidence).
3. VIP phone observation: at LOBBY «Έναρξη» visible; the frame the
   phase changes, hidden; on VIP resume into a running game (task
   174 path), still hidden. Report the three observed states.
4. Lobby-return confirm: mid-game, one tap on «Επιστροφή» → game
   unaffected (report phase continuity); tap + confirm → lobby.
   Commit as task 175 and push.

After the criteria: re-run `npm run screenshot:phases`. Do NOT open
the PNGs.
