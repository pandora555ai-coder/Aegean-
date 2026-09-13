# Task 238 — Socrates pacing: duration-aware backstop + VIP skip

One principle, two changes: **audio length is authoritative**; protection
exists only for genuinely hung audio, and skipping is a player choice. Neither
may create a new phase-advance path.

## Diagnosis (before touching anything)

- **The cap.** `SOCRATES_MAX_DURATION_MS = 11000` (shared/src/index.ts:1576).
  Consumers: `phases.ts:373` (`enterSocratesBeat`) and `phases.ts:874`
  (`startSocratesIfLineFired`) armed the phase timer at it; `payloads.ts:263`
  derived the TV's countdown by subtracting the timer's remainder from it;
  `socratesAudio.ts:28` clamped the reported clip length to it;
  `phases.ts:1881` uses `SOCRATES_MAX_DURATION_MS - DUEL_LOCK_FLOOR_MS` for
  the duel's early lock (not an audio-driven beat).
- **The beat advance path (Task 236).** The host echoes `beatId` on
  `socrates:audio_ended` (HostScreen.tsx:681); the server validated it in the
  `SOCRATES_AUDIO_ENDED` handler (index.ts:1321-1328) — phase must be
  SOCRATES, room not paused, id must equal `room.socratesBeatId` — then
  dispatched `continuationForActiveTimer(room)?.()`.
- **Where a skip enters.** `vip:next` already had a SOCRATES branch
  (index.ts:1247) calling `continuationForActiveTimer` directly — a second
  advance path that bypassed the beatId check entirely.
- **A latent hole.** Only `enterSocratesBeat` incremented `socratesBeatId`;
  `startSocratesIfLineFired` did not, so every REVEAL-moment beat reused the
  previous beat's id. Harmless for filtering a stale *audio* ack, not harmless
  once a VIP press is identified the same way.

## A — duration-aware backstop

`socratesAudio.ts` now exposes `resolveSocratesClip` → `{durationMs, known}`
and `socratesBackstopMs` = `known ? clip + 3000 : 15000`
(`SOCRATES_BACKSTOP_MARGIN_MS` / `SOCRATES_BACKSTOP_UNKNOWN_MS`, shared). Both
arming sites use it and record the armed span on `room.socratesBackstopMs`, so
`buildSocratesPayload` can still derive its countdown across a pause (the
timer's own `durationMs` is rewritten to the remainder on resume). The clamp
on the reported clip length is gone, so the TV is told a clip's true length.

**Duration source:** the mp3's byte size (CBR, the existing Task 42b
estimate), read server-side at arm time. Validated against ffprobe over all
283 files: max error 32ms, and it always errs *high* — the safe direction for
a backstop. **It cannot regress Task 154**, because that path is client-side
(a 404/decode failure calls `onEnded()` at once) and an ack is accepted the
moment it arrives regardless of what the backstop was set to.

`SOCRATES_MAX_DURATION_MS` survives only as the duel's early-lock ceiling and
as the field's neutral value outside a beat. The raise is an explicit
Argyrios decision (2026-09-13); CLAUDE.md's cap rule was rewritten to match.

## B — VIP skip

`endSocratesBeat(room, beatId, source)` (server/src/index.ts) is now the ONE
way a beat ends early. All three callers go through it: the host's audio ack,
the new `vip:skip_socrates`, and `vip:next`'s SOCRATES branch. It owns the
phase/pause/stale-id rules, so a skip *synthesises* the natural end rather
than paralleling it — mid-sequence it plays the next line, because the queue
drain in `advanceFromSocrates` still decides that and is untouched.

`ServerEvents.SOCRATES_BEAT` carries the beat id room-wide (the id only — the
line stays host-only) so the VIP's phone can name what it skips. A press with
no id means "whatever is current", which keeps a VIP who reloaded mid-beat
able to skip. Phone control: `data-testid="socrates-skip-button"`, on the
reveal card and on the waiting screen; a non-VIP renders no such node.

## Verification

`dev/socrates-pacing-check.ts` — in-process real server on 3917, so the
harness reads the LIVE Room and reports what the timer was **actually** armed
at. Beats are driven through the real sequence machinery rather than waiting
out a ~14-minute show for random pool picks (#11 is 1 of 3, #15 is 1 of 2, so
a live run covers all four over-cap clips ~1 time in 6).

### 1. A — six beats, all four over-cap clips (22/22)

| line | real audio | backstop armed | ack @ | advance cause |
|---|---|---|---|---|
| Εισαγωγή#9 | 12356ms | 15388ms | 12357ms | natural ack |
| Παλαίστρα#11 | 11233ms | 14264ms | 11233ms | natural ack |
| Ζωγραφική#15 | 10998ms | 14029ms | 10998ms | natural ack |
| Ανάβασις#22 | 13949ms | 16981ms | 13949ms | natural ack |
| Ανάβασις#21 | 9326ms | 12357ms | 9326ms | natural ack |
| Ανάβασις#20 | 4127ms | 7159ms | 4128ms | natural ack |

Every over-cap clip plays to its natural end; **backstop fired 0 times**.
Baseline was #22 truncated at 11006ms (~2.9s lost). Payload lengths now match
reality (12388/11264/11029/13981 vs the flat 11000 before).

**Ζωγραφική#15 is the subtle one:** 10998ms by ffprobe — *under* the old cap —
but 11029ms by the server's byte-size estimate, and the estimate is what the
cap clamped. Judge "over-cap" by the estimate, never by ffprobe.

### 2. A-inverse — hung and missing clips (6/6)

- Hung, known duration: armed 16981ms, backstop fired at **16981ms**
  (clip 13949 + 3000). Game proceeded.
- Hung, unknown duration (no mp3): armed **15000ms**, fired at 15001ms —
  the flat fallback, not floor+margin, so an unmeasurable long clip isn't cut
  off at 7s.
- Missing clip: the ~0ms ack was accepted and ended the beat at **1ms** with
  the backstop still 15000ms away. **Task 154 intact.**

### 3. B — VIP skip (6/6)

```
beat 1  ended by natural ack
beat 2  VIP pressed 499ms in
beat 3  started 3ms after the press
skip:    room 0663 Socrates beat 2 ended (vip:skip_socrates) - advancing
natural: room 0663 Socrates beat 1 ended (socrates:audio_ended) - advancing
```

The two log lines are character-identical but for the source name — that is
the path-identity proof. Mid-sequence the skip advanced to the *next* line
(beat 3), not past the narration. Double press: `rejected vip:skip_socrates
... stale beat 2, current is 3`, 0 extra advances. Non-VIP press: `rejected
... is not VIP`. DOM: see E below.

### 4. B-inverse — Ανάβασις announce, pause orderings (14/14)

All three announcement beats skipped one at a time; `CLIMB_QUESTION` did not
exist during any of them and arrived only after the sequence finished, via the
normal flow (phase `CLIMB_QUESTION`). Pause+skip: refused (`game is paused`),
0 advances, timer frozen 16579→16579, resumed 16280. Skip+pause: skip landed
first, next beat frozen 6659→6659, resumed 6409.

### Regression

- `npm run climb:staging-check` — **35 passed, 0 failed** (Task 237 staging
  invariants hold; scene does not move, duel overlay not re-shown).
- `npm run climb:lane-check` — **21 passed, 1 failed**, the known wreath
  sighting at 7246ms. Baseline at fa2a40f, measured before any edit: 21
  passed, 1 failed, wreath at 7339ms. Same single pre-existing failure, same
  character (one sighting, row opacity 0.6) — not worse.
- `SCENARIO=E` (phone DOM, real browser at 360x640) — **4/4**. VIP phone:
  `vip-badge` 1, `socrates-skip-button` **1**. Non-VIP phone: `vip-badge` 0,
  `socrates-skip-button` **0** — absent from the committed DOM, a render
  branch rather than a disabled control. One phone per room, VIP-ness set by
  join order, each sub-run asserting the role it actually got.
- `npm run typecheck` — clean across shared/server/client.

## Out of scope, found not fixed

- The climb's ENTRY narration still renders the theatre + wreathed SophistsRow
  on the climb's own announcement (the known lane-check #3 failure, Task 237
  documented it; needs a server-side signal).
- Harness note: `startClimb` shows the finale STAGE_ANNOUNCE **card** first —
  the announcement sequence only begins when that card's timer elapses. A flat
  sleep after `startClimb` finds the room still on the card.
