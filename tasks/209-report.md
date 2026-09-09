# Task 209 — Η Μνήμη της Αγοράς: phone views

Verified with a dedicated Playwright harness, `npx tsx dev/agora-phone-check.ts`
(the agora-scene-check.ts/screenshot-phases.ts pattern: throwaway server+client
dev pair on ports 3904/5905, real gameplay over real sockets, 1 genuine
Playwright /play page + 2 bot sockets). No server code, `shared/src/agora.ts`,
or TV components were touched — only `client/src/screens/ControllerScreen.tsx`.

## 1. FLOW

One real phone client (joins first, so it's VIP — a bot is never VIP) +
`?bot=2`, one standalone agora round:

```
[join] -> [lobby/settings] -> [vip selected agora, pressed start]
-> [AGORA_EXPOSE hold screen shown, text: "Κοίτα την τηλεόραση"]
-> round 1/3 "Ερώτηση 1/3" (existence, 0 swatches) -> tap -> lock-in confirmed -> personal result
-> round 2/3 "Ερώτηση 2/3" (colour, 4 swatches)    -> tap -> lock-in confirmed -> personal result
-> round 3/3 "Ερώτηση 3/3" (count, 0 swatches)     -> tap -> lock-in confirmed -> personal result
-> [GAME_OVER shown on phone]
```

Lock-in confirmations: each tap was independently verified over the real
websocket (Playwright frame sniffing on the phone's own connection, not DOM
inference) — `player:agora_submit` sent and `answer:accepted` received,
1-of-1, 2-of-2, 3-of-3 across the three rounds. All 3 rounds registered
server-side (`agora answer from <playerId> - N/3 answered` in the server log
for all three questions).

## 2. SWATCHES

The colour question was round 2/3 (buildAgoraQuestions' fixed ladder: Q1
existence, Q2 colour, Q3 count — confirmed by swatch count, not assumed).
Each option's swatch computed `background-color` was read via
`getComputedStyle`, and the expected hex was independently derived by
matching the option's own text against the shared `AGORA_COLOURS` table
(same table the TV uses, never a literal hex written into the phone) and
converting hex → rgb:

| option (payload text) | expected hex | computed background |
|---|---|---|
| λαδί | #9AA860 → rgb(154, 168, 96) | rgb(154, 168, 96) — PASS |
| λευκή | #EDE6D6 → rgb(237, 230, 214) | rgb(237, 230, 214) — PASS |
| πορφυρή | #5A3350 → rgb(90, 51, 80) | rgb(90, 51, 80) — PASS |
| κρασάτη | #8E2440 → rgb(142, 36, 64) | rgb(142, 36, 64) — PASS |

4/4 pairs match. The existence question (round 1) and count question
(round 3) each rendered 0 `[data-testid="agora-swatch"]` nodes.

## 3. NO SCENE (inverse)

Static check: `grep -anE "\bstalls\b|\banimals\b|\babsentStalls\b|\.spec\b|AgoraRenderSpec|AgoraScene\b" client/src/screens/ControllerScreen.tsx`
→ 0 matches (grep exit 1). The phone code never imports or reads any
`AgoraExposeShowPayload.spec`/`AgoraRenderSpec` field.

Runtime check: during each of the 3 AGORA_QUESTION phases, queried the
phone page's own DOM for every TV-only scene testid
(`agora-market`, `agora-stall`, `agora-good`, `agora-animal`,
`agora-highlight`) — 0 hits each time (0/0/0 across the three questions).

The swatch chip (criterion 2) is not scene data — it comes from
`AGORA_COLOURS`, a static Task-206 palette table (id/name/hex), never from
`AgoraRenderSpec`/`spec`/`stalls`/`animals`.

## 4. REGRESSION

A fresh room, default mode (`quiz`, unchanged), same build: the plain
QUESTION phase rendered `answer-buttons=4` (expect 4) and
`agora-swatch nodes=0` (expect 0) — the identical `answerGrid`/
`answerButton`/`data-testid="answer-button"` markup and `handleAnswerTap`
path used before this task, untouched by the agora additions. Tapping an
option produced `reveal-verdict` (the plain REVEAL card), same
component/testid as before.

`npm run typecheck` — clean across `@game/shared`, `@game/server`,
`@game/client` (no errors).

## Notes / deliberate deviations from the task text

- **No per-phase countdown on the AGORA_EXPOSE hold screen.** The phone
  never renders a countdown of its own anywhere in this file — every
  "look at the TV" screen (draw/duel spectators, the plain quiz's
  "waiting for others" line, etc.) is static text; only two *mechanic*
  countdowns exist (sabotage ice/ink, the drawer's own submission timer),
  neither a generic template. Inventing a new one here would be new
  scope inconsistent with the rest of the phone codebase, so
  AGORA_EXPOSE stays a plain hold screen like everything else.
- The AGORA_EXPOSE payload actually **does** carry the full scene `spec`
  (symmetric to the TV, by the original Task 207 design — "everyone is
  meant to be looking at the TV anyway"), not "no scene data" as literally
  stated in the task brief. The phone still never reads or renders any of
  it, satisfying the intent (criterion 3).

## Files changed

- `client/src/screens/ControllerScreen.tsx` — agora state/handlers/render
  views for AGORA_EXPOSE / AGORA_QUESTION / AGORA_REVEAL, replacing the
  Task 207 placeholder; `LOBBY`/`GAME_OVER`/`state:sync` clearing updated
  to include the new state, following the existing trial/climb/duel
  pattern exactly.
- `dev/agora-phone-check.ts` (new) — the verification harness above.
