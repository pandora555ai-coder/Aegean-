# Task 303 — hold beats with no audio for an estimated speaking duration

Field finding (Argyrios, live v2 TV test): QUIZ_MID/QUIZ_CLOSE fired but were
invisible. The defect was never silence — it was that a beat whose line has no
mp3 is acked by the client the instant it finds the 404 (Task 154), so the
phase ended in ~50ms and the subtitle flashed. None of the 36 v2 slot lines has
a clip yet, so that was every v2 slot beat in the game.

## 1. The rate, derived from the bank

`collectVoiceLineEntries()` reports 521 active entries; 137 mp3s exist; **125**
of those files still belong to an active line (the rest are orphans off
replaced text). Over those 125, duration (CBR byte-size, the server's own
estimate) against template char count:

| min | p10 | p25 | **median** | p75 | p90 | max | pooled |
|---|---|---|---|---|---|---|---|
| 5.21 | 8.77 | 9.65 | **10.65** | 11.55 | 12.32 | 13.91 | 10.576 |

(pooled = 9428 chars over 891.414s.) **Chosen: 11 chars/s** — the median
rounded to a whole number, inside the IQR. Being slightly above the median
makes the estimate slightly *short* of a true read, which is the safe
direction: a hold that overran its own backstop would be cut off by it.

```ts
// shared/src/index.ts
export const SOCRATES_HOLD_CHARS_PER_SEC = 11;
export const SOCRATES_HOLD_MIN_MS = 3000;
export const SOCRATES_HOLD_MAX_MS = 9000;

// server/src/socratesAudio.ts
export function socratesHoldMs(spokenText: string): number {
  const estimatedMs = (spokenText.trim().length / SOCRATES_HOLD_CHARS_PER_SEC) * 1000;
  return Math.min(SOCRATES_HOLD_MAX_MS, Math.max(SOCRATES_HOLD_MIN_MS, Math.round(estimatedMs)));
}
export function socratesHoldForBeat(template, tag, spokenText): number | null {
  if (resolveSocratesClip(template, tag).known) return null;   // audio paces it
  return socratesHoldMs(spokenText);
}
```

Cap 9000ms vs `SOCRATES_BACKSTOP_UNKNOWN_MS` 15000ms — the hold can never be
what reaches the backstop.

**Where it hooks in.** Keyed on the LINE's clip and nothing else, because that
is exactly what the client branches on: `playSocratesLine` loads the line's
buffer first and, finding none, calls `onEnded()` and returns *before* it looks
at a prefix or suffix. So a missing line means nothing sounds at all, whatever
splices the beat carries — which is what leaves the coronation's
without-vocative branch (263) and the suffix rule (277) untouched.

- `enterSocratesBeat` + `startSocratesIfLineFired` (phases.ts) set
  `room.socratesHoldMs` beside the backstop — every beat, null when the clip
  exists, so it can never leak between beats. A sequence's queued lines come
  back through `enterSocratesBeat` one at a time, so **each line holds on its
  own**.
- `endSocratesBeat` (index.ts) **absorbs** that one ack: nulls the field, then
  re-arms the *same* `activeTimer` under the *same* kind with the same
  continuation the ack was about to call. Not a second advance path — the beat
  still leaves through exactly one, just later. Elapsed-since-armed is derived
  as `buildSocratesPayload` already derives it (armed backstop minus remaining),
  which is pause-aware for free. A skip is exempt by design.

The hold is anchored to **beat start**, not to ack arrival, so a late ack never
extends a beat.

## 2. Live v2 bot run (scenario A, real browser TV, `?bot=4&mode=full&policy=v2`)

| beat | chars | hold | subtitle on screen | server |
|---|---|---|---|---|
| QUIZ_MID | 99 | 9000ms (capped) | **9033ms** | `holding 8946ms more of 9000ms (socrates:audio_ended absorbed)` |
| QUIZ_CLOSE | 76 | 6909ms | **6958ms** | `holding 6853ms more of 6909ms (socrates:audio_ended absorbed)` |

Next phase after each: the show carried straight on (stage 1 ran to question 10
and beyond). Beats **with** audio in the same run: 10 clip-backed GAME_INTRO
beats, **0 held**, each still ending on its own `socrates:audio_ended`.

## 3. The three interactions

- **skip-cut mid-hold (B)** — beat 1, 85 chars, hold 7727ms, backstop 15000ms;
  ack absorbed at 302ms (`holding 7724ms more of 7727ms`); vote passed with
  6423ms of the hold still to run → beat 1→2, queue discarded (0 left),
  `socrates:stop beatId=1`, interruption itself held (8182ms), late ack for
  beat 1 refused (`stale beat 1, current is 2`), interruption on screen 8141ms
  vs its 8182ms hold — its own ack landed at 601ms and did **not** shorten it.
- **pause mid-hold (C)** — frozen at 6422ms, still 6422ms 900ms later; a
  duplicate ack while paused refused (`game is paused`); resumed and advanced
  6441ms later vs the 6422ms frozen remainder, exactly once.
- **backstop margin** — QUIZ_MID 9000ms hold vs 15000ms backstop (margin
  6000ms), QUIZ_CLOSE 6909ms (margin 8091ms); the backstop fired zero times in
  any scenario.

## 4. Inverse

`git diff --stat` 6 files, 703 insertions(+), 2 deletions(−) — 118 of those
lines are the change, 585 the new harness. `npm run typecheck` ×3: pass, pass,
pass. `npx tsx dev/277-splice-check.ts`: **24 passed, 0 failed**. Scenario D: a
clip-backed beat sets `holdMs=null`, backstop = 4551+3000 = 7551ms, advances
50ms after its ack with 0 hold logs. Scenario E (v1 show, 7 clip-backed beats):
worst |measured − clip| = **3ms**, 0 holds.

Harness: `npx tsx dev/303-hold-check.ts` (`SCENARIO=A|B|C|D|E`), 23 checks
total — A 6/6, B 8/8, C 4/4, D 3/3, E 2/2.

## Known, not fixed

- `SocratesShowPayload.totalDurationMs` still reports the 4000ms
  `SOCRATES_DURATION_MS` floor for a clip-less beat, so the TV's cosmetic
  countdown reaches 0 before the hold ends. Not touched — the subtitle is
  driven by the phase, not by that field.
- The duel's early-lock `DUEL_LOCKED` beat is not a SOCRATES phase (it plays
  inside DUEL_PICK and acks through `onDuelAudioEnded`), so it is not held.
- Two harness traps found and fixed here, both worth knowing: `?bot=N` bypasses
  Task 259's audio gate but **nothing presses "Create Room"** — that button has
  no testid and is the only non-`mute-toggle` button under `lobby-root`; and a
  DOM sampler stopped at the moment a beat is *detected* measures the start of
  its hold, not the whole of it (it read 393ms of a 6909ms hold and called the
  product broken while the server log said otherwise).
