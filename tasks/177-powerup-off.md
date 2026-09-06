# Task 177 — POWER_UP off by default (VIP setting, machinery intact)

## Context
The POWER_UP/sabotage phase tested poorly. Per MASTER-PLAN it goes
OFF BY DEFAULT — a VIP setting can re-enable it later. DO NOT delete
any sabotage machinery (ice/ink server gates, the host `sabotage`
payload field from 163c, the FX). Only the PHASE is skipped.

## Rules (inline)
- One function decides what follows REVEAL — the skip lives THERE,
  not in scattered ifs.
- `crowdIntensityFor` has one explicit case per phase and a throwing
  default: the POWER_UP case STAYS (the phase still exists in the
  type). 17 GamePhase values remain 17.
- Server-authoritative: the setting lives on the room server-side;
  the VIP toggle (if built now) is just a message. Default off means
  a room created with no input NEVER enters POWER_UP.

## Do
- Add a room setting `powerUpsEnabled`, default false. The stage
  flow skips POWER_UP entirely when false: quiz stages go
  STAGE_ANNOUNCE → QUESTION directly.
- Wire a minimal VIP toggle in the lobby (existing VIP controls
  area, palette tokens, 44px) OR — if no VIP settings area exists
  yet — leave the setting server-side only with a TODO, and report
  which you did. Do not build a settings screen for one toggle.
- With powerUpsEnabled true, the old flow must be intact (this is
  the regression guard for the machinery).

## Acceptance criteria — report each one separately, with numbers
1. Default room, full bot game (?bot=3): report the complete phase
   sequence — ZERO POWER_UP occurrences, quiz stages enter QUESTION
   directly from STAGE_ANNOUNCE, game reaches GAME_OVER.
2. powerUpsEnabled=true (however set): one quiz stage observed with
   POWER_UP present, a sabotage cast lands on the next QUESTION
   (report the host payload's sabotage field content — and confirm
   the player payload is unchanged, leak count 0).
3. Timing sanity: report total wall-clock of the default bot game vs
   task 176's ~8.8 min — it should be SHORTER (fewer phases). Report
   both numbers. Commit as task 177 and push.

After the criteria: re-run `npm run screenshot:phases`. Do NOT open
the PNGs.
