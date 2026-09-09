# Task 213 — Fix: TV audio suspended for the whole night

Client-only. Files touched: `client/src/hooks/useGameAudio.ts`,
`client/src/screens/HostScreen.tsx`, `client/src/screens/host/hostStyles.ts`.
No server/phase/timing changes.

## The fix

1. **Singleton + reuse** — `getAudioCtx()` already guarded against a second
   construction (`if (audioCtxRef.current) return it`); confirmed this holds
   and left it untouched. `startKeepAliveAudio()` (called from every
   `ROOM_CREATED`, i.e. every real create AND every `HOST_REJOIN` ack) now
   attempts a resume on EVERY call, not just the first.
2. **Resume everywhere legal** — one new `attemptResumeAudio()` (always
   `await`s `ctx.resume()` and re-checks `ctx.state` afterward, never a bare
   `.catch(() => {})`) is now called from: (a) a capture-phase
   `pointerdown`/`keydown` listener on `document`, registered once, that
   self-removes once the context is actually running; (b) `startKeepAliveAudio`
   (every `ROOM_CREATED`/`HOST_REJOIN`) and the `visibilitychange` handler;
   (c) right before every scheduled playback (`startCrowdLoops`,
   `playCrowdOneShot`, `playSocratesLine`) and immediately after construction
   in `getAudioCtx`.
3. **Visible, honest state** — new `audioSuspended` state, flipped by
   `attemptResumeAudio`'s own before/after `ctx.state` check. HostScreen
   renders a chip (`data-testid="audio-suspended-chip"`, "🔇 Άγγιξε την
   οθόνη για ήχο") whenever it's true — a fixed top-left marble pill
   (`hostStyles.audioSuspendedChip`), stacked below `muteToggle`'s own
   LOBBY-only spot so the two never collide.

## Verification technique

Task 212's finding holds: this bundled Chromium reports every freshly
constructed `AudioContext` as `'running'` regardless of gesture, so a plain
diagnostic proxy (force `.suspend()` at construction) gets IMMEDIATELY
undone by this fix's own new resume call sites before anything could ever
observe the suspended window. Extended 212's page-init `Proxy` technique:
it now ALSO overrides the proxied context's `resume()` to silently no-op
(state stays genuinely `'suspended'`, no throw) unless a real page gesture
(`pointerdown`/`keydown`, tracked via a capture-phase listener installed
before any app code) has occurred at least once — modelling what a real
restrictive browser's native autoplay gate does. All BufferSource
`start()`/`ended` events are tracked into `window.__audioEvents` for
independent proof of scheduling/playback. Ran via a throwaway Playwright
harness (own ports 3905/5906, deleted after use per the 212 pattern —
`git status` shows only the three product files above).

## 1. RECONNECT PATH

- **1a** zero-gesture load (stored room code seeded via `addInitScript`
  before any app script runs) + the resulting `HOST_REJOIN`: exactly 1
  `AudioContext` constructed, `ctx.state === 'suspended'`, exactly 1 chip
  node. **PASS**
- **1b** forced reconnect (`context.setOffline(true)` then `false`, still
  zero-gesture) → still exactly 1 `AudioContext` instance (never
  reconstructed). **PASS**
- **1c** one synthetic `pointerdown` (`page.mouse.click`) → `ctx.state`
  flips to `'running'`, chip count 0. **PASS**
- **1d** ran a real quiz round after unlock: 2 BufferSource `start()` calls
  observed, both fired `ended` (crowd/Socrates audio genuinely playing and
  completing, not silently scheduled-and-stuck). A real SOCRATES phase
  (`GAME_INTRO`) was captured end-to-end at **7361ms**, well under the
  11000ms `SOCRATES_MAX_DURATION_MS` backstop — i.e. it now ends on
  `source.onended`, not the backstop. **PASS**

## 2. HAPPY PATH

Separate browser context, NO forced-suspend proxy (real, unmodified
Chromium autoplay behaviour) — real "Create Room" click, then one full
QUESTION→REVEAL cycle. Chip node count polled every 400ms through LOBBY and
the whole round: **max observed 0, end-of-run 0**. Crowd bed already had 3
BufferSource `start()` calls scheduled from LOBBY entry alone (before any
game start), confirming audio plays from the first beat on the happy path.
**PASS**

## 3. RESILIENCE

Continuing run A's suspended-proxy session: forced a mid-round
`setOffline(true)`→`false` cycle (a genuine socket.io disconnect/reconnect,
not just a page event) ~9s into the round, well inside an active QUESTION
phase. After it settled: still exactly 1 `AudioContext` instance, still
`ctx.state === 'running'`. **PASS**

## 4. REGRESSION

- `npm run typecheck`: clean (all 3 workspaces) after the fix. **PASS**
- Standard quiz round: `npm run screenshot:phases` (BOT_COUNT default) ran
  full → quiz(short, climb finale) → blitz across a fresh server/client
  pair, finished **"21/21 phase screenshots, 12/12 phone screenshots"**
  with zero errors/warnings in the run log. **PASS, unchanged**
- Agora round: `npx tsx dev/agora-scene-check.ts` (existing harness,
  untouched) — all 4 of its own criteria (spec/DOM counts match 1:1,
  awning hexes sanctioned, reconnect redraw identical, fairness 0
  market-layer nodes during AGORA_QUESTION, proof-beat exactly 1 highlight
  on the right subject) reported **PASS**. Also drove a standalone agora
  room through this task's own suspended-proxy technique: the chip appeared
  during AGORA_EXPOSE (1 node) with bounding box `{x:16, y:92, w:211,
  h:31}` against the market frame's `{x:0, y:283, w:1280, h:437}` —
  disjoint on the y-axis, **no overlap**. **PASS**

## Constraints honoured

No phase-timing, ack, or 11s-backstop code touched — `playSocratesLine`'s
`onEnded()` call sites and the server's `SOCRATES_MAX_DURATION_MS` are
unchanged; 1d above shows the backstop is now simply not being *hit*, not
that it was altered. The chip is chrome-level (rendered once in
`HostScreen`'s always-mounted JSX, not inside any phase view) and its fixed
top-left position sits above the agora market frame's own vertical band —
verified geometrically above, never overlapping the stalls per Task 210's
rule.

Committed, not pushed.
