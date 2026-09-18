# Task 266 — write-before-pay + write-to-staging for the voice generator

Two fixes to `dev/generate-voice-lines.ts`, plus the assertion-D fix in
`dev/263-coronation-check.ts` that Task 266's own pre-existing (uncommitted)
`server/src/socrates.ts` fix made stale. **Zero ElevenLabs calls were
intended in this task** — see the Incident note below for the one that
happened anyway, during my own testing.

## 1 — write-before-pay

`verifyWritable(dir)` creates+deletes a throwaway probe file in the output
directory. It runs once up front — before templates are collected, before
the `--max-chars` budget check, before `createElevenLabsProvider()` is ever
called — and again immediately before **every individual** `synthesize()`
call inside the generate loop, so a directory that goes unwritable mid-run
(disk full, permissions revoked) aborts before that clip's characters are
spent too, not just the first clip's.

## 2 — write to staging, not prod

`OUT_DIR`'s default is now `client/public/voice-staging` (a plain,
gitignored directory this repo owns), never `client/public/voice` — the
symlink straight into `/opt/party-game`. `ALT_OUTPUT_DIR` still overrides
it exactly as before. This is also `dev/voice/swap-staging.sh`'s own
default `STAGING_DIR`, and its own default `EXPECTED_COUNT` (254) already
matches what's sitting in that directory right now (see criterion 3) — the
two were designed for each other but the generator's own default disagreed
with it until this task.

## Acceptance criteria

**1 — unwritable dir + `--generate` aborts before any API call.**
`ELEVENLABS_API_KEY= ELEVENLABS_VOICE_ID= ELEVENLABS_MODEL_ID=
ALT_OUTPUT_DIR=<chmod-555 dir> npx tsx dev/generate-voice-lines.ts
--generate --max-chars 999999 --limit 1`:

```
Error: Output directory is not writable: <dir>
  (EACCES: permission denied, open '<dir>/.write-probe-...')
    at verifyWritable ...
    at main ...
```

Exit 1, ~0.5s. **Proof no call went out**: the three `ELEVENLABS_*` vars
were explicitly blanked before the run, so if execution had reached
`createElevenLabsProvider()` it would have thrown *that* function's own
"Set ELEVENLABS_API_KEY..." error instead — the error actually printed is
`verifyWritable`'s, which the stack trace shows fires from `main()` before
`toGenerate`/the budget check/the provider are ever reached. A control run
against a writable dir (same blanked vars) got past this line and printed
`Write probe passed: ... is writable.` before failing later at
`createElevenLabsProvider()` — confirming the writable path really does
continue past the probe, so the unwritable case is a real gate, not a
process that never got there for an unrelated reason.

**2 — dry-run the 4 coronation hashes against the staging dir.**
`npx tsx dev/generate-voice-lines.ts --hashes
2783003bfb1eca35,1ef3e41f99ea15c3,dd09e7993b172139,bcc2ae3833de4e46`
(default `OUT_DIR`, i.e. the new staging default):

```
Write probe passed: client/public/voice-staging is writable.
DRY RUN (default, no API calls) - pass --generate --max-chars <N> to actually synthesize.
Would generate 4 of 4 missing line(s), 428 char(s) total.
  2783003bfb1eca35.mp3  116ch  "[serious] Το πλήθος αγάπησε το όνομά σου νωρίς. ..."
  1ef3e41f99ea15c3.mp3  92ch  "[dry] Ήρθατε εδώ λέγοντας πως είστε σοφιστές. ..."
  dd09e7993b172139.mp3  110ch  "[warm] Σ' εσένα το λέω σοβαρά. Σοφιστή. ..."
  bcc2ae3833de4e46.mp3  110ch  "[warm] Σ' εσένα το λέω σοβαρά. Σοφίστρια. ..."
```

Write probe passed, plan printed, exit 0. **Zero API calls**: dry run never
constructs a provider at all (Task 264's own guarantee, untouched). Verified
`client/public/voice-staging` held 254 files both before and after this
run, and none of the 4 target hashes are among them.

**3 — the production move path.**
`bash dev/voice/swap-staging.sh` (no args — its defaults already are
`STAGING_DIR=client/public/voice-staging`, `LIVE_DIR=client/public/voice`,
`EXPECTED_COUNT=254`), **run by a human** (Argyrios, or root by hand per
CLAUDE.md's "human fallback") — never by me, and not part of this task.
It is a plain `cp`, no deploy wrapper involved; `client/public/voice` is a
live symlink into `/opt/party-game`, so the copy itself takes effect
immediately, no `aegean-deploy` needed for the audio files themselves (a
deploy would still be separately needed for the *code* changes in this
task, e.g. the new default output dir, if anything server/client-side used
it — nothing here does).

Re-verified the script's own logic still works, against synthetic dirs
under my scratchpad (never real staging/live): refuses and copies nothing
when the mp3 count doesn't match `EXPECTED_COUNT`; on a matching count it
`cp`s every staged file into the live dir, **overwrites** a live file only
when staging holds one of the exact same filename (same content-hash — by
construction that only happens for a genuinely re-synthesized instance of
the identical `template`+`tag`, or the voice-ID-collision trap CLAUDE.md's
Voice section already documents, not a new risk from this task), and
leaves every live file **not** present in staging completely untouched —
confirmed a `bbb.mp3` that existed only in the fake live dir survived the
swap unchanged. The script contains no `rm`/`--delete`; it cannot delete a
bank file, ever.

`client/public/voice-staging` currently holds 254 files (pre-existing,
matches `swap-staging.sh`'s own `EXPECTED_COUNT` default exactly) — that
batch is untouched by this task and was not generated by it.

**4 — inverse.** `/opt/party-game/client/public/voice` mp3 count: **283
before, 283 after** every command above. Zero `sudo` commands run (self-
audited: no command in this task's session invoked `sudo`, `chmod`/writes
under `/opt/party-game`, or `aegean-deploy`). `git diff --stat` for this
task's own changes touches only `dev/263-coronation-check.ts`,
`dev/generate-voice-lines.ts`, and this task doc — `server/src/socrates.ts`
carries a separate, pre-existing uncommitted change (a post-263 fix, not
authored by this task) that this task deliberately left alone and did not
stage or commit.

## Also fixed: `dev/263-coronation-check.ts` assertion D

`server/src/socrates.ts` already had an uncommitted fix in the working tree
when this task started: `CORONATION_OPENER_NAMED` no longer carries the
`{ΚΛΗΤΙΚΗ}` placeholder at all (the vocative is spliced ahead as its own
`prefix` clip instead), making it byte-identical to `CORONATION_OPENER_PLAIN`.
That broke two of assertion D's checks, which still expected the old shape:

- `'D: placeholder stays literal in the hashed template'` asserted the
  *opposite* of the new, correct behaviour — replaced with a check that
  `CORONATION_OPENER_NAMED` contains no placeholder and is byte-identical
  to `CORONATION_OPENER_PLAIN`.
- `'D: all 5 coronation texts registered'` — `collectVoiceLineEntries`'s
  `add()` dedupes by exact line text, so once NAMED and PLAIN collapsed to
  the same string the coronation pool registers 4 distinct entries (opener,
  line 2, line 3α, line 3β), not 5. Updated to `cor.length === 4`.

`SCENARIO=D npx tsx dev/263-coronation-check.ts` (the only scenario that
needs no audio and no real coronation playthrough): **5 passed, 0 failed**.

## Incident: one real ElevenLabs call happened during my own testing

While proving criterion 1, an early "control" run (meant only to show the
writable path continues past the probe) did not blank the `ELEVENLABS_*`
env vars, and the repo-root `.env` supplies real credentials —
`loadDotEnvIfPresent` picked them up and the run went all the way through,
firing one real synthesis call (108 characters, one ~70KB clip written to
my scratchpad, outside the repo). That violates this task's explicit "Do
NOT call ElevenLabs — zero generation" instruction; it was my error, not a
defect in the script under test. The clip was deleted immediately
(scratchpad only, never touched `client/public` or `/opt/party-game`), and
every subsequent test in this task explicitly blanked all three
`ELEVENLABS_*` vars first. Flagged to Argyrios as soon as it was noticed.
