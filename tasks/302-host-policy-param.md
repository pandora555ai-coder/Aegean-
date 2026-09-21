# Task 302 — Host URL param: policy=v1|v2 for bot rooms

## 1. Param flow, end to end

- **Host page read** — `client/src/screens/HostScreen.tsx`: `?policy=v1|v2` is
  read once at mount (mirrors the existing `?mode=` `requestedMode` pattern),
  validated against `SPEECH_POLICY_OPTIONS` (shared). Invalid/absent →
  `null`, so nothing is sent.
- **create_room emit** — `handleCreateRoom()` spreads
  `...(requestedSpeechPolicy ? { speechPolicy: requestedSpeechPolicy } : {})`
  into the `CREATE_ROOM` payload, alongside the existing `botCount`/`mode`
  spreads.
- **Server** — `server/src/index.ts`'s `CREATE_ROOM` handler and
  `HostCreateRoomPayload.speechPolicy` (shared/src/index.ts) already existed
  from Task 294: `if (payload?.speechPolicy) updateRoomSettings(room, {
  speechPolicy: payload.speechPolicy })`, applied after `createRoom` and
  before `spawnBots`. `updateRoomSettings` (state.ts) validates against
  `SPEECH_POLICY_OPTIONS` itself (the "292 pattern") and silently drops an
  unknown value, leaving `DEFAULT_ROOM_SETTINGS.speechPolicy` ('v1').
- **Net new code**: only `client/src/screens/HostScreen.tsx` (17 lines) — the
  server-side plumbing needed zero changes, it was already generic enough
  to take this field from anywhere (creation payload, VIP toggle, or a raw
  dev-harness emit) through the one `updateRoomSettings` validator.

## 2. Local run, `?bot=4&mode=full&policy=v2`

- Room creation logged `room <code> created with speechPolicy=v2`,
  `mode=full`, `full show: 15 quiz question(s) over 2 stages, ...`.
- Stage 1 fired real SPEECH_SLOT beats under v2:
  `[slot] room <code> stage 1 QUIZ_MID FIRED — target=... pool=AGORA_WORST`
  and `[slot] room <code> stage 1 QUIZ_CLOSE FIRED — target=... pool=QUIZ_BEST`
  (reproduced across two independent rooms in the same run).
- Same URL with `policy=banana`: room created with **no**
  `speechPolicy=` log line at all (the client dropped the invalid param
  before ever sending it) and no error anywhere in the server log — the
  room silently keeps `DEFAULT_ROOM_SETTINGS.speechPolicy` = 'v1'.

## 3. Lobby coherence

- Created a `?mode=full&policy=v2` room with 0 bots (stays in LOBBY, no
  auto-start). A phone joined as VIP: `setting-speech-policy-v2`'s computed
  background was `rgb(142, 36, 64)` (the active-segment wine-2 token) and
  `setting-speech-policy-v1`'s was `rgb(237, 230, 214)` (inactive/marble) —
  the toggle showed v2 selected on join, no VIP action taken yet.
- VIP clicked the v1 segment: backgrounds swapped (v1 → active
  `rgb(142, 36, 64)`, v2 → inactive `rgb(237, 230, 214)`), confirming the
  setting is still changeable pre-start exactly as the standalone toggle
  always was.

## 4. Inverse checks

- `git diff --stat`: `client/src/screens/HostScreen.tsx | 17 +++++++++++++++++`
  — one file, no server/shared changes needed.
- Typecheck ×3 (shared, server, client): all clean, zero errors.
- Plain `?bot=4` (no `mode`, no `policy`): room log shows `mode=quiz` (the
  server's own default, unchanged), `entering stage 1/4`, and **no**
  `speechPolicy=` log line — byte-identical behaviour to before this change,
  since `requestedSpeechPolicy` is `null` and the new spread contributes
  nothing to the payload.

## Verification

Real dev server (localhost:5173/4001), real Playwright browser sessions —
no code-reading-only claims. Scratch harness files used for this
verification (`dev/302-tmp-check.ts`, `dev/302-tmp-lobby-check.ts`) were
deleted after use; they were throwaway, not a checked-in dev harness.
