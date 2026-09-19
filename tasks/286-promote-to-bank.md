# Task 286 — promote the 7 approved clips to the bank

`sudo -n aegean-ops promote-to-bank` — the tool's first production promote.
All 7 approved, all 7 landed. No code changed; no deploy.

## 1 — full ledger, quoted

```
PROMOTED  bd12930f9369aa78.mp3  -> /opt/party-game/client/public/voice/bd12930f9369aa78.mp3
PROMOTED  908d6d37b36aa4e9.mp3  -> /opt/party-game/client/public/voice/908d6d37b36aa4e9.mp3
PROMOTED  8a1a964d20b629b2.mp3  -> /opt/party-game/client/public/voice/8a1a964d20b629b2.mp3
PROMOTED  2edec02cc8a0cd0a.mp3  -> /opt/party-game/client/public/voice/2edec02cc8a0cd0a.mp3
PROMOTED  9b482d51db0ca0d7.mp3  -> /opt/party-game/client/public/voice/9b482d51db0ca0d7.mp3
PROMOTED  029e4cb422893a1d.mp3  -> /opt/party-game/client/public/voice/029e4cb422893a1d.mp3
PROMOTED  069ef3480d9af33f.mp3  -> /opt/party-game/client/public/voice/069ef3480d9af33f.mp3
```
7 promoted, **0 refused**, exit code **0**.

## 2 — bank state after

Bank count: **130 → 137**. Each of the 7 confirmed in the bank: owner
`partygame:partygame`, mode `644` (`install -o partygame -g partygame -m 644`
per the script), md5 identical to its staging original for all 7 — e.g.
`bd12930f9369aa78.mp3` bank md5 `56e0ec0e...` = staging md5 `56e0ec0e...`; same
match for all remaining six (908d6d37b36aa4e9, 8a1a964d20b629b2,
2edec02cc8a0cd0a, 9b482d51db0ca0d7, 029e4cb422893a1d, 069ef3480d9af33f).

## 3 — the 6 coronation lines + the Νίκος vocative now read in-bank

Confirmed the 6 non-vocative hashes are `CORONATION_SET_B`/`CORONATION_SET_C`
by text match against `/opt/party-game/server/src/socrates.ts:610-623` (e.g.
`bd12930f9369aa78` = "Το πλήθος ξεχνάει..." = `CORONATION_SET_B[0]`), and
`069ef3480d9af33f` is the Νίκος vocative from Task 279. `voiceAudition.ts`'s
`inBank` field is a bare `statSync(BANK_DIR/<hash>.mp3)` existence check —
no cache, no build step to wait on — and all 7 files now exist at that exact
path (criterion 2), so `collectVoiceAuditionEntries()` reports `inBank: true`
for all 7 on its next call, live, no restart needed.

## 4 — INVERSE: the tool COPIES, not moves

`aegean-ops` uses `install` (copy), not `mv` — confirmed by reading the
script's own `cmd_promote_to_bank` before running it. Staging is untouched:
- `voice-deleted`: **155** — unchanged.
- `voice-line-review.json` sha256: `ffa7c9136c4a79ef23575ad4b0a7f4dfc55a07606600895dc8d0a0294628c430` — unchanged.
- `voice-staging`: **265** — unchanged (still holds the 7 sources; the tool
  copies rather than moving them).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018ukzs1z2LL1d9Ym5Dwf3js
