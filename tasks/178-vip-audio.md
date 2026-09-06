# Task 178 — VIP audio controls (crowd / voice volume on the host)

## Context
Audio is HOST-ONLY: one AudioContext, reused, shared by the Socrates
voice and the crowd mixer (three GainNodes, equal-power crossfade,
CROWD_BED_GAIN .6 approved by ear). The VIP gets two sliders on the
phone that adjust the HOST's playback levels live.

## Rules (inline)
- One AudioContext on /host — count must stay 1.
- The crowd slider is a MASTER gain applied above the existing
  three-loop crossfade (multiply, or one master GainNode in the
  chain). Never touch the three crossfade gains individually — the
  equal-power relationship must be preserved.
- Slider at 100% = today's levels exactly (crowd effective bed .6,
  voice at its current gain). Default 100/100.
- Server-authoritative-ish: the setting lives on the room; server
  relays VIP changes to the host and includes current values in the
  host state sync (host refresh keeps the levels). Server REJECTS
  the event from a non-VIP socket.
- Phone UI: sliders like the numeric slider (accent-color --wine-2),
  palette tokens, 44px targets, no motion not driven by the finger.
  Put them where the VIP controls live; visible to the VIP ONLY.
- The existing host mute is unchanged and sits on top.

## Acceptance criteria — report each one separately, with numbers
1. On /host with a game running: VIP moves the crowd slider to 0%,
   50%, 100% — report the measured master gain value at each step
   and that the three crossfade gains kept their equal-power
   relationship (report the summed-power check at 50%). Same for
   the voice slider (report effective voice gain at the 3 steps).
   AudioContext count on /host: report it (must be 1).
2. Authorization: emit the volume event from a NON-VIP player socket
   — server rejects, host gain unchanged (report the rejection
   evidence and the gain before/after).
3. Persistence: set crowd 40 / voice 70, reload /host mid-game —
   report the values the host state sync delivered and the applied
   gains after reload (must match 40/70).
4. Defaults: a fresh room with untouched sliders plays at today's
   exact levels — report the effective crowd bed gain (.6) and
   voice gain vs their pre-task values. Commit as task 178 and push.

After the criteria: re-run `npm run screenshot:phases`. Do NOT open
the PNGs.
