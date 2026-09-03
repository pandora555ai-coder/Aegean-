# 154 — Prefetch Socrates mp3s, and never hold a phase on a dead clip

The host fetches each mp3 on first play (useGameAudio.ts:254) while the
server's 11000ms backstop starts immediately. Eleven active clips exceed
10s and one sits at 10919ms — 81ms under the cap. On a slow TV they get
cut off mid-sentence. A live playtest is in a few hours.

Do NOT decode into the AudioContext ahead of time — 254 decoded clips is
too much memory for a TV browser. Only warm the HTTP cache.

## Acceptance criteria — report on each SEPARATELY, under 8 lines total

1. On entering LOBBY, the host fetches every active mp3 (hash list from
   LINE_TAGS via lineHash) into the HTTP cache, low priority, no decode.
   Report the count and where the list comes from. It must not block
   LOBBY rendering — report how long it takes on localhost.

2. Playback path UNCHANGED. Observation run: play one clip and report
   that source.onended still fires and the phase still ends on it.

3. FAILURE PATH. Report what happens today if a fetch 404s or
   decodeAudioData throws: does the host emit socrates:audio_ended so
   the phase ends immediately, or does it sit silent for 11000ms? If it
   sits, fix it: any load or decode error emits audio_ended at once.
   Verify by observation with a deliberately wrong hash on a throwaway
   dev server. A silent 11-second Socrates looks broken to a room.

4. Report the three longest ACTIVE clips with durations, and whether
   prefetch + decode on this machine leaves any of them at risk of the
   backstop. Do NOT raise SOCRATES_MAX_DURATION_MS — report only.

## Constraints
- Fable. No screenshots, no Playwright.
- Do NOT touch the server's backstop, LINE_TAGS, LINE_RATINGS, or any
  audio file. Do NOT call ElevenLabs.
- The AudioContext is shared with the cues — confirm a cue still plays
  after the change.

---

## Report

Verification method: no browser (Playwright is off limits). The REAL
`useGameAudio` hook was executed in Node via `react-dom/server`
(`renderToString` of a probe component that captures the hook's API) with
a fake `AudioContext` (decode = ffprobe of the real mp3, `source.start()`
fires `onended` after the clip's true duration) and a `fetch` stub reading
the real files from `client/public/voice` (404 when absent). That hook API
was wired as the socket host of a throwaway dev server on port 3901 with 4
bots, quiz mode, short. The harness lives in the session scratchpad.

### 1. Prefetch

`prefetchSocratesLines(hashes)` in `useGameAudio.ts`; called from
`HostScreen`'s new `DEV_VOICE_LINES` handler. The list comes from the
server: on every LOBBY entry (`roomCode` set, `phase === 'LOBBY'`) the host
emits the existing `dev:get_voice_lines`, and the server answers with
`collectVoiceLineEntries()` — every pool line hashed as
`lineHash(line, LINE_TAGS[line])`, the same 254 hashes Task 153 proved
identical to LINE_TAGS. Fetch options `{ priority: 'low' }`, 4 in flight,
body read and dropped, never decoded; once per hook instance (the second
call is a no-op). Observed: **254 hashes → 254 fetches, 0 decodes**, and
the duplicate call added none. Nothing awaits it — LOBBY renders first;
the emit is a fire-and-forget effect. Localhost timing (Node, concurrency
4, against the Vite dev server): **cold 378ms, warm 224ms for 254 files /
12.6 MB.** Note: whether the later on-demand fetch is a pure cache hit
depends on the server's `Cache-Control`; express.static's default
(`max-age=0` + ETag) still revalidates with a 304, so the body transfer
is skipped either way.

### 2. Playback path unchanged

Only two lines changed inside `playSocratesLine` (both on the failure
branch, see 3). Fixed-hook run, 13 beats: every good clip's `onended`
fired 105-137ms after phase entry + clip length (the ffprobe "decode"), and
the server ended the phase 1-3ms after `socrates:audio_ended`. E.g. beat 9:
clip 10266ms, onended @10385ms, phase held 10386ms → POWER_UP. One
AudioContext for the whole run; `playQuestionStartCue` on the same context
started 3 oscillators after the change (cue still plays through the
shared context).

### 3. Failure path

**Today (pre-fix, observed):** a 404 returned from `playSocratesLine`
without calling `onEnded`, so no `socrates:audio_ended` was sent and the
phase sat silent until the server backstop: **beat 2 (bogus hash): onended
never, phase held 11010ms.** A decode throw took the same `catch` path with
the same result.
**Fixed:** `!res.ok` calls `onEnded()` and returns; the `catch` (fetch
throw, `decodeAudioData` throw, `start()` throw) calls `onEnded()`.
Re-run with the same bogus hash: **beat 2: onended @1ms, phase held 1ms →
QUESTION.** The muted / no-AudioContext early return is deliberately
unchanged — a muted TV still shows the line text for the backstop's
duration, which is the pre-existing documented behaviour.

### 4. Longest active clips vs the backstop

| clip | moment | ms | margin under 11000 |
|---|---|---|---|
| 4aa08f1cec71c4fc | SPLIT_GUESS | 10919 | 81 |
| 4c16c20194968c6f | PERFECT_GAME_PACE | 10762 | 238 |
| 29229d3a56fb9e54 | RUNAWAY_LEAD | 10684 | 316 |

On this machine a warm fetch is ~1ms per file (224ms / 254) but the real
cost is `decodeAudioData` of a ~10s mp3 on the TV's CPU, which this
harness cannot measure (its stand-in decode took ~110ms). Socket delivery
+ fetch + decode must fit inside the margin: SPLIT_GUESS's 81ms is at real
risk on any TV browser; the other two are marginal. Prefetch removes the
network term only. The remaining fix is shortening those lines (Task 149
style) — not done here, and the cap was not raised.
