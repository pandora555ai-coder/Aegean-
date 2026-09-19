# Installing aegean-ops (one-time, root, over SSH)

This is a **human** session — an agent has no sudo password and cannot run
any of this. Do it once, from a root shell on the box.

## 0 — where things are before you start

```
grep -cE "voice-deleted|voice-staging|voice-line-review\.json" /usr/local/sbin/aegean-deploy
# expect 0 — the protect-review.patch has not been applied yet
ls /opt/party-game/client/public/voice-staging | wc -l
# whatever count is currently pending the new clips
```

## 1 — install the script

```
install -o root -g root -m 755 \
  /home/argyrios/Aegean/deploy/aegean-ops \
  /usr/local/sbin/aegean-ops

ls -l /usr/local/sbin/aegean-ops
# expect: -rwxr-xr-x 1 root root ... /usr/local/sbin/aegean-ops
```

## 2 — install the sudoers drop-in

Syntax-check BEFORE touching `/etc/sudoers.d` — a bad drop-in there can
lock out sudo entirely:

```
visudo -cf /home/argyrios/Aegean/deploy/aegean-ops.sudoers
# expect: /home/argyrios/Aegean/deploy/aegean-ops.sudoers: parsed OK
```

Only once that says OK:

```
install -o root -g root -m 0440 \
  /home/argyrios/Aegean/deploy/aegean-ops.sudoers \
  /etc/sudoers.d/aegean-ops

visudo -cf /etc/sudoers.d/aegean-ops
# expect: /etc/sudoers.d/aegean-ops: parsed OK

sudo -l -U argyrios | grep aegean-ops
# expect: NOPASSWD: /usr/local/sbin/aegean-ops
```

This grants argyrios NOPASSWD on `/usr/local/sbin/aegean-ops` **only** — the
verb/argument restrictions (exactly two verbs, hash-shaped filenames, the
`--confirm` token, no overwrite) are enforced inside the script itself, not
by sudoers.

## 3 — apply the deploy-protection patch

Already staged and verified against a copy in Task 280/282
(`deploy/protect-review.patch`) — this just applies it for real:

```
patch -p1 /usr/local/sbin/aegean-deploy -i /home/argyrios/Aegean/deploy/protect-review.patch

grep -cE "voice-deleted|voice-staging|voice-line-review\.json" /usr/local/sbin/aegean-deploy
# expect 6 (three --exclude lines, three --filter='protect ...' lines)
```

## 4 — stage the pending clips

As argyrios, no password needed once step 2 is done:

```
sudo /usr/local/sbin/aegean-ops stage-clips --confirm ARGYRIOS-SAID-GO
```

This copies every `<16-hex-hash>.mp3` in
`/home/argyrios/Aegean/client/public/voice-staging` that isn't already in
`/opt/party-game/client/public/voice-staging` — currently the 7 clips from
Task 279/281 (`bd12930f9369aa78`, `908d6d37b36aa4e9`, `8a1a964d20b629b2`,
`2edec02cc8a0cd0a`, `9b482d51db0ca0d7`, `029e4cb422893a1d`,
`069ef3480d9af33f`) — and prints one ledger line per file: `STAGED` for a
new copy, `SKIPPED` for a name already there, `REJECTED` for anything that
isn't a bare 16-hex-char `.mp3` name or is a symlink. Verify:

```
ls /opt/party-game/client/public/voice-staging | wc -l
# expect the step-0 count + 7 (or fewer if some of the 7 were already there)

ls -l /opt/party-game/client/public/voice-staging | grep -E '(bd12930f9369aa78|908d6d37b36aa4e9|8a1a964d20b629b2|2edec02cc8a0cd0a|9b482d51db0ca0d7|029e4cb422893a1d|069ef3480d9af33f)\.mp3'
# expect 7 lines, each -rw-r--r-- partygame partygame
```

`promote-to-bank <hash...>` moves already-staged clips from prod staging
into the live bank the same way, refusing the whole call if any target
already exists or any hash is missing — not run here; use it only when a
future task says a clip is ready to go live.
