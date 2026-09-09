# Task 212 — Diagnose: ALL TV audio dead in a real full game

Read + instrument only. All temporary instrumentation (console logging in
`client/src/hooks/useGameAudio.ts` and `server/src/socrates.ts`) and two
throwaway harness scripts (`dev/tmp-audio-diagnose.ts`,
`dev/tmp-socrates-diag.ts`) were reverted/deleted before writing this
report — `git status`/`git diff` show only this file.

## 1. PLAYBACK PATH (primary) — VERDICT: root cause

The whole app uses **only** the Web Audio API — zero `HTMLMediaElement`s
anywhere (`grep -rn "new Audio(\|\.play()\|HTMLAudioElement" client/src`:
0 hits). One shared `AudioContext` (`useGameAudio.ts:245` `getAudioCtx`)
gates both crowd and Socrates; it is first constructed either from a real
"Create Room" click's async `ROOM_CREATED` reply (`HostScreen.tsx:324-329`
`handleRoomCreated` → `startKeepAliveAudio()`) **or from `HOST_REJOIN`,
which fires unconditionally on every socket `'connect'` event with ZERO
gesture** (`HostScreen.tsx:1510-1521` `attemptRejoin`; server re-emits
`ROOM_CREATED` for it too, `server/src/index.ts:683`). Nothing anywhere
checks `ctx.state` before scheduling playback (`startCrowdLoops:332`,
`playSocratesLine:535` both call `source.start()` unconditionally). The
only two `.resume()` call sites are `GAME_RESUMED` (VIP-initiated) and
`visibilitychange` (`useGameAudio.ts:135-145,156-163`) — there is exactly
**one** `onClick` in the whole of `HostScreen.tsx` (`toggleFullscreen`,
line 2330) and it has nothing to do with audio.

Bare `chromium.launch()` **and** `chromium.launch({args:
['--autoplay-policy=user-gesture-required']})` both reported a freshly
constructed `AudioContext.state` as `'running'` **unconditionally** — no
gesture, no policy flag, no timing (sync-in-click vs. async-after-click)
made any difference — verified three ways: a bare `about:blank` page
(headless and headed), and the real `/host` page driven through both the
real "Create Room" click and the zero-gesture `HOST_REJOIN` path. None of
the existing harnesses (`screenshot-phases.ts`, `agora-scene-check.ts`,
`agora-phone-check.ts`, `agora-sophists-check.ts`) pass any
`--autoplay-policy` flag — but it would not matter if they did: **this
Playwright/Chromium build cannot reproduce the real autoplay-suspend
behavior for Web Audio at all**, which is the actual reason none of them
ever caught this.

To get real signal, I forced the initial state via a page-init `Proxy`
around `window.AudioContext` that calls the *native* `.suspend()`
immediately after construction (everything else — scheduling, `.resume()`,
timing — stayed real), then drove the real `/host` page + 2 bots through a
quiz round in two modes:

| | ctx.state at creation | crowd bed `source.start()` | Socrates `source.start()` | `onended` fired? | SOCRATES phase length |
|---|---|---|---|---|---|
| (a) no gesture (`HOST_REJOIN`, zero click) | `suspended` | called, silent | called, silent | never | 11009ms (hit the 11000ms backstop) |
| (b) one synthetic click before game start | `suspended` | called, silent | called, silent | never | 11002ms (hit the backstop) |

**Modes (a) and (b) are identical** — a generic click doesn't help because
nothing in the code listens for one to call `resume()`. Zero console
errors/warnings in either run (Web Audio's suspend fails perfectly
silently — there's no `NotAllowedError` promise to reject, unlike
`HTMLMediaElement.play()`, which this app never uses).

## 2. INIT DEPENDENCY (regression suspect) — VERDICT: not the cause

No dependency. `startKeepAliveAudio()` runs from `ROOM_CREATED`/`HOST_REJOIN`
(`HostScreen.tsx:324-330`) and `loadCrowdSounds()` runs from a
`[roomCode, phase==='LOBBY']` effect (`HostScreen.tsx:1568-1573`) — both
fire regardless of whether any phone ever connects. `VipAudioControls`
lives entirely on the phone (`ControllerScreen.tsx`, Task 178) and only
reaches `setCrowdVolume`/`setVoiceVolume`, which read-only gate on
`ctx`/`bedGain` already existing (`useGameAudio.ts:212-238`) and never
call `getAudioCtx()` themselves. Task 195's finding (the slider collapse
doesn't affect playback) still holds structurally — this is a dead end,
confirming the real fault is Q1's, not a slider-UI coupling.

## 3. SELECTION (secondary confirmation) — VERDICT: not the cause

Instrumented `recordRoundAndPickLine` (candidates + skip reasons) and ran
one complete `full` mode (gameLength `short`), 3-bot game to `GAME_OVER`
over real sockets. The quiz picker was invoked **exactly 4 times** (2 in
stage 1, 2 in stage 4 — matches `FULL_QUIZ_QUESTION_COUNTS.short` = 2+2
exactly) and **every call selected a candidate on its first try — 0
fire-cap skips, 0 cooldown skips, 0 empty-pool skips** observed. 13
SOCRATES phases fired total across 58 phase changes for the whole game
(quiz + draw + numeric + trial pickers combined). The server's own
existing `logMomentFireSummary` (`socrates.ts:1589`, already runs at
`GAME_OVER`, not something I added) reported only 2 of 18 possible quiz
moments ever fired (`EVERYONE_WRONG=2, ONLY_ONE_CORRECT=2`; 16/18 never
fired — expected for a 4-question sample, not a bug). None of the
speculated skip reasons (weapon gate, stage scoping, dedup) occurred in
this run. Selection is not implicated in the reported outage.

## 4. REGRESSION ANCHOR

`git log --oneline 8f0f2fa..HEAD -- client/src/hooks/useGameAudio.ts
client/src/screens/HostScreen.tsx` touches 4 commits (`af9c4bf` Task 210,
`bfdeef6` Task 208, `7b5cf1f` Task 207, `00b3473` Task 205) — **all 4
touched those files only for unrelated agora/climb feature work; 0 lines
in any of their diffs touch `playSocratesLine`/`audio_ended`/
`startKeepAliveAudio`/`loadCrowdSounds`/`resumeAudio`/`suspendAudio`/
`AudioContext`/`getAudioCtx`** (checked individually per commit). The
actual architecture at fault — `ROOM_CREATED`-triggered context
construction, and `HOST_REJOIN` auto-firing on every socket `'connect'`
with no gesture — is original to **Task 14** (`261332c`, "keep the TV
alive, make TV disconnection harmless") and was touched exactly once
since, by a pure mechanical refactor (`17fc40b`, splitting HostScreen's
hooks, no behavior change). **This is a latent bug, not a regression from
tasks 205–210.**

## Root cause

The one shared `AudioContext` gating both crowd and Socrates audio can be
constructed with **zero user gesture at all**, via `HOST_REJOIN`'s
unconditional auto-fire on every socket `'connect'` (`HostScreen.tsx:1510-1521`)
— which happens on any page reload, not just a fresh "Create Room" click.
A real restrictive browser hands back a context born `'suspended'` in that
case, and nothing in the client ever calls `.resume()` except a VIP-initiated
pause/resume or a tab `visibilitychange` — neither of which a TV that just
runs a whole game night, unpaused, foregrounded, will ever see. Because
nothing checks `ctx.state` before scheduling playback and Web Audio fails
completely silently (no exception, no rejected promise), the failure is
invisible in logs and structurally untestable by the existing Playwright
harnesses (which never suspend a context at all, with or without autoplay
flags). **The smallest fix belongs to the TV playback init / gesture-unlock
layer** (`useGameAudio.ts` + `HostScreen.tsx`'s `handleRoomCreated`/
`attemptRejoin`), not composition or selection — e.g. checking `ctx.state`
right after construction and, if `'suspended'`, retrying `.resume()`
opportunistically (a low-frequency timer, and/or piggybacking on literally
any subsequent DOM event the host page ever receives) instead of relying
solely on `GAME_RESUMED`/`visibilitychange`.
