# Task 268 — generate the 4 coronation clips into staging

Ran the exact command from Task 267's own criterion 2, unmodified except
for `--limit` (not needed — `--hashes` already narrows to exactly 4):

```
npx tsx dev/generate-voice-lines.ts \
  --hashes 2783003bfb1eca35,1ef3e41f99ea15c3,dd09e7993b172139,bcc2ae3833de4e46 \
  --generate --confirm-spend I-MEAN-TO-SPEND-REAL-MONEY --max-chars 500
```

Vocatives were NOT touched — `--hashes` names only these 4, no `--names`.
`swap-staging.sh` was NOT run. Clips sit in `client/public/voice-staging`
only.

## 1 — per clip

All 4 passed the tail check (Task 251) on the **first** attempt — the run's
own output carried zero `failed the tail check` lines, which is what a
retry would have logged.

| hash | role | retries | duration (ffprobe) | size |
|---|---|---|---|---|
| `2783003bfb1eca35` | coronation opener (NAMED≡PLAIN, Task 266 follow-up) | 0 | 9.639s | 77,366 B (75.6 KB) |
| `1ef3e41f99ea15c3` | coronation line 2 | 0 | 7.314s | 58,767 B (57.4 KB) |
| `dd09e7993b172139` | coronation line 3α (m) | 0 | 9.169s | 73,604 B (71.9 KB) |
| `bcc2ae3833de4e46` | coronation line 3β (f) | 0 | 7.549s | 60,648 B (59.2 KB) |

Durations are `ffprobe`'s own measurement (the accurate one — CLAUDE.md's
Voice section notes the server's byte-size estimate runs within 32ms of
this, always slightly high; not used here since this report isn't feeding
a backstop calculation).

## 2 — never-passed / deleted

None. All 4 clips generated, passed on attempt 1, and are present in
`client/public/voice-staging` right now.

## 3 — file counts

- `client/public/voice-staging`: **254 before → 258 after** (matches the
  expected +4 exactly).
- `/opt/party-game/client/public/voice`: **283 before, 283 after** —
  confirmed by directory count both times. `swap-staging.sh` was never run
  in this task.

## 4 — characters consumed

**428 characters total**, matching the run's own printed total and Task
266/267's dry-run measurement for these same 4 hashes exactly (116 + 92 +
110 + 110) — zero retries means zero extra spend beyond the plan.

This repo has no live ElevenLabs balance query (no such call exists in
`dev/voice/provider.ts` or anywhere else) — the numbers below are
**arithmetic on the last reported figure, not a live check**: Task 264's
own report cited a ~1,300-char balance at the time it was written (before
Sept 3), and Task 266 documents one accidental 108-char spend against that
balance. 1300 − 108 − 428 ≈ **764 characters left**, on that assumption
only. If the real balance is needed with confidence, it should be read from
the ElevenLabs dashboard directly rather than trusted from this arithmetic.

## Listening to the 4 staged clips before they go into the bank

Neither `/dev/voice` nor `/dev/intro-lines` can point at staging right now
— both are hardcoded to fetch `/voice/<hash>.mp3` (`DevVoiceScreen.tsx:225`,
`DevIntroLinesScreen.tsx`'s own per-line `hash` table), which resolves to
`client/public/voice`, the live symlink into `/opt/party-game`. Neither
page takes a directory override, and wiring one in is a code change outside
this task's scope (not requested, and it would need its own review — this
report only answers "how", not "build it").

Two ways to listen today, no code changes:

1. **Play the files directly** — they're plain files on the same machine
   Argyrios is on:
   ```
   /home/argyrios/Aegean/client/public/voice-staging/2783003bfb1eca35.mp3
   /home/argyrios/Aegean/client/public/voice-staging/1ef3e41f99ea15c3.mp3
   /home/argyrios/Aegean/client/public/voice-staging/dd09e7993b172139.mp3
   /home/argyrios/Aegean/client/public/voice-staging/bcc2ae3833de4e46.mp3
   ```
   Open with any local player (`mpv <path>`, `ffplay <path>`, a file
   manager double-click, or `!mpv <path>` from this session to run it
   directly).
2. **A throwaway local URL**, if a browser tab is preferred over a native
   player — run this yourself (not run here, since it opens a new port):
   ```
   cd /home/argyrios/Aegean/client/public/voice-staging && python3 -m http.server 8899 --bind 127.0.0.1
   ```
   then open `http://127.0.0.1:8899/2783003bfb1eca35.mp3` (etc.) in a
   browser. Stop it with Ctrl-C when done; nothing else needs to run.
