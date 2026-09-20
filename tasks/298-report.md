# Task 298 — Merge speech-policy → main, deploy

## 1. Merge

- Merge commit on main: `06c3b5ca9858e8d8e9183d4b48a40a00379c3fef` (`--no-ff`,
  parents `c87443a` main + `da79d6a` speech-policy tip). Pushed:
  `c87443a..06c3b5c main -> main`.
- `v1.0-playtest` tag unchanged: annotated tag object `63e8caf1`, target commit
  still `c87443acecac829ef6af1f090a5e229fdf8c9de1` (main's pre-merge HEAD).
- Default policy, merged tree, `shared/src/index.ts:1948`:
  `  speechPolicy: 'v1',`

## 2. Deploy — verified by mtime + bundle hash, not git

- Before: `server/src/phases.ts` mtime 2026-09-19 15:36:07, sha256
  `92dd72dd162a...`; `grep -rl SPEAR_OUT /opt/party-game/server/src/` → no match.
- After: `phases.ts` mtime 2026-09-20 20:04:15, sha256 `736e7a0dc2fc...`
  (changed). `SPEAR_OUT` now present in `phases.ts`, `socrates.ts`,
  `state.ts`. New files landed: `speechSlots.ts`, `stageLedger.ts`
  (both mtime 20:04:15).
- Service restart: `ActiveEnterTimestamp` moved from Sat 2026-09-19 21:34:34
  UTC to Sun 2026-09-20 20:06:18 UTC; `systemctl is-active` → `active`;
  deploy log: `DEPLOY OK: 06c3b5c live, party-game active, voice bank 137 mp3s`.

## 3. INVERSE — protections held

Protection-line grep on `/usr/local/sbin/aegean-deploy` (voice-deleted /
voice-staging / voice-line-review.json exclude+filter pairs): **6**.

Before → after the deploy, all three unchanged:
- `voice-line-review.json` sha256: `ffa7c9136c4a79ef23575ad4b0a7f4dfc55a07606600895dc8d0a0294628c430`
  both times (matches expected `ffa7c913…`).
- `voice-deleted`: 155 → 155.
- `voice` bank: 137 → 137 (also the deploy script's own preflight/postflight
  count, unchanged).
- `voice-staging`: 265 → 265.

## 4. Live smoke — against the running production service (localhost:3001)

- `/dev/voice-audition`: `200` hit directly on `:3001` (app serves it);
  `401` with `WWW-Authenticate: Basic realm="restricted"` through the public
  Caddy gate at `demboyz11.duckdns.org` — the correct, expected response
  (never opened in a browser, per the domain restriction; both checks were
  raw `curl`, not Playwright).
- One live `?bot=3&mode=full` run, `speechPolicy: 'v2'` on `CREATE_ROOM`,
  socket-level against the real production process: room `7189`, all 7
  stages announced, reached `GAME_OVER` at 541.1s. 31 Socrates beats total —
  10 `GAME_INTRO`, 9 `STAGE_INTRO`, 1 `DRAW_INTRO`, 1 `DRAW_WINNER`,
  **7 `SPEECH_SLOT`**, 3 `WINNER` — confirming the v2 slot engine is live in
  prod. `systemctl show` after: same `MainPID=47443`, `NRestarts=0` — the
  service never restarted or crashed during the run, no error/disconnect
  observed on the host socket.
- Caveat: `journalctl -u party-game` requires root and this session's sudo
  grant is scoped to `aegean-deploy`/`aegean-ops` only (no NOPASSWD for
  general sudo, confirmed via `sudo -n -l`), so the "slot beats in the live
  log" claim above is evidenced by the harness's own socket-level capture of
  the server's `SOCRATES_SHOW` payloads (`kind: 'SPEECH_SLOT'`, server-set),
  not by reading journald text directly. Flagging this as the one criterion
  not verified by its most literal reading.

Deploy was run once, per the task's own instruction not to run it twice.
