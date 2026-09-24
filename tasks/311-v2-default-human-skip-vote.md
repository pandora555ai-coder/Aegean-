# Task 311 — v2 default; skip vote counts humans only; dev-hook gate check

1. `DEFAULT_ROOM_SETTINGS.speechPolicy` 'v1' -> 'v2' (shared/src/index.ts). Absent `?policy` = v2;
   `?policy=v1` and the lobby toggle still select v1. Tag v1.0-playtest = frozen v1 show.
2. `skipVoteThreshold`/`liveSkipVotes`/`skipVotePassed` (state.ts) and the progress payload
   (phases.ts) use `getConnectedHumans` (new). Zero humans -> `open: false`, no button.
   Disconnect recompute and pause guard untouched.
3. Dev-hook gate audit (read-only, no fix needed):
   - `AEGEAN_DEV_HIDE_CLIPS` (socratesAudio.ts:50): `process.env.NODE_ENV !== 'production' ? process.env.AEGEAN_DEV_HIDE_CLIPS : undefined`
   - `FORCE_CORONATION_SET` (socrates.ts:676): `!isProduction ? process.env.FORCE_CORONATION_SET : undefined`, `isProduction = process.env.NODE_ENV === 'production'`
   - (same idiom: FORCE_QUESTION_ID questions.ts:139, FORCE_BLITZ_LONGEST blitz.ts:48)
   - /etc/systemd/system/party-game.service: `Environment=NODE_ENV=production`, `Environment=PORT=3001`; no EnvironmentFile, no .d drop-in;
     `systemctl show party-game -p Environment` = `NODE_ENV=production PORT=3001`. Neither hook var is set anywhere in prod.
   - Activation needs BOTH NODE_ENV != production AND the hook var explicitly set, so no hook can fire without an explicit opt-in.
     (Residual: a process started with NODE_ENV unset would honour a hook var if one were also set — not the case for the unit.)

Check: `npx tsx dev/311-check.ts` (A,C,D,E) and `SCENARIO=B ...` (own ports).
Note: dev/300-skip-vote-check.ts scenario E has 3 stale count expectations from Task 309 (521/14/43 vs 533/18/55), unrelated to this task.
