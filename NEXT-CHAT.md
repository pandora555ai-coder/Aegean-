# NEXT-CHAT — Aegean handoff (rewritten 2026-09-24, after tasks 306-311)

State: numbering continues at **313**. HEAD is not authoritative here — ask the
agent at CONTEXT CHECK. Tag `v1.0-playtest` = c87443a (Task 289's run sheet).

## LIVE (tasks 274-311)
- **v2 speech policy is the DEFAULT (311)** (DEFAULT_ROOM_SETTINGS.speechPolicy
  = 'v2'). v1 is one of: `?policy=v1` on /host, the VIP's lobby toggle, or tag
  `v1.0-playtest` (c87443a).
- **Bank = 396 mp3s (306, 307, 309).** All 14 v2/skip pools (43 lines) +
  DRAW_MID_BEST/WORST + NUMERIC_CLOSE_BEST/WORST (12 lines) are voiced, and all
  201 preset vocatives are voiced. collectVoiceLineEntries = 533: 380 with a
  clip, 153 without; 16 bank files are orphans of replaced line text.
- **Named slots (308, 309):** every single-target v2 slot + SPEAR_OUT speaks the
  target's name as a prefix (subtitle "<vocative>. <line>"; clip only when
  found). Clip chain gap SPLICE_GAP_MS = 450ms after detected speech end.
- **DRAW_MID / NUMERIC_CLOSE pick their side from stage data (310).**
- **Skip vote counts connected HUMANS only (311)** — bots never vote; zero
  humans = no button. Still sequences only (GAME_INTRO / ANAVASIS_INTRO).
- **No-clip beats are held (303):** ~11 chars/s, clamped 3000-9000ms; the client
  acks at once, the server absorbs it; a VIP skip is exempt. 303 WAS deployed
  and verified (DEPLOY OK 54a1582, per Argyrios).
- **Prod state PROVEN at 313 (read-only): 308-311 are all live.** Each string
  hit in /opt/party-game, and the six touched files are byte-identical to dev
  (`cmp`): 308 `addressedTo` phases.ts:530; 309 `SPLICE_GAP_MS = 450`
  useGameAudio.ts:48 (bundle index-CbJi1tO7.js, built 2026-09-24 22:13, carries
  `.015,.01,.12,450`); 310 `drawCandidates`/`numericCandidates` speechSlots.ts:
  200/236; 311 `getConnectedHumans` state.ts:809 + `speechPolicy: 'v2'`
  shared/src/index.ts:1969 (bundle: `speechPolicy:"v2"`). The DEPLOY OK lines
  themselves were never recorded (the rule is now in CLAUDE.md).
- **OPEN DEFECT (found by 313, not fixed, client):** when a spliced prefix
  plays WHOLE (its buffer has < 120ms of trailing silence, so playFor = buffer
  length), the LINE clip is started TWICE at the same instant. Repro: 308's T
  with `VOCS='[{"name":"Χρυσάνθη","voc":"Χρυσάνθη","speechEndMs":720}]'` - 3
  clips, the last two identical, 2 of 2 runs. 60 of the 201 bank vocatives are
  on that path (141 are trimmed and fine). Cause NOT diagnosed; suspect the
  prefix source's onended firing twice (useGameAudio.ts play/playFrom).
- Coronation (274-283), spear + duel voices (296), climb, Η Λήθη naming,
  show shape (10/5 quiz, 2 draw rounds): unchanged — see CLAUDE.md.

## Budget
**~22,500 ElevenLabs characters left** = ~30,000 minus billed 4495 (306) +
1372 (307) + 1589 (309) = 7456 (22,544). The 30,000 baseline is Argyrios's
figure; no report states it. Replaces the old "172 chars, frozen for party
vocatives" note, which is obsolete (vocatives done in 307).

## Next (in this order)
1. **Fix the whole-prefix double start** (open defect above) — diagnosis first,
   then a T assertion for the whole-prefix path. Harness debt is CLEARED (313):
   300 E derives its counts from the tables/file; 308 T runs bare.
2. **Argyrios picks:** options menu (TV + phones: sounds, restart, back to
   lobby — restart/lobby VIP-only, with confirm); Η Λήθη background scene;
   sabotage for trailing players (design talk first — POWER_UP is off by
   default since 177); a new game mode.
3. **Script revision** with the σοφιστής framing (Argyrios's).

## Traps (new since 305)
- Dev hooks `AEGEAN_DEV_HIDE_CLIPS` / `FORCE_CORONATION_SET` are OFF in prod:
  both are gated on NODE_ENV !== 'production' and the unit sets
  NODE_ENV=production (311's audit).
- Grepping prod/built source may need `grep -a` (ugrep reports no match on
  NUL-bearing files).
- `isBot` is client-supplied — accepted risk, not a bug to chase.
- "Quiz stage" (full's stages 1/6) is not modes/agora.ts (stage 5, «Η Λήθη»).
  Read the phase or file, never the card.
- Same-millisecond events: order by IDENTITY (beat id), never by timestamp.
- The deploy wrapper's dirty-tree check counts UNTRACKED files too.
- Detector beat counts vary run to run — compare pairs of runs.
- Server-only work may leave the client bundle hash unchanged after deploy —
  confirm with a server-side literal.
- Older traps (voice symlink into prod, preset names, audio gate, harness
  repair one at a time) — see CLAUDE.md.

## Protocol (unchanged)
One task at a time · CONTEXT CHECK first line · 3-4 criteria, no screenshots,
Playwright only if the only way, <8 lines per criterion with values · Sonnet
for UI/content, Opus for phases/concurrency/beat sequencing · diagnosis
before fix on anything touching phases · /clear + commit/push after every
task · deploy only when Argyrios says so · never `read AEGEAN_*.md` in a
prompt — text goes inline.
