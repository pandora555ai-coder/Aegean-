# Task 172 — Rejoin identity + roster single source of truth

## Problem (observed in playtesting)
- A join carrying a KNOWN playerId (UUID in localStorage) but a
  different name/avatar RENAMED the existing player instead of
  resuming them.
- Join/leave churn produced ghost roster entries: the TV rendered 3
  players, the lobby said 1, the start gate saw <2 — three different
  counts of the same room.

## Rules (inline, non-negotiable)
- playerId (UUID in localStorage) is identity. NEVER socketId.
- Room codes are strings ("0042" keeps its zero).
- Same event name, different payloads host vs players; players never
  receive another player's identity internals.

## Do
- When a join carries a playerId already known to the room: IGNORE
  the submitted name/avatar, resume the stored identity (name,
  avatar, score, VIP status). The submitted values are discarded.
- Expire stale entries: a player whose socket has been gone past a
  grace period leaves the roster (pick a sensible grace, report it).
  In-game, keep the existing disconnect behaviour — this is about
  the LOBBY roster.
- ONE function computes the roster (count + list). TV render, lobby
  count, and the start gate all consume it. No second count anywhere.

## Acceptance criteria — report each one separately, with numbers
1. Join as "Αλέκος", capture the playerId, disconnect, rejoin with
   the SAME playerId but name "Μήτσος" + different avatar: the
   roster shows "Αλέκος" with the original avatar, score and VIP
   status intact. Report both submitted and resumed names.
2. Churn test: 5 join/leave cycles with mixed same/new playerIds,
   then report THREE numbers from live observation — TV rendered
   player count, lobby count string, start-gate count — for the same
   room state. All three equal, zero ghosts (report the roster list).
3. Grace-period expiry: disconnect a lobby player, report the roster
   count before, during grace, and after expiry (with the grace ms
   you chose). A rejoin DURING grace resumes with zero duplicate
   entries.
4. VIP survives: the first-joined player disconnects and rejoins
   within grace — still VIP (report the VIP playerId before/after).
   Commit as task 172 and push.

After the criteria: re-run `npm run screenshot:phases`. Do NOT open
the PNGs.
