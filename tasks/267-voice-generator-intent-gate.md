# Task 267 — a second, independent spend-intent gate

Task 266's two guards (write-before-pay, staging-not-prod) both protect
*where/how* a spend lands, not *whether one was actually meant*. That gap
is exactly what bit during 266 itself: a control run typed `--generate`
only to reach a later, unrelated failure, and with real credentials
sitting in the repo-root `.env`, nothing stopped it from spending for real.
`--generate` alone can't be the spend gate, because it's also the flag
every test/control/harness run needs to reach the code path it's testing.

## What changed

`dev/generate-voice-lines.ts` only: a new `SPEND_CONFIRM_TOKEN` constant
(`'I-MEAN-TO-SPEND-REAL-MONEY'`) and a `--confirm-spend <token>` flag,
checked right after the dry-run early-return and before the `--max-chars`
budget check — so it fires before the budget check, before
`createElevenLabsProvider()`, before anything network-adjacent. Missing it,
or a value that isn't an exact match, throws immediately. It is not
satisfied by `--generate`, by any env var, or by any other flag — it has to
be typed out, in full, on the command line, every real run.

To actually spend, THREE independent things must now all be true:
`--generate` (opt out of dry-run) AND `--confirm-spend
I-MEAN-TO-SPEND-REAL-MONEY` (exact token, proves real intent) AND
`--max-chars <N>` covering the planned total (budget). Any one missing or
wrong refuses with zero API calls.

## Acceptance criteria

**1 — control/test run, full `.env` credentials loaded, still can't spend.**
Reproduced Task 266's own incident shape exactly — same flags
(`--generate --max-chars 999999 --limit 1`), `.env` **not** blanked this
time (real `ELEVENLABS_API_KEY`/`VOICE_ID`/`MODEL_ID` all loaded):

```
Write probe passed: .../writable-dir is writable.
Error: --generate also requires --confirm-spend I-MEAN-TO-SPEND-REAL-MONEY
(typed exactly - ...). 0 API calls made.
```

Exit 1, output dir empty after. **What stops it**: the new `--confirm-spend`
check, which runs before `createElevenLabsProvider()` is ever called and
isn't satisfied by `--generate` or by any credential being present. Also
checked a garbled value (`--confirm-spend yes`) — same refusal, same message.
Plain dry run (no `--generate` at all) is unaffected: prints the plan and
returns before reaching the new check at all, exactly as before.

**2 — the exact command that would generate the 4 coronation clips.**
Not run:

```
npx tsx dev/generate-voice-lines.ts \
  --hashes 2783003bfb1eca35,1ef3e41f99ea15c3,dd09e7993b172139,bcc2ae3833de4e46 \
  --generate --confirm-spend I-MEAN-TO-SPEND-REAL-MONEY --max-chars 500
```

Default `OUT_DIR` (`client/public/voice-staging`, Task 266's own default)
needs no `ALT_OUTPUT_DIR` override. `--max-chars 500` covers the measured
428-char plan (Task 266's own dry-run number for these same 4 hashes) with
headroom; a tighter number risks a real ElevenLabs total differing slightly
from the local `.length` estimate and refusing on a technicality.

**3 — zero API calls in this task.** Confirmed: every command run above
either was a dry run (no `--generate`) or was deliberately missing/wrong on
`--confirm-spend`, and every one printed `0 API calls` before returning.
`client/public/voice-staging` file count unchanged (254, Task 266's own
number) across this whole task. No characters spent.
