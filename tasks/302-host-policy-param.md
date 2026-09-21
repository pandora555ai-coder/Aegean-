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

## Deploy

Committed as `e69677d` on `main`, pushed. Preconditions before deploying:
protection greps against `/usr/local/sbin/aegean-deploy` = **6**
(voice-line-review.json/voice-deleted/voice-staging guard lines), tree
clean, `main` == `origin/main` == `e69677d`.

`sudo /usr/local/sbin/aegean-deploy`, once: `DEPLOY OK:
e69677db19c2219a4eb6ed5442f6b3c67475c8fb live, party-game active, voice
bank 137 mp3s`.

| | before | after |
|---|---|---|
| bundle | `index-CMxlUNKM.js` 593626 B | `index-wpaJ5mPF.js` **572290 B** |
| sha256 | `2973eb7f…` | **`e1ac53bf…`** |
| mtime | 2026-09-20 21:44:41 | **2026-09-21 11:23:55** |
| service | ActiveEnter 21:44:41 UTC (PID 53970) | **ActiveEnter 11:23:55 UTC (PID 62072, active)** |

**Protections held exactly** (same values before and after): review JSON
`ffa7c9136c4a79ef…` unchanged, voice-deleted **155**, bank **137**
(preflight 137 → postflight 137, floor 100), staging **265**.

**Change confirmed live in the deployed bundle** (runtime string literals,
not identifiers, per the deploy-confirm trap): `t("policy")` —
`searchParams.get('policy')` reached production — and `i?{speechPolicy:i}`
— the exact conditional spread `...(requestedSpeechPolicy ? {
speechPolicy: requestedSpeechPolicy } : {})` — both present in
`index-wpaJ5mPF.js`.
