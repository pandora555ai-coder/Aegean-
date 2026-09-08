# Task 196 — Socrates caption lifecycle + krater timer inventory

## What "the Socrates caption" was

The bordered burgundy-pill/marble slab showing the spoken line's text
(`«{socrates.line}»`) was `SpeechSlab` inside `SocratesView.tsx`,
gated purely on `phase === 'SOCRATES'`. Its own comment already called
it "chrome" (`position: fixed; inset: 0`), but structurally it lived
INSIDE `phaseView` — a sibling to `anavasis-scene-container`, not a
child of it, so any scene-scoped check (Task 192's frame-alternation
audit) never covered it. And because it was tied to the PHASE rather
than the audio, a slow/failed/muted clip could hold stale text well
past when the line actually finished.

## Changes (client only)

1. **HostScreen.tsx** — new independent caption state
   (`captionText`/`captionFading`), rendered as its own top-level
   sibling (right after `<SocratesFigure>`, outside
   `anavasis-scene-container`). `showCaption(text)` fires the instant
   `SOCRATES_SHOW` arrives (live or a `state:sync` reconnect catch-up).
   `hideCaptionSoon()` is now the SAME `onEnded` callback passed to
   `playSocratesLine` — it starts an opacity fade and unmounts the
   element `CAPTION_FADE_MS` (800ms) later. Since Task 195, `onEnded`
   fires on real completion AND on every failure path (fetch-not-ok,
   decode error), so a dead clip fades the caption exactly like one
   that played. `CAPTION_HARD_CAP_MS` (15000ms) is a backstop for the
   one path with no `onEnded` at all — muted playback, which returns
   before `source.onended` is ever wired. The four existing
   `setSocrates(null)` sites (LOBBY, `question:show`, `power_up:show`,
   `state_sync`) now also hard-clear the caption, mirroring the
   existing safety net.
2. **SocratesView.tsx** — dropped its own `<SpeechSlab>`; it now
   renders only `GameLayout`'s room-code/pause chrome (unchanged from
   every other phase view).
3. **AnavasisScene.tsx** — `AnavasisClimbers` gained an optional
   `onMovingChange` prop, fired from the SAME `moving` state
   `useClimbMovement` already computes (with an unmount cleanup
   calling `onMovingChange(false)` so leaving the climb entirely can't
   strand the flag `true`). HostScreen wires this into `anavasisMoving`
   state and gates the caption's render on `!anavasisMoving` — no
   second "is a body moving" implementation.
4. **dev/screenshot-phases.ts** — `SOCRATES_CAPTURE`'s selector moved
   from the now-gone `[data-testid="socrates-stage"]` to
   `[data-testid="socrates-caption"]`.

## Verification method

Real gameplay can't put a SOCRATES beat and the climb glide on screen
at once (SOCRATES never fires once `isClimbFinale` is true), so a
throwaway Playwright script drove the actual running dev server
(`localhost:5173`, `localhost:4001`) directly: loaded `/host`, clicked
"Create Room" for a real user gesture (unlocks the AudioContext, same
as a real TV), then fired `SOCRATES_SHOW`/`CLIMB_QUESTION_SHOW`/
`CLIMB_REVEAL_SHOW`/`phase:changed` payloads by reading socket.io-
client's own `_callbacks` map and invoking the registered listeners
directly — bypassing the network, but exercising the exact same
client code path a real server event would. Real pre-generated mp3s
(`client/public/voice/*.mp3`) were used so real fetch/decode/playback
ran; the "bogus hash" case supplied a template with no matching file.
Script deleted after the run, not committed.

## Results — see the top-level report for full numbers/table

1. Normal line: caption removed 895ms after the mp3's own real
   (ffprobe-measured) duration elapsed. Forced-failure line: removed
   823ms after the logged failure. Both within 800±300ms. PASS.
2. Climb glide: 14 polled samples with `moving=true`, 0 with the
   caption visible. PASS.
3. All 21 `GamePhase` values audited against `timerForPhase()`
   (client) and `armActiveTimer` call sites (server) — krater gating
   already matched the intended "player-facing countdown" set with no
   mismatches; no server or krater code changed.
