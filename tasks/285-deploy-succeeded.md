# Task 285 — deploy 274-283 to prod, third attempt — SUCCEEDED

All three preconditions passed. `sudo /usr/local/sbin/aegean-deploy` ran once,
completed cleanly, and the live service is now running the new code.

## 1 — preconditions (all three passed)

- (a) protection patch: `grep -cE "voice-deleted|voice-staging|voice-line-review\.json" /usr/local/sbin/aegean-deploy` → **6**.
- (b) all 7 Task-279 hashes present in prod `voice-staging`: **7/7** found
  (bd12930f9369aa78, 908d6d37b36aa4e9, 8a1a964d20b629b2, 2edec02cc8a0cd0a,
  9b482d51db0ca0d7, 029e4cb422893a1d, 069ef3480d9af33f). Staging count: **265**.
- (c) bank-floor gate: `26:VOICE_MIN=100   # mp3 floor, lowered 2026-09-20 after the 155-clip audit (bank=130)`.
  Deploy's own preflight logged `voice-bank preflight: 130 mp3s present (floor 100)`.

## 2 — deploy verified by mtime + bundle hash + CORONATION_SET

- Client bundle: `index-CzbfZe1o.js` (Sep 18 14:15, sha256 `8b04fef...`) →
  `index-EwSeHgYf.js` (**Sep 19 21:34**, sha256 `f0d194ea418b7f7c3243a4bc8c65c0f4b8f6253c5ef05ad41aa4c0d1b0b70f6c`)
  — filename, mtime, and hash all changed.
- `grep -c CORONATION_SET /opt/party-game/server/src/socrates.ts`: **0 before → 17 after**.
- Service: PID **8539 → 29700**, `ActiveEnterTimestamp` **2026-09-18 14:15:31 →
  2026-09-19 21:34:34 UTC** (restarted), `ActiveState=active`/`SubState=running`.
  Deploy's own log: `DEPLOY OK: c9759ae2dc916d55511079cf67130ef44d4282b2 live,
  party-game active, voice bank 130 mp3s`.

## 3 — INVERSE, protections held

- `voice-line-review.json` sha256: `ffa7c9136c4a79ef23575ad4b0a7f4dfc55a07606600895dc8d0a0294628c430`
  — unchanged, matches criterion 3's expected value.
- `voice-deleted`: **155** — unchanged.
- bank: **130** — unchanged (postflight log confirms `130 mp3s (was 130)`).
- `voice-staging`: **265** — unchanged from criterion 1(b).

## 4 — /dev/voice-audition + bundle hash change

`curl http://127.0.0.1:3001/dev/voice-audition` (no credentials, direct to
the Node port, bypassing Caddy's basic auth) → **HTTP 200**, the SPA's own
`index.html`, now referencing `/assets/index-EwSeHgYf.js` — the new, changed
bundle from criterion 2. This is the "200 SPA" branch the brief allowed for;
Caddy's basic-auth 401 only applies on the public proxy path, not this direct
localhost check. The actual audition page's content — reachable only through
Caddy with credentials — is Argyrios's own check from his phone, not
reproducible here.

**274-283 are now live in prod.**

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ukzs1z2LL1d9Ym5Dwf3js
