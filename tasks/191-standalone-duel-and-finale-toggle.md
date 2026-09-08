# 191 — Standalone duel mode + finaleMode VIP setting

Two small pieces that complete the test menu: the duel as a
standalone dev-harness mode (the house pattern — quiz/draw/numeric/
blitz stay VIP-selectable for exactly this reason), and a lobby
toggle for the finale so no test needs a redeploy. Zero new
mechanics: everything reuses 188b's phases and 177's settings
pattern.

## Scope A — standalone duel mode

- GameModeId gains 'duel'; register in the mode registry per
  modes/README.md. crowdIntensityFor already has DUEL_* cases —
  confirm, add nothing.
- Flow: LOBBY → DUEL_PICK → DUEL_REVEAL, ties re-enter DUEL_PICK
  (the existing loop), winner → GAME_OVER. Duelists = the first two
  players by join order; everyone else spectates via the existing
  spectator payloads. Start gate: minimum 2 players.
- GAME_OVER winner banner, no digits. Return-to-lobby restarts
  normally (VIP confirm as everywhere).
- Continuations/pause: 188b's DUEL_PICK entry must already cover
  this mode's timer — verify, don't duplicate.

## Scope B — finaleMode VIP setting

- The VIP lobby settings gain «Φινάλε»: «Η Δίκη» (default) /
  «Η Ανάβασις» — wired to room.settings.finaleMode exactly like
  powerUpsEnabled's toggle: server-validated, non-VIP rejected,
  persists across HOST_REJOIN.
- Applies wherever the shared branch site applies (quiz and full).

## Acceptance criteria (report each separately, with numbers)

1. Full standalone duel with ?bot=2 through GAME_OVER; report the
   phase sequence and that a forced tie looped DUEL_PICK (state
   how forced).
2. A 4-player standalone duel (2 duel, 2 spectate): spectator
   payload leak count 0 weapon strings, and the two non-duelists
   never receive a pick prompt (report the check).
3. VIP toggle end-to-end (Playwright phone as VIP): flip the finale
   to «Η Ανάβασις», start a SHORT standalone quiz with ?bot=2,
   reach CLIMB_QUESTION; report the phase sequence, that the
   setting survived a host reload (HOST_REJOIN), and that a
   non-VIP phone's flip attempt is rejected server-side (report
   the log line).
4. Regression + typecheck: one default-settings full game still
   runs the TRIAL finale (report its sequence has TRIAL_QUESTION,
   no CLIMB_*/duel-mode contamination); tsc passes; GameModeId
   union reported verbatim.

Report under 8 lines. Commit the task file with the work, push.
