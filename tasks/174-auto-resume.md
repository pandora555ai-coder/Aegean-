# Task 174 — /play auto-resume + connection banner

## Goal
A phone that locked or dropped mid-game comes back INTO the game
with zero interaction. Depends on task 172's identity behaviour.

## Rules (inline)
- playerId (UUID in localStorage) is identity. NEVER socketId.
- Same event name, different payloads host vs players; the resume
  path must not leak another player's data or the answer key
  (task 172/156b rules stand).
- Phone UI: no motion not driven by the finger — the banner appears/
  disappears as a state change, no animation.

## Do
- On /play load: if localStorage has a playerId that belongs to an
  ACTIVE room, skip the form entirely — show a brief «Επανασύνδεση…»
  state and rejoin straight into the current phase view. If the room
  is gone or the player was eliminated/expired, fall through to the
  normal form (with ?room= deep-link behaviour intact).
- Connection banner: on socket drop mid-game, a subtle banner
  («Χάθηκε η σύνδεση…») + inputs disabled; on reconnect, banner
  gone, inputs live, phase view current (state re-synced from the
  server, not stale client state).
- Use palette tokens; banner text --marble on --night-1 or similar.

## Acceptance criteria — report each one separately, with numbers
1. Mid-game (QUESTION phase), kill the phone's socket, wait 2
   minutes, reload /play with the same localStorage: report the ms
   from page load to the phone showing the CURRENT phase view, same
   playerId, no form shown. Target ≤5000ms.
2. During the same reconnect: report what the server re-sent (state
   sync event name) and a leak count — the resumed player payload
   contains no answer key, no other player's answers/sabotage
   internals (count the forbidden fields, must be 0).
3. Socket drop mid-QUESTION with the page open: banner visible and
   inputs disabled within 1s (report ms); reconnect → banner gone,
   inputs enabled, and the timer/phase shown matches the server
   (report phone-shown remaining time vs server remaining time,
   diff ≤1s). Do NOT pkill — lsof the port, kill the PID.
4. Stale identity: clear the room server-side (or let it end), then
   load /play — normal form renders, no resume loop, deep-link
   ?room= still works. Commit as task 174 and push.

After the criteria: re-run `npm run screenshot:phases`. Do NOT open
the PNGs.
