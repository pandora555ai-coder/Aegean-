# Task 274 — deploy safety: preserve the deletion state (code+data, no deploy)

Task 273 found that `/opt/party-game/server/src/data/voice-line-review.json`
(274 records: 155 deleted, 119 kept, from Task 271's audition/deletion pass)
is the ONLY copy of that audit state, and that
`/usr/local/sbin/aegean-deploy`'s rsync into `$PROD` protects only
`client/public/voice` and `client/public/voice-test` — not this JSON, not
`voice-deleted/`, not `voice-staging/`. A deploy would have overwritten
prod's live file with the git-tracked `[]`, silently resurrecting all 155
deleted lines into the selectable pools with no mp3 behind any of them.

## What was done

1. Copied the prod JSON byte-for-byte into
   `server/src/data/voice-line-review.json` (`cp -p`, no reformatting). Both
   files now sha256
   `ffa7c9136c4a79ef23575ad4b0a7f4dfc55a07606600895dc8d0a0294628c430`.
   Parsed: 274 records, 155 `deleted` / 119 `kept` — matches Task 273's
   findings exactly.
2. Wrote `deploy/protect-review.patch` — a minimal unified diff against
   `/usr/local/sbin/aegean-deploy`, NOT applied (that file is root-owned,
   0755, root:root). Adds `--exclude`/`--filter='protect ...'` pairs for
   `server/src/data/voice-line-review.json`, `client/public/voice-deleted`
   and `client/public/voice-staging`, in the same style as the existing
   `client/public/voice`/`voice-test` pair. `patch --dry-run -p3` against
   the live file applies cleanly.

## Apply + verify (Argyrios, when ready)

```
sudo patch -p3 /usr/local/sbin/aegean-deploy < /home/argyrios/Aegean/deploy/protect-review.patch
sudo grep -n "voice-deleted\|voice-staging\|voice-line-review.json" /usr/local/sbin/aegean-deploy
```

The grep should show 6 lines (3 `--exclude`, 3 `--filter='protect ...'`).

## Not done here

No deploy was run. The patch is not applied — it ships for Argyrios to
apply with `sudo`. Until it's applied, the live deploy script still has the
Task 273 gap; this task only stops it from biting on THIS repo's committed
copy of the JSON (which was `[]` and is now the real 274-record state).
