# NEXT-CHAT — Aegean handoff (rewritten 2026-09-20, after tasks 272-288)

State: numbering continues at **289**. HEAD is not authoritative here — ask the
agent at CONTEXT CHECK.

## What is LIVE in prod (deployed 2026-09-20, tasks 274-283; bank promote 286)
- New coronation: two agender sets (B "The name" / C "The silence"), uniform
  pick per game, gender branch and WINNER fallback removed. All 6 clips + the
  Νίκος vocative are in the bank (137 mp3s). B3 takes the winner's name as a
  suffix splice; subtitle shows the name even with no vocative clip.
- Generalised splice: any Socrates beat can carry prefix and/or suffix; one ack
  bound to the last clip; backstop arms on summed durations (277).
- The 155-clip audit is authoritative in prod: review JSON (274 records,
  155 deleted / 119 kept) is git-tracked, byte-identical to prod, and rsync-
  protected. voice-deleted holds 155 files; off-site tarball in backup/.
- Deploy: sudo aegean-deploy, VOICE_MIN lowered 283→100 (2026-09-20).
  aegean-ops installed (NOPASSWD): stage-clips / promote-to-bank — the whole
  generate→listen→promote cycle now runs without SSH.
- Voice generator: budget guard counts BILLED chars incl. retries (287), on
  top of dry-run default, write probe, --confirm-spend.

## Standing rule (2026-09-20)
Everything new must land where Argyrios can test it: clips → prod
voice-staging (visible in /dev/voice-audition) + audition-drop/<date>/ commit
for phone listening; features → deployed. A task isn't finished while only the
agent can see its output.

## Budget
~172 characters left, FROZEN for the party-name vocatives; expires at the
28 Sep reset if unused. Party names still unknown. After reset, the recording
queue from AEGEAN-OPEN-ITEMS applies — but see "intro pipe" below first.

## Immediate next (order)
1. **Second human playtest, 4-5 people** — now unblocked: coronation has
   voice. Only humans judge the cold open, climb readability, Socrates
   verbosity, Ζωγραφική judging.
2. **Content imports** (Εκτίμηση 42→178, Ζωγραφική 100→200, Παλαίστρα
   218→418, group rhythm + duel group lines). ⚠ None of the seven content
   files are in the repo — texts must be pasted inline into import tasks.
   Open questions that return to the design chat, not the agent: duplicate
   word-sets, final Σ/Λ balance, pair protection, EVERYONE_WRONG key
   existence. ANSWERED already: no SPEAR hook exists (276) — the 3
   SPEAR_WARNING lines stay out; splice is generalised (277).
3. **Intro pipe decision (Argyrios):** pickQuestionIntro's output is consumed
   by nothing since Task 219 — HALFWAY_POINT / FINAL_QUESTION / GENERIC_INTRO /
   CATEGORY_CALLOUT lines only burn usedLines. Rewire or delete BEFORE
   recording or importing anything for intro pools.
4. **Prod staging cleanup:** an over-broad stage-clips run mirrored dev
   staging into prod (265 files), including copies of deleted lines and the
   dead Set A opener + line 2. Harmless (picker filters by review JSON) but
   dirty. aegean-ops has no delete by design — clean via a dedicated task
   with Argyrios's sudo, someday.
5. **Empty pools that matter** (after 258+audit): HOT_STREAK_3 0/8,
   CLOSE_SCORES 0/6 — both refill from named-lines/rhythm imports. No crash
   anywhere (275): empty pools skip silently.

## Traps (new since the old handoff)
- The review JSON is the deletion authority; staging/bank file presence is
  NOT. Never "restore" the bank to old counts — 130→137 is the audited state.
- promote-to-bank refuses existing targets; stage-clips copies EVERYTHING
  valid from dev staging (265 files) — for a few clips, prefer targeted
  promote by hash, or accept the mirror.
- Bank proof = count + mtime of the TARGET dir, not the symlink.
- swap-staging.sh remains forbidden — staging carries dead Set A audio.
- Old traps (Αγορά/Λήθη, nine trial-named climb symbols, harness-killing
  content changes) still apply — see AEGEAN-OPEN-ITEMS.md / CLAUDE.md.

## Protocol (unchanged)
One task at a time · CONTEXT CHECK first line · 3-4 criteria, no screenshots,
Playwright only if the only way, <8 lines per criterion with values · Sonnet
for UI/content, Opus for phases/concurrency/beat sequencing · diagnosis
before fix on anything touching phases · /clear + commit/push after every
task · deploy only when Argyrios says so · never `read AEGEAN_*.md` in a
prompt — text goes inline.
