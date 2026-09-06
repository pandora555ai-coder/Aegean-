# Task 173 — QR deep-link: scan → name → avatar → in

## Problem
The lobby QR leads to /play where the guest must type the 4-digit
room code. Target guest flow: scan → name → avatar → standing on
stage, no code typing.

## Rules (inline)
- Room codes are STRINGS — "0042" keeps its leading zero in the URL,
  in parsing, and in the join event.
- playerId (UUID in localStorage) is identity; the deep link changes
  nothing about identity or rejoin (task 172 behaviour stands).

## Do
- The lobby QR encodes `/play?room=XXXX` (the room code as a string).
- /play with a valid `?room=` param: the code field is auto-filled
  and HIDDEN; the guest sees only name + avatar. With no param or an
  unknown/expired code, the current manual form shows (with the code
  field), plus a brief notice when a code was present but invalid.
- The hydration guard from task 171 applies to this flow unchanged:
  controls disabled until mounted + connected.

## Acceptance criteria — report each one separately, with numbers
1. Create a room whose code has a leading zero (force or loop until
   one, or inject one in dev): the QR's encoded URL contains the
   4-char string with the zero, and joining through it lands the
   player in THAT room. Report the exact URL and the room code the
   server saw on join.
2. Fresh browser profile (empty localStorage), open the deep link:
   count the user inputs to reach the lobby — name + avatar tap +
   join only, ZERO code digits typed. Report elapsed time from page
   load to standing in the lobby (target <30s; it should be seconds).
3. /play with `?room=` of a non-existent room: the manual form
   renders WITH the code field and a visible invalid-code notice;
   /play with no param renders the manual form unchanged. Report
   both observed states.
4. Deep link + known playerId (rejoin path): join through the QR URL
   with an existing playerId — identity resumes per task 172 (report
   resumed name). Commit as task 173 and push.

After the criteria: re-run `npm run screenshot:phases`. Do NOT open
the PNGs.
