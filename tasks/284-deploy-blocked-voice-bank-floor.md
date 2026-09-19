# Task 284 — deploy 274-283 to prod (authorised) — ABORTED by the deploy script itself

Both of the task's own two preconditions passed. `sudo /usr/local/sbin/aegean-deploy`
was then run once, as instructed. It did not deploy: it hit a THIRD gate, inside
the script itself, that the task brief did not name — the voice-bank floor added
2026-09-17 (`VOICE_MIN=283`, aegean-deploy:26). Prod's live voice bank
(`/opt/party-game/client/public/voice`) holds **130** mp3s, not >=283, so the
script died in its own preflight, before touching git, rsync, or the service.
**Nothing was deployed. No second run was made**, per the brief.

## 1 — preconditions (both passed)

- (a) protection patch: `grep -cE "voice-deleted|voice-staging|voice-line-review\.json" /usr/local/sbin/aegean-deploy` → **6**.
- (b) all 7 Task-279 hashes present in prod `voice-staging`: **7/7** found
  (bd12930f9369aa78, 908d6d37b36aa4e9, 8a1a964d20b629b2, 2edec02cc8a0cd0a,
  9b482d51db0ca0d7, 029e4cb422893a1d, 069ef3480d9af33f). Exact staging count:
  **265** (258 → 265, +7, matches the 279 report).

## 2 — deploy result: ABORTED, not verified live

`sudo /usr/local/sbin/aegean-deploy` output:
```
aegean-deploy: DEPLOY ABORTED during voice-bank preflight: voice bank holds 130 mp3s, expected >= 283 - refusing to deploy
```
This is the script's own preflight (aegean-deploy:67-73), which runs before any
git/rsync/build/restart step. Confirmed nothing moved:
- Client bundle mtime: `index-CzbfZe1o.js` **Sep 18 14:15** before AND after the
  attempt — unchanged.
- `party-game.service`: `ActiveEnterTimestamp` **Fri 2026-09-18 14:15:31 UTC**,
  MainPID **8539**, before and after — unchanged, never restarted.
- CORONATION_SET cannot be "present in the new server bundle" because there is
  no new server bundle — the service is still running the pre-274 code.

## 3 — INVERSE, protections held (trivially — nothing ran)

- `voice-line-review.json` sha256: `ffa7c9136c4a79ef23575ad4b0a7f4dfc55a07606600895dc8d0a0294628c430` —
  matches, unchanged.
- `voice-deleted`: **155** — unchanged.
- bank: **130** — unchanged (and is the very count that blocked the deploy).
- `voice-staging`: **265** — unchanged from criterion 1.

## 4 — /dev/voice-audition GET, no credentials

`curl http://127.0.0.1:3001/dev/voice-audition` → **HTTP 200**, 395-byte body
(the SPA's own catch-all `index.html`, not a distinct audition page or a 401).
Not the expected 401: the route Task 281 built is in the *repo*, not in *prod*
— the running service is still pre-274 code, so this is a direct consequence
of criterion 2, not a separate failure. Cannot check "page content is
Argyrios's from his phone" against a page that isn't live.

## Why this wasn't caught by the task's own precondition list

`VOICE_MIN=283` is a THIRD gate the brief didn't ask to check ahead of time —
it lives inside the deploy script (added 2026-09-17, alongside the protection
patch from Task 283/283's own predecessor work), separate from both named
preconditions. Prod's bank sits at 130 because prior tasks (280) moved most of
it into `voice-deleted` as a backup and never restored it. Restoring bank
files is exactly the kind of destructive/irreversible call this repo's own
rules say to stop and ask about, not infer — left undone here, on purpose.

**Deploy did not happen. 274-283 are not live.** Whether to restore the bank
from `voice-deleted`, lower `VOICE_MIN`, or something else is Argyrios's call.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ukzs1z2LL1d9Ym5Dwf3js
