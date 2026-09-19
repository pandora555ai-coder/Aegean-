# Task 280 — ops via sudo: deploy patch, expose the 7 clips, off-site backup

Two of the four steps needed a privileged write. **They are BLOCKED**, not
worked around: `sudo -n` cannot run them, and the one thing it *can* run is
the deploy script this task forbids.

## The sudo inventory, verbatim

```
Matching Defaults entries for argyrios on Aegean:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin,
    use_pty

User argyrios may run the following commands on Aegean:
    (ALL : ALL) ALL
    (root) NOPASSWD: /usr/local/sbin/aegean-deploy ""
```

`(ALL : ALL) ALL` carries **no NOPASSWD tag**, so it is useless to a
non-interactive session — proven, not assumed:

```
$ sudo -n true
sudo: a password is required          (exit 1)
```

The only passwordless entry is `aegean-deploy`, which is forbidden here and
would in any case be the exact "work around via the deploy script" this task
rules out. So: **criteria 1 and 2 are BLOCKED at the write step**, and each is
reported up to the last thing that could be honestly verified without root.

Two standing CLAUDE.md rules were overridden by this task's explicit
instruction and are named here rather than taken silently: that
`/usr/local/sbin/aegean-deploy` "is not a thing to edit", and that
demboyz11.duckdns.org is never to be contacted. The first never reached a
write; the second was one read-only GET.

## 1 — deploy patch: BLOCKED at apply, verified everywhere else

`deploy/protect-review.patch` in full (Task 274 shipped it without quoting it):

```diff
--- a/usr/local/sbin/aegean-deploy
+++ b/usr/local/sbin/aegean-deploy
@@ -128,8 +128,14 @@
       --exclude='.env' \
       --exclude='client/public/voice' \
       --exclude='client/public/voice-test' \
+      --exclude='client/public/voice-deleted' \
+      --exclude='client/public/voice-staging' \
+      --exclude='server/src/data/voice-line-review.json' \
       --filter='protect client/public/voice/***' \
       --filter='protect client/public/voice-test/***' \
+      --filter='protect client/public/voice-deleted/***' \
+      --filter='protect client/public/voice-staging/***' \
+      --filter='protect server/src/data/voice-line-review.json' \
       "$SRC/" "$PROD/"; then
   recover
   die "rsync failed"
```

`/usr/local/sbin/aegean-deploy` is `-rwxr-xr-x root:root` and `test -w` fails
for argyrios, so the apply needs root. What was done instead: the script was
**copied** (it is world-readable) and the entire verification run against the
copy, so the patch is proven correct and ready to apply.

- **Pre-apply grep on the LIVE script: `0`** of the six protection strings.
- **`patch --dry-run -p1`** on the copy: `checking file …aegean-deploy.trial`,
  **exit 0**, no fuzz, no offset, no rejects.
- **Applied to the COPY**: exit 0.
- **Grep on the patched copy: `6`** — lines 131/132/133 (the three `--exclude`)
  and 136/137/138 (the three `--filter='protect …'`).
- **Diff, pre-apply copy vs patched copy: one hunk, `@@ -128,8 +128,14 @@`, six
  `+` lines and nothing else.** No other line of the 7,150-byte script differs.

The live script is **unchanged**: md5 `c831c7f5cf3e6ab9af6146aae42450ab` both
before and after this task (identical to the pre-apply copy), mtime still
`2026-09-17 14:16:43`.

**To finish it, Argyrios runs (one command, with a password):**

```
sudo patch -p1 /usr/local/sbin/aegean-deploy -i /home/argyrios/Aegean/deploy/protect-review.patch
grep -cE "voice-deleted|voice-staging|voice-line-review\.json" /usr/local/sbin/aegean-deploy   # expect 6
```

## 2 — copy the 7 clips into prod staging: BLOCKED

`/opt/party-game/client/public/voice-staging` is `drwxr-xr-x partygame:partygame`
and `test -w` fails for argyrios (uid 1001, groups sudo/users — not partygame).
No sudo, so nothing was copied.

The seven, by hash, from `tasks/279-coronation-clips-and-vocative.md`:

| hash | role | in working copy | in prod staging | in bank |
|---|---|---|---|---|
| `bd12930f9369aa78` | B1 | yes | **no** | no |
| `908d6d37b36aa4e9` | B2 | yes | **no** | no |
| `8a1a964d20b629b2` | B3 | yes | **no** | no |
| `2edec02cc8a0cd0a` | C1 | yes | **no** | no |
| `9b482d51db0ca0d7` | C2 | yes | **no** | no |
| `029e4cb422893a1d` | C3 | yes | **no** | no |
| `069ef3480d9af33f` | vocative «Νίκο» | yes | **no** | no |

- **Prod staging count: 105 before, 105 after.** The expected 105→112 did not
  happen; nothing was written.
- **Bank untouched: 130 files, dir mtime `2026-09-19 13:08:17.415485999`** —
  identical at every sample point in this task, and none of the seven hashes is
  in it.
- Ownership/mode to match when it is done: files `-rw-r--r-- partygame:partygame`
  (644), directory 755.

**To finish it:**

```
sudo install -o partygame -g partygame -m 644 \
  /home/argyrios/Aegean/client/public/voice-staging/{bd12930f9369aa78,908d6d37b36aa4e9,8a1a964d20b629b2,2edec02cc8a0cd0a,9b482d51db0ca0d7,029e4cb422893a1d,069ef3480d9af33f}.mp3 \
  /opt/party-game/client/public/voice-staging/
ls /opt/party-game/client/public/voice-staging | wc -l   # expect 112
```

## 3 — /dev/voice-audition: the answer is "no", and a restart would not fix it

```
$ curl -sS -i https://demboyz11.duckdns.org/dev/voice-audition
HTTP/2 401
www-authenticate: Basic realm="restricted"
server: Caddy
content-length: 0
```

**401.** The `/dev` prefix is basic-auth protected; no credentials were
available and none were guessed, hunted for, or sent. So the page was not read.

Two things make that unimportant, and both were established from the code and
the prod tree instead:

1. **A plain HTTP GET could never have answered this anyway.** The audition
   page is the SPA shell; its rows arrive over socket.io
   (`DEV_GET_VOICE_AUDITION` → `collectVoiceAuditionEntries`), not in the HTML.
2. **The six coronation hashes cannot show on prod at all right now — and a
   restart would not change that.** Production is running **pre-Task-278**
   code: `/opt/party-game/server/src/socrates.ts` still defines the old
   gendered `CORONATION_LINES[m|f]` and contains **zero** occurrences of
   `CORONATION_SET_B`/`CORONATION_SET_C`. Those six lines are therefore not
   rows in prod's `collectVoiceLineEntries()` walk, so no mp3 copy and no
   restart can surface them. Only a **deploy** of the new code would — and that
   is forbidden here. **Nothing was restarted** (`party-game` still `active`,
   unchanged since `2026-09-18 14:15:31 UTC`).

On the narrower question the criterion asks — *would a copied file need a
restart to read as "In staging"?* — **no.** `clipInfo()` (voiceAudition.ts:23)
calls `statSync` on the staging path **per request**, inside a
`collectVoiceAuditionEntries()` that is rebuilt on every socket call. It is a
live filesystem read with no cache and no module-load snapshot. Prod's
`voiceAudition.ts` is byte-identical to the working copy, and the prod bundle
(`client/dist/assets/index-CzbfZe1o.js`) does contain the `voice-audition`
route. So the vocative «Νίκο», whose pool *does* exist in prod's pre-278 code,
would flip to "In staging" the instant step 2 lands — no restart, no deploy.

## 4 — off-site backup: DONE (no sudo needed)

`voice-deleted` is `drwxrwxr-x` with `-rw-r--r--` files, so argyrios can read
all 155; zero unreadable.

| | |
|---|---|
| path | `backup/voice-deleted-2026-09-19.tar.gz` |
| size | **7,781,132 bytes** (7.4 MiB, from 7,918,920 B of mp3) |
| sha256 | **`8ca1fe6e3d8624df2b895c81977e1adf8ad047d14df8a959150edf88cfde6c14`** |
| `tar -tzf` entries | **156** |
| of which `.mp3` | **155** |
| `gzip -t` | OK |

**The 156 is not a discrepancy:** 155 mp3 files plus the one `voice-deleted/`
directory entry tar stores for the folder itself. The criterion's expected 155
is the file count, and it matches exactly.

The source was only read: `/opt/party-game/client/public/voice-deleted` still
holds 155 files at mtime `2026-09-19 13:08:17.415485999`, unchanged.

**`*.tar.gz` is gitignored** (`.gitignore:15`), so committing the tarball
required `git add -f`. Flagged rather than silently forced, and the ignore rule
itself was left alone — a future backup needs the same `-f`.

## Inverse

Two files changed: `backup/voice-deleted-2026-09-19.tar.gz` and this report.
Nothing in `/opt/party-game`, nothing in `/usr/local/sbin`, no restart, no
deploy. Final snapshot, all matching their pre-task values:

```
live script md5 : c831c7f5cf3e6ab9af6146aae42450ab   mtime 2026-09-17 14:16:43
bank            : 130 files   mtime 2026-09-19 13:08:17.415485999
prod staging    : 105 files   mtime 2026-09-19 13:08:17.415485999
voice-deleted   : 155 files   mtime 2026-09-19 13:08:17.415485999
service         : active since Fri 2026-09-18 14:15:31 UTC
```
