# Task 287 — Voice generator: budget guard must count billed characters, retries included

Defect (Task 279): dry-run said 408 ch, billing came to 478 — a tail-check
retry billed as its own request, and the old one-time
`totalChars > maxChars` gate (Task 264) only ever compared the PLANNED
total once, before generation started. Enough retries could spend past the
cap with no gate at all.

## Fix

`generateBatch()` (dev/generate-voice-lines.ts) now tracks `billedSoFar`
and checks `billedSoFar + chars <= maxChars` immediately before EVERY
`deps.synthesize()` call — first attempts and tail-check retries alike,
since it's the loop's only call site (dev/generate-voice-lines.ts:268-303).
A request that would breach the cap is refused and the whole run stops
there (`break outer`) rather than skipping ahead to a smaller later line.
The old upfront `totalChars > maxChars` gate is gone — it's now just what
happens when the per-request check hits the very first request.

The generation loop was extracted into `generateBatch(batch, maxChars,
outDir, deps)`, with `deps` (`synthesize`/`checkTail`/`writeFile`/
`unlinkFile`/`verifyWritable`) injected so it can be exercised with zero
API calls and zero real filesystem writes. `main()` is now guarded to run
only when the file is the process entry point, so
`dev/287-voice-budget-check.ts` can `import { generateBatch,
MAX_SYNTHESIS_ATTEMPTS }` without triggering a live dry-run scan as an
import side effect.

## Verification

`npx tsx dev/287-voice-budget-check.ts` — fully mocked (no
createElevenLabsProvider, no ELEVENLABS_API_KEY, no real fs I/O):

- Scenario 2 (cap 100, three 40ch lines, line b always fails the tail
  check): exactly 2 `synthesize()` calls made (a.mp3, b.mp3 attempt 1);
  b.mp3's retry is refused (80 + 40 > 100) before a third call is ever
  billed; `checkTail` queried exactly once for b.mp3, proving the retry
  never reached it; billed total 80 ≤ 100; `refusedByBudget: true`;
  c.mp3 never attempted.
- Scenario 3 (cap 200, no failures): identical to pre-287 behavior — all 3
  lines generated, `synthesize()` called once per line, billed (120) ==
  planned (120), `refusedByBudget: false`.

`git diff --stat` touches exactly two files: the generator and this test.
`npm run typecheck` and a real dry-run (`npx tsx dev/generate-voice-lines.ts`,
0 API calls) both pass unchanged.
