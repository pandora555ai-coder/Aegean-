# Task 251 — Voice generation truncates clips at EOF

HEAD at start: e13db81 (Task 249's commit).

## Diagnosis (required before any fix)

**The write path has none of the classic race patterns, and none applies
here.** `dev/voice/provider.ts`'s `synthesize()` does `const res = await
fetch(...)` then `return Buffer.from(await res.arrayBuffer())` — the whole
response body is read into memory and awaited before the function returns.
`dev/generate-voice-lines.ts` then does `const audio = await
provider.synthesize(spoken); writeFileSync(path.join(OUT_DIR, filename),
audio);` — `writeFileSync` is synchronous and writes the complete in-memory
buffer in one call. There is no unawaited write, no piped stream, no missing
await, no fixed-size buffer, and no timeout anywhere in this path (checked
`git show 3a7f716:dev/voice/provider.ts`, the original Task 42b version —
identical shape from day one, so this was never a regression either).

I verified empirically (`node` test against a local HTTP server) that
Node's fetch/undici does NOT silently truncate a transport-level partial
response: a response whose `Content-Length` header doesn't match what the
socket actually delivers, or whose chunked-encoding stream is abruptly
closed mid-body, both throw `TypeError: terminated` on `res.arrayBuffer()`.
So a truncated HTTP transfer is not the mechanism — it would already be a
loud crash, not a silent short file.

**No size/duration validation happens after writing, confirmed.**
`generate-voice-lines.ts` writes the file then only ever reports aggregate
totals and the single longest clip (for `SOCRATES_MAX_DURATION_MS` sizing)
— nothing checks whether any individual clip's *content* is a complete
sentence. A response that is a well-formed, complete HTTP transfer of a
short/truncated MP3 is indistinguishable from a good one anywhere in this
pipeline, exactly as the task states.

**Correlation (mtime + duration, all 283 files):**
- Duration: truncated files average 7282ms (median 7549ms) vs 6765ms
  (median 6687ms) for the good 247 — only ~8% longer on average, ranges
  overlap heavily, and the single LONGEST clip in the whole bank (13949ms)
  is actually a GOOD file. Length is not a strong predictor; this is not
  "a race that loses on long responses."
- Batch/session: file mtimes fall into two distinct, far-apart sessions —
  254 files from 2026-09-03T00:30 (the initial full regen) plus a handful of
  singles that day, and a completely separate 22-file batch from
  2026-09-11T23:24-23:25 (Task 230's lines, 8 days later). Truncation rate:
  32/254 (12.6%) in the first session, 1/1 in an isolated single-file
  generation that same day, and 3/22 (13.6%) in the second session eight
  days later. A consistent ~12-14% failure rate recurring across sessions
  over a week apart rules out "something batch-specific" (a one-off bad run,
  a specific network blip) — this is a persistent, roughly constant-probability
  failure, most consistent with ElevenLabs occasionally ending generation
  before the sentence is spoken while still returning a complete, valid HTTP
  response for whatever it did generate.

**Conclusion**: the defect is not a client-side race; it's an undetected
generation-content failure on the provider side, happening at a steady
~12-13% rate independent of text length or run. The fix is detection +
retry, not a networking change.

## Fix applied

`dev/voice/tailCheck.ts` (new) — Task 249's Python analysis ported to
TypeScript exactly (same 20ms window, same 15-window/300ms lookback
including the tail window itself, same thresholds: ratio ≥ 0.6 AND recent
peak > 500 RMS = truncated), decoding via `ffmpeg` to raw PCM. Exports
`checkTail(path)` (per-file verdict) and `analyzeTail(path)` (raw numbers).

`dev/generate-voice-lines.ts` — after `writeFileSync`, calls `checkTail` on
the file just written. A pass logs and moves on exactly as before. A fail
logs a warning and re-synthesizes (a fresh API call, up to
`MAX_SYNTHESIS_ATTEMPTS = 3` total attempts) rather than keeping the file;
if every attempt fails, the file is deleted (`unlinkSync`) and the run
throws — it refuses to leave either a bad or a silently-missing file in
place. No other line changed.

`dev/voice/bank-tail-check.ts` (new) — the reusable, read-only sweep used
for criterion 4 below (and available going forward as a standing audit).

`dev/voice/reproduce-longest-check.ts` (new) — criterion 2's harness.

## Acceptance criteria

**1. Diagnosis** — given above in full: exact lines (`provider.ts`'s
`return Buffer.from(await res.arrayBuffer())` and `generate-voice-lines.ts`'s
`writeFileSync(path.join(OUT_DIR, filename), audio)`) both fully await and
fully buffer, ruling out a client-side race; empirical proof that a
transport-level truncation already throws; and the mtime/duration
correlation showing a persistent ~12-14% rate across two sessions 8 days
apart, not length- or batch-driven.

**2. Five test clips, longest of the 36 lines** — text: `"[serious] Φτάσαμε
στη Συκοφαντία, το θέμα που ξέρω καλύτερα απ' όσο θα ήθελα. Προσέξτε ποιον
κοιτάτε στα μάτια από δω και πέρα."` (127 chars incl. tag, the longest among
the 36). Two independent 5-clip batches against the real API (10 raw,
unretried attempts total):
```
clip  response-bytes  written-bytes  match  tail-ratio  tail-peak  verdict
   1           76112          76112  yes         0.02       7323  ok
   2           70261          70261  yes         0.43       6519  ok
   3           81128          81128  yes         0.13       1436  ok
   4           77366          77366  yes         0.19       5828  ok
   5           81755          81755  yes         0.23       3644  ok
(second batch)
   1           80501          80501  yes         0.13       2044  ok
   2           72977          72977  yes         0.50       4309  ok
   3           76112          76112  yes         0.44       3957  ok
   4           79874          79874  yes         0.00       1775  ok
   5           76739          76739  yes         0.02       4372  ok
```
Response bytes equal written bytes on every single attempt (10/10) —
the write step never loses a byte, consistent with the diagnosis. 0 of 10
raw attempts reproduced a flagged tail this run; at the historical ~12-13%
per-attempt rate, P(zero failures in 10 tries) ≈ 25%, so this is unsurprising
and not evidence the defect is gone — it's why the fix is retry-based rather
than one-shot, and why criterion 4's sweep (not a live demo) is the real
proof the existing defect population is unchanged.

**3. Inverse — the validator refuses** — fed `checkTail` a real clip
truncated at 55% of its byte length (an artificial mid-word cut): it
reported `ok: false, ratio: 0.76` (≥ the 0.6 threshold). Then replayed
`generate-voice-lines.ts`'s exact retry loop against a fake provider that
always returns this bad buffer: it retried 3 times (each attempt logged
`ratio=0.76 ok=false`), then **threw** `"...failed the tail check 3 times
in a row - refusing to save a truncated clip"` and deleted the file — no
file was left on disk. It refuses; it does not warn-and-keep.

**4. Bank re-sweep, unchanged** — `npx tsx dev/voice/bank-tail-check.ts`
against `client/public/voice`, run both before touching any code and again
after every change in this task: **36 of 283**, both times, same 36
filenames. Confirmed no production voice file's mtime moved during this
task (`stat` on one flagged file shows its Sept-2026 mtime, ~11.6 days
before this run). This task changed generation code only; zero existing
audio was touched, read for anything but the sweep, or regenerated.

## Scope

Did not regenerate any of the 36 production clips. Did not touch
`server/src/socratesAudio.ts`, the backstop, playback, or any game code —
only `dev/generate-voice-lines.ts` and new files under `dev/voice/`.
