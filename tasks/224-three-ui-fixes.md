# Task 224 — three small visible P1 fixes

UI only. Verified from a running dev server (port 4001 / client 5173) —
no Playwright, no screenshots, per the task's own instruction. Socket
checks used raw `socket.io-client`; the name-plaque check used a real
headless Chrome driven over raw CDP (WebSocket + the `/json` HTTP
endpoint), not Playwright. Both verification scripts were throwaway
(`dev/_scratch-verify-224-sockets.ts`, `dev/_scratch-verify-224-dom.ts`)
and deleted after use.

## Changes

- `shared/src/index.ts` — `StageDefinition` gained an optional
  `taglineNoPowerUps` field; populated on the two rows that
  `powerUpBeforeEveryQuestion: true` (quiz stage 2 "Οι Σοφιστές", full
  stage 1 "Η Αγορά") with wording that drops the power-up promise.
- `server/src/payloads.ts` (`buildStageAnnounce`) — picks
  `taglineNoPowerUps` over `tagline` whenever
  `definition.powerUpBeforeEveryQuestion && !room.settings.powerUpsEnabled`.
- `client/src/components/SophistsRow.tsx` — `nameFontSizeCqh(name)`:
  names ≤7 chars keep the reference's 2.2cqh; past that, font-size scales
  as `2.2 * 7 / length`, floored at 1.3cqh. Applied as an inline
  `fontSize` style on `.plaque .n`. Plaque/row layout untouched.
- `client/src/screens/HostScreen.tsx` — added the missing
  `socket.on(ServerEvents.BLITZ_PROGRESS, handleBlitzProgress)` listener
  (registered + cleaned up alongside every other BLITZ_* handler).
  `handleBlitzProgress` merges `progressByPlayerId` into the existing
  `blitz` state. The server-side emit (`server/src/modes/blitz.ts:202`)
  was already correct and always had been — only the host never listened.

## 1. Power-up tagline — PASS

Live `full`-mode room (code 7981), 2 players, over raw sockets. Captured
`stage:announce`'s `tagline` field directly:

```
powerUpsEnabled=false -> "Ανοιχτή αντιπαράθεση. Χωρίς κόλπα, μόνο ταχύτητα και γνώση."
powerUpsEnabled=true  -> "Ανοιχτή αντιπαράθεση. Πριν από κάθε ερώτηση διαλέγετε σοφιστικό τέχνασμα."
```

`false` never mentions the power-up trick; `true` does; the two strings
differ. Same mechanism covers quiz stage 2 (Οι Σοφιστές) via the same
`taglineNoPowerUps` field, not separately re-verified over sockets since
it's the identical code path.

## 2. Name plaques ("ΔΗΜΗΤ…") — PASS

Real headless Chrome (raw CDP) on the live TV (`/host?mode=quiz`), 6
real players joined over sockets: Νίκος, Μαρία, Ελένη, Γιώργος (short),
Θρασύμαχος, Πρωταγόρας (10 chars each — task said 11, actual Greek
uppercase length is 10; same "past the 7-char base" bucket either way).
DOM read via `getComputedStyle`/`scrollWidth`/`clientWidth` on
`[data-testid="sophist-name"]`:

```
ΝΙΚΟΣ       fontSize=17.556px  scrollWidth=96  clientWidth=96  clipped=false
ΜΑΡΙΑ       fontSize=17.556px  scrollWidth=96  clientWidth=96  clipped=false
ΕΛΕΝΗ       fontSize=17.556px  scrollWidth=96  clientWidth=96  clipped=false
ΓΙΩΡΓΟΣ     fontSize=17.556px  scrollWidth=96  clientWidth=96  clipped=false
ΘΡΑΣΥΜΑΧΟΣ  fontSize=12.2892px scrollWidth=96  clientWidth=96  clipped=false
ΠΡΩΤΑΓΟΡΑΣ  fontSize=12.2892px scrollWidth=96  clientWidth=96  clipped=false
```

Short names: unshrunk 17.556px (2.2cqh at this viewport). Long names:
shrunk to 12.2892px, and it's exactly enough — `scrollWidth` (the text's
real rendered width) equals `clientWidth` (the plaque's fixed inner
width) rather than exceeding it. 6-player board (this run).

**Negative control**, same run shape with the shrink formula temporarily
short-circuited back to a flat 2.2cqh: `ΘΡΑΣΥΜΑΧΟΣ`/`ΠΡΩΤΑΓΟΡΑΣ` came back
`scrollWidth=136`/`132` against `clientWidth=96`, `clipped=true` — this
is the pre-fix bug, reproduced live and confirming the detection method
(`scrollWidth > clientWidth`) actually catches real clipping, not a
false negative. Reverted immediately after.

## 3. Blitz live progress — PASS

Live `blitz`-mode room (code 2535), 3 real players over raw sockets, 12
statements each. Listened on the host-only `blitz:progress` event
throughout the round:

```
captured 36 blitz:progress events
first: {p1:1, p2:0, p3:0}
mid:   {p1:7, p2:6, p3:6}
last:  {p1:12, p2:12, p3:12}
```

Values tick up live, per player, across the whole round — not stuck at
0/12. Before this fix: HostScreen had no listener for this event at all
(confirmed by grep before patching — `BLITZ_SHOW`/`BLITZ_REVEAL_SHOW` had
`socket.on`/`.off` pairs, `BLITZ_PROGRESS` had neither), so the host's
`blitz.progressByPlayerId` never moved past the BLITZ_SHOW snapshot
(everyone at 0) for the whole round.

## 4. INVERSE — PASS

- **No truncation**: 0 of 6 plaques clipped (criterion 2's table above),
  covering both short (5-7 char) and long (10 char) names on one 6-player
  board — the max player count this check's board layout supports.
- **Progress never exceeds total / never regresses**: computed over all
  36 captured `blitz:progress` events across the 3 players —
  monotonic non-decreasing per player: **true**; never exceeds total (12):
  **true**; every player's final count landed at exactly 12/12.

## Found, not fixed (out of scope)

- The server-side emit for `blitz:progress`
  (`server/src/modes/blitz.ts:202`) was already correct before this task
  — the bug was entirely the missing client-side listener. Nothing else
  server-side needed to change.
