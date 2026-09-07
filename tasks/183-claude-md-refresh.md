# Task 183 — CLAUDE.md refresh: new invariants from tasks 171-182

## Do
Update CLAUDE.md (repo root) with the following, integrated where
they fit (do not restructure the whole file, do not delete existing
rules that still hold):

- Roster: canStartRoom(room) in state.ts is the ONLY source of
  truth for roster count / start eligibility. Never add a second
  count. LOBBY_DISCONNECT_GRACE_MS = 20000 governs lobby-roster
  expiry; VIP migration for LOBBY disconnects defers to grace
  expiry (in-game migration stays immediate).
- Bots: ?bot=N (cap 7) spawns server-side bots; never VIP;
  cleanupRoomBots runs in every mode's finishGame.
- powerUpsEnabled: room setting, default false — POWER_UP is
  skipped; machinery must never be deleted. The screenshot harness
  opts in (powerUpsEnabled: true) to keep 17/17 coverage.
- VIP audio: vip:set_audio_volume relayed server→host; crowd master
  gain sits ABOVE the three-loop equal-power crossfade — never
  touch the three crossfade gains individually. Defaults 100/100 =
  bed .6 / voice 1.0. Values persist via HOST_REJOIN.
- Greek uppercase: ALL uppercased Greek text (titles AND names)
  renders through greekUpper (client/src/greekUpper.ts). Never use
  raw text-transform/toUpperCase on Greek strings.
- dev-shots: harness writes to client/public/dev/shots (under the
  /dev basic-auth prefix), 17 TV + 9 phone (360×640) PNGs, linked
  from ΔΟΚΙΜΕΣ. Anything new for testing/review goes UNDER /dev,
  never a public sibling path. Live shots refresh only on deploy
  after a harness run.
- Deploy confirm strings must be runtime literals (event names,
  setting keys) — never function identifiers; the minifier renames
  them.

## Acceptance criteria — report each one separately
1. Diff summary: which sections changed, line count added/removed.
2. Grep proof each of the 7 bullets landed (one matching line each).
3. No existing still-valid rule was deleted (state how checked).
   Commit as task 183 and push.
