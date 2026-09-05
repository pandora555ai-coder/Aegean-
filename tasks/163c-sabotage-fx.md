# 163c — The host learns who is iced and inked; the row shows it

Sabotage is cast in POWER_UP and lands on the next QUESTION. Players
already receive their own effect. The host receives nothing, so the
sophists row cannot show it. Reference in the repo:
design/theatre-reference.html — .fx.ice, .fx.ink, .soph.iced,
.soph.inked.

Rules: same event name, different payloads to host vs players — the
new field goes on the HOST payload only; the player payload does not
change by a single byte. Effects stack per target (ice caps at 10s,
ink intensity at 3) — the host field carries the resolved state, not
the casts. No colour encodes anything: ice is a crystal shape and a
desaturated figure; ink is a blot and a darkened figure. Do not touch
scoring, the sabotage machinery itself, TheatreScene, the palette,
Krater or MarbleSlab. Do not call ElevenLabs.

1. Server: the host QUESTION payload gains
   `sabotage: { [playerId]: { iceMs?: number, inkLevel?: number } }`,
   built from the existing applied-sabotage state, typed in shared
   payloads.ts (still importing nothing local back). Report the file
   and function that builds it, and prove the PLAYER payload is
   unchanged: capture one player's QUESTION payload before and after
   on the same seed and diff them (must be empty).
2. Row FX in QUESTION: crystal overlay + the reference's figure filter
   for iced, blot overlay + darkened figure for inked; both when
   stacked; cleared on REVEAL. Observe a short full game with 5 bots
   in which bots cast: report the number of iced and inked figures
   seen and that a stacked target showed both.
3. Leak check: a player socket listening during the same game receives
   0 payloads containing a `sabotage` key. Report the count.
4. npm run typecheck clean; bottom edge > 690 at 3, 5, 6, 8 bots for
   QUESTION and POWER_UP only; re-run npm run screenshot:phases
   (BOT_COUNT=5), report PNG count, do not open them.

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 8 lines total.
