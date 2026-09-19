# Task 282 — deploy blocked: both preconditions still fail

Per this task's own instruction, both preconditions were checked BEFORE
touching anything, and the instruction was to STOP with a report if either
fails. **Both fail.** `sudo /usr/local/sbin/aegean-deploy` was **not run**.

## 1 — the two precondition proofs, quoted

**(a) protection patch on the live script:**
```
$ grep -cE "voice-deleted|voice-staging|voice-line-review\.json" /usr/local/sbin/aegean-deploy
0
```
Expected 6, got 0. Live script md5 `c831c7f5cf3e6ab9af6146aae42450ab`, mtime
`2026-09-17 14:16:43` — unchanged since Task 280 measured the same values.
Task 280 prepared `deploy/protect-review.patch` (verified correct against a
copy, 6/6 lines) but could not apply it: the script is root-owned
`-rwxr-xr-x`, and argyrios has no passwordless `sudo` for anything except
`aegean-deploy` itself.

**(b) prod voice-staging holds the 7 new clips:**
```
$ ls /opt/party-game/client/public/voice-staging | wc -l
105
```
Expected 105→112, still 105. All 7 hashes from `tasks/279-*.md` checked by
filename — all **MISSING** (`bd12930f9369aa78`, `908d6d37b36aa4e9`,
`8a1a964d20b629b2`, `2edec02cc8a0cd0a`, `9b482d51db0ca0d7`,
`029e4cb422893a1d`, `069ef3480d9af33f`). The directory is
`partygame:partygame`, argyrios has no write access, no sudo to copy them.

## 2 — deploy verification

**Not applicable — no deploy was run.** No bundle mtime, no hash, no service
restart, nothing to verify.

## 3 — inverse

Nothing changed. `voice-deleted`: still 155 (Task 280's backup, untouched).
Bank: still 130. Prod staging: still 105 (not 112 — precondition (b) itself
IS this number). Service: still `active`, `ActiveEnterTimestamp` still
`Fri 2026-09-18 14:15:31 UTC` — no restart.

## 4 — /dev/voice-audition GET

Not attempted. Both blockers are exactly the two steps Task 280 already
identified as needing a human `sudo` password — this task adds no new
information about them, so re-running the same failed GET was skipped rather
than repeating Task 280's own finding.

## What unblocks this

The two commands Task 280 already staged and verified against a copy,
unchanged, still pending a human running them with a password:
```
sudo patch -p1 /usr/local/sbin/aegean-deploy -i /home/argyrios/Aegean/deploy/protect-review.patch
sudo install -o partygame -g partygame -m 644 \
  /home/argyrios/Aegean/client/public/voice-staging/{bd12930f9369aa78,908d6d37b36aa4e9,8a1a964d20b629b2,2edec02cc8a0cd0a,9b482d51db0ca0d7,029e4cb422893a1d,069ef3480d9af33f}.mp3 \
  /opt/party-game/client/public/voice-staging/
```
Once both preconditions pass, re-run this task's deploy step.
