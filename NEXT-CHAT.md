# NEXT-CHAT — Aegean handoff (rewritten 2026-09-24, after tasks 289-305)

State: numbering continues at **306**. HEAD is not authoritative here — ask the
agent at CONTEXT CHECK. Tag `v1.0-playtest` = c87443a (Task 289's run sheet).

## LIVE (tasks 274-303; 303's deploy is unverified — check before assuming)
- Coronation (274-283): two agender sets, uniform pick; B3 splices the
  winner's name as a suffix; generalised prefix/suffix splice (277). Bank =
  137 mp3s, audited (review JSON is the deletion authority, rsync-protected).
- Speech policy v2 (291-298): slot engine (speechSlots.ts) + per-stage
  ledger (293) — fixed per-stage slots instead of per-reveal speech; mid and
  close aim at opposite ends, never the same target twice per stage, a tie
  SKIPS (silence). Merged with DEFAULT v1; the VIP flips v1/v2 in the lobby.
- 14 pools / 43 lines (SPEECH_V2_LINES 13/39 + SKIP_INTERRUPTED 4) are
  registered with LINE_TAGS but have NO mp3s — the October pass records them
  (content/speech-policy-lines.md).
- No-clip hold (303): a beat with no mp3 is held for its estimated speaking
  time — 11 chars/s, clamped 3000-9000ms (SOCRATES_HOLD_*, socratesHoldMs);
  the client still acks at once, the server absorbs it. A VIP skip is exempt.
- Skip vote (299-301): any phone votes a narration (GAME_INTRO /
  ANAVASIS_INTRO sequences only) quiet; > half of connected passes; Socrates
  answers with one unskippable SKIP_INTERRUPTED line.
- `?policy=v1|v2` on /host (302) — the only way to put a bot room on v2.
- Show shape: quiz stage 1 = 10 questions on long (295), Η Συκοφαντία 5,
  Ζωγραφική 2 rounds at every length (292).
- Spear + duel voices (296): SPEAR_OUT beat once per game on the first
  spear strike; DUEL_LINES.DUEL_LOCKED written (3 lines) — both play under v1
  AND v2. QUIZ_BEST is the 13th v2 pool.

## Budget
~172 characters left, FROZEN for the party-name vocatives; lost at the
**28 Sep reset** if unused (party names still unknown). The October batch —
all v2 slot lines + skip-interrupted — is written in
content/speech-policy-lines.md, waiting on the post-reset budget.

## Next (order is Argyrios's call)
1. **Argyrios's v2 re-test** on a real TV (`?policy=v2`, or the lobby
   toggle) — the 303 hold is what makes slot lines visible at all.
2. Options menu.
3. Η Λήθη background (the agora stage's scene).
4. Sabotage design (POWER_UP is off by default since 177; rethink it).
5. A new mode.
6. Flip the default to v2 — ONLY once the October audio lands.
7. Script revision with the σοφιστής framing.

## Traps (new since 288)
- "Quiz stage" (full's stages 1/6, plain QUESTION/REVEAL) is not
  modes/agora.ts (stage 5, «Η Λήθη»). Read the phase or file, never the card.
- Same-millisecond events: order by IDENTITY (beat id, event sequence), never
  by timestamp — two emits can share a millisecond.
- The deploy wrapper's dirty-tree check counts UNTRACKED files too — a stray
  scratch harness in dev/ aborts a deploy.
- Detector beat counts (REVEAL/DRAW_MOMENT/NUMERIC_MOMENT) vary run to run —
  compare pairs of runs, never one run against a fixed number.
- Server-only work may leave the client bundle hash unchanged after deploy —
  that is not proof the deploy failed; confirm with a server-side literal.
- Older traps (voice symlink into prod, preset names, audio gate, harness
  repair one at a time) — see CLAUDE.md.

## Protocol (unchanged)
One task at a time · CONTEXT CHECK first line · 3-4 criteria, no screenshots,
Playwright only if the only way, <8 lines per criterion with values · Sonnet
for UI/content, Opus for phases/concurrency/beat sequencing · diagnosis
before fix on anything touching phases · /clear + commit/push after every
task · deploy only when Argyrios says so · never `read AEGEAN_*.md` in a
prompt — text goes inline.
