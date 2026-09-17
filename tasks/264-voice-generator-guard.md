# Task 264 — guard the voice generator against a budget blowout

After Task 263 registered 206 previously-unreachable lines (201 vocatives +
5 coronation), `npm run voice:generate` was one accidental invocation away
from synthesizing all of them against a ~1,300-char balance that resets 28
September, writing partial results straight into `client/public/voice` —
a symlink into `/opt/party-game` (see the Voice section of CLAUDE.md).
Generation was the default, unconditional, with no budget check at all.
It no longer is.

No ElevenLabs calls were made and no audio was generated or deleted in this
task — verified below.

## What changed

`dev/generate-voice-lines.ts` only:

- **Dry run is now the default.** No flags at all prints the plan — count,
  total characters, and a per-line `hash.mp3  Nch  "spoken text"` list — and
  returns before `createElevenLabsProvider()` is ever called. `ELEVENLABS_*`
  env vars are not read in this path.
- **`--generate` + `--max-chars <N>` are both required to actually
  synthesize.** `--generate` alone throws immediately, before any network
  call, asking for the budget. With both given, the same plan is computed
  first; if its total characters exceed `--max-chars`, the run prints the
  full plan, reports the overage, and exits 1 — **zero API calls, zero
  clips written.** It does not fall back to a partial batch.
- **`--hashes h1,h2,...`** restricts the plan/generation to exactly those
  `lineHash` values (a CLI form of the existing `ONLY_HASHES` env var, which
  still works and unions with it).
- **`--names Name1,Name2,...`** resolves each to its PRESET_NAMES vocative
  clip (`getVocative` + `LINE_TAGS`/`lineHash`, Task 263's own scheme) and
  restricts to those hashes. Rejects any name not verbatim in `PRESET_NAMES`
  rather than silently hashing an arbitrary string.
- **`--limit N`** (pre-existing) still caps the batch, applied after any
  `--hashes`/`--names` filtering, before the character total is computed —
  so the budget check always reflects what would actually be sent.

Nothing about the line bank, tags, or text changed — `server/src/socrates.ts`
was not touched.

## Acceptance criteria

**1 — default, no flags.** `npx tsx dev/generate-voice-lines.ts`:

```
DRY RUN (default, no API calls) - pass --generate --max-chars <N> to actually synthesize.
Would generate 206 of 206 missing line(s), 1788 char(s) total.
```

206 lines matches Task 263's own count (201 vocatives + 5 coronation) exactly.
1788 is the measured total of the actual `spoken` text (tag + stripped line)
that would be sent per line — the task brief's "~3,236 chars" was a rough
estimate, not a target to match. Zero network calls: no fetch is reachable
before the function returns, and the run succeeds with no ElevenLabs env
vars set at all (confirmed by unsetting all three first).

**2 — opt-in + budget, over budget.**
`npx tsx dev/generate-voice-lines.ts --generate --max-chars 1300`:

```
Refusing to generate: 1788 chars exceeds --max-chars 1300 by 488 char(s). 0 API calls made, 0 clips written.
```
(printed after the full plan list, exit code **1**). `client/public/voice`
held **283** mp3s before and **283** after — confirmed by directory count,
not by trusting the message. `--generate` with no `--max-chars` at all
throws `--generate requires an explicit --max-chars <N> budget` and also
makes zero calls.

**3 — subset by name.**
`npx tsx dev/generate-voice-lines.ts --names "Άρης,Νίκη,Τάκης"`:

```
Would generate 3 of 3 missing line(s), 11 char(s) total.
  7464ff97a0d9471b.mp3  4ch  "Τάκη"
  2e5eb3ff6defe3bb.mp3  3ch  "Άρη"
  a0e94b55eeee5091.mp3  4ch  "Νίκη"
```

Three hashes, 11 characters total, zero API calls (still the dry-run
default — `--names` alone doesn't opt into generation).

**4 — inverse.** `git diff --stat` (working tree at time of this commit):
touches only `dev/generate-voice-lines.ts` and `tasks/264-voice-generator-guard.md`.
`client/public/voice` mp3 count: **283 before, 283 after**, across every
command run above, including the over-budget refusal and the `--generate`-
without-`--max-chars` error. `/opt/party-game` was never touched — this task
only ever ran `npx tsx` from `/home/argyrios/Aegean`, never `aegean-deploy`.

## Note

The next real `npm run voice:generate` (whenever budget allows) now must
pass `--generate --max-chars <N>` explicitly, and can be split into
`--names`/`--hashes` batches sized to whatever the balance actually allows
at the time — the vocative names are the obvious first candidate to record
in a small batch.
