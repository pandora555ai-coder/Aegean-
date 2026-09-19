# Task 277 — generalise the vocative splice: prefix OR suffix on any beat

Task 263 gave a beat one optional clip spliced AHEAD of its line. A beat can
now carry one AFTER it as well — neither, either, or both — under the same
single ack. Audio-chain mechanics only: no coronation text, constant, pool,
gender rule or WINNER fallback was touched (`git diff --stat
server/src/socrates.ts` = 0 lines).

## What changed

- **`SocratesShowPayload.suffix`** (shared) — `{ template, tag } | null`, but
  declared OPTIONAL and **omitted entirely** when there is none, so every beat
  that predates this task serialises byte-for-byte as before. `prefix` stays
  `| null` exactly as it was.
- **`PendingSocratesBeat` / `QueuedSocratesLine`** (state.ts) —
  `suffixTemplate`/`suffixTag` beside `prefix*`; a queued line may carry either,
  since the drain turns it into an ordinary beat.
- **`enterSocratesBeat`** (phases.ts) — accepts the suffix, arms the backstop
  against it, and states it in the per-beat log (`suffix="…"`, after the
  prefix note, so a beat with neither prints the line it always did — which is
  what dev/263-coronation-check.ts's own log regex reads).
- **`startSocratesSequence`** — optional `suffix`, applied to the **last** line
  of a sequence (a closing address belongs at the end of the narration, not
  after every sentence); `advanceFromSocrates`' drain carries it onto that
  line's own beat.
- **`socratesBackstopMs`** (socratesAudio.ts) — `line + suffix`, each resolved
  on its own: real length when measurable, flat `SOCRATES_BACKSTOP_UNKNOWN_MS`
  when not, margin added once by the line. No suffix → arithmetically the old
  value. The PREFIX is still not counted, exactly as 263 left it.
- **`buildSocratesPayload`** — serialises the suffix and adds its clip to
  `totalDurationMs` (the TV's progress span, and what bots.ts's socket-only
  host waits out before acking). An unmeasurable suffix adds 0, not the 4000ms
  floor: it plays for no time at all.
- **`playSocratesLine`** (useGameAudio.ts) — one chain, one ack, bound to the
  last clip that really plays.

## The bug this found, and fixed

Scenario B (a deliberately absent suffix) played **zero clips and acked at
93ms** — on a beat whose own line was present and had played fine a moment
earlier. `loadSocratesBuffer` returns null on a 404 but THROWS on a decode
failure, and a missing `.mp3` is not always a 404: a host with an SPA fallback
(the Vite dev server, for one) answers it with 200 + index.html. Sharing the
outer `try` with the line, that exception skipped the LINE as well and ended
the beat in silence. Each splice now loads in its own `try` and degrades to
null, which simply drops it from the chain. The same guard covers the prefix,
which had the identical exposure since 263.

The harness nearly hid it: its ack check was one-sided ("under the backstop"),
which 93ms satisfies. It is two-sided now — an ack must land AT the line's end.

## Acceptance criteria

Check: `npx tsx dev/277-splice-check.ts` (`SCENARIO=A|B|C`) — real in-process
server on 3965, real Vite on 5966, real browser TV, real player sockets.
**24 passed, 0 failed.** Both spliced clips are REAL bank lines chosen at
runtime, because a stand-in must be fetchable by the browser and
`client/public/voice` is a symlink into `/opt/party-game`. **Nothing was
written to any voice directory.**

**1 — the wire.** Payload keys with no splice and with a prefix only are
identical, 14 of them, `suffix` absent from the JSON entirely (not null). A
suffix beat adds exactly one key, immediately after `prefix`. `both` carries
the two independently.

**2 — the chain.** `[prefix?, line, suffix?]`, `onEnded` bound to the last
element: ack at the line's end for none/prefix (unchanged from 263), at the
suffix's end for suffix/both. A splice that fails to load is absent from the
chain rather than a gap in it, so the ack moves to whatever really is last.
`beatId` is unaffected — still exactly ONE ack per beat, still carrying the id
captured when the beat began, so a chain cut off by the backstop acks stale and
is refused (Task 236) rather than advancing the beat already on screen.

**3 — measured, in a real browser** (an `AudioBufferSourceNode.prototype.start`
probe installed as a raw JS string — Task 259's `__name` trap). Real suffix:
clips started at 7986.4ms and 12464.9ms, decoding to 4480ms and 5280ms (files
4551/5361ms), **gap line-end → suffix-start = −1.5ms**, chain total **9759ms**
against an armed backstop of **12912ms** (= 4551 + 3000 margin + 5361); the ack
landed at **9887ms** via `socrates:audio_ended`, i.e. it waited for the suffix,
not the 4551ms line; the backstop never fired; zero page audio warnings.
Absent suffix: **one** clip, ack at **4574ms** against a 4551ms line and a
22551ms backstop (= 4551 + 3000 + 15000 unknown-flat), the decode failure
logged as `EncodingError: Unable to decode audio data`, backstop never fired.

**4 — inverse.** `git diff --stat`: 7 files, +173/−17 —
`shared/src/index.ts`, `server/src/{state,socratesAudio,phases,payloads}.ts`,
`client/src/hooks/useGameAudio.ts`, `client/src/screens/HostScreen.tsx` — plus
the new `dev/277-splice-check.ts`. Zero changes under coronation
constants/pools (`server/src/socrates.ts` untouched; the only diff line
matching CORONATION|VOCATIVE|NAME_GENDER|WINNER_LINES is a comment naming the
263 harness). Typecheck clean in all three workspaces.

## Both existing socrates harnesses are ALREADY BROKEN at HEAD

Verified by stashing the change and re-running, not by reasoning:

- **`dev/socrates-pacing-check.ts`** — **22 ok / 0 FAIL with the change, and
  22 ok / 0 FAIL at HEAD**, both crashing at the same point in scenario B:
  `TypeError: Cannot read properties of undefined (reading 'category')` at
  `startQuestion` ← `beginRound` ← `beginStageOrRound` ← `advanceFromSocrates`
  ← a Timeout. Its own sentinel's backstop fires after the scenario has moved
  on and routes into a game that was never dealt. Identical either way.
- **`dev/263-coronation-check.ts`** — crashes at HEAD too, in scenario D
  before its first `check()` scores: `buildCoronationSequence(...)!` returns
  null. Cause is DATA, not code: both line-3 variants
  (`dd09e7993b172139` 3α/m and `bcc2ae3833de4e46` 3β/f) are marked
  `"status": "deleted"` in the tracked `server/src/data/voice-line-review.json`
  (155 deleted lines, Task 271's audition tool), so `pickCoronationLine` takes
  its `isLineDeleted` degrade. The coronation currently has NO playable line 3
  at all and falls back to `WINNER_LINES` — worth knowing before the next task
  rebuilds it. Neither harness was repaired here; per the Task 241/245
  precedent, a harness repair is its own task.
