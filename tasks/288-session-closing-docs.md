# Task 288 — Session-closing docs (docs only)

Docs-only session close: replace NEXT-CHAT.md wholesale, correct a stale
CLAUDE.md claim, append a deploy-section note. Zero code touched.

## Acceptance criteria

1. **NEXT-CHAT.md replaced byte-for-byte with the given block.**
   74 lines. sha256: `26cbc68505b4bd4fdda29dfb3e140ba663cfcb83d0b1c5e16b44798ded6b7205`

2. **CLAUDE.md WINNER-subtitle correction** (in the Task 239 SOCRATES-subtitles
   paragraph, "## Phases"):
   - Old: "The climb's own WINNER beat (`isClimbSocratesBeat`) still renders
     no subtitle, deliberately left alone to avoid touching Task 237's
     staging invariants for a beat no acceptance criterion named
     specifically."
   - New: "The climb's own WINNER beat (`isClimbSocratesBeat`) renders the
     subtitle too, since Task 247."

3. **CLAUDE.md deploy-section addition** (end of "WHERE YOU WORK", after the
   /opt/party-game off-limits bullet), added verbatim:
   > VOICE_MIN=100 since 2026-09-20 (was 283); deploy script also protects
   > voice-line-review.json, voice-deleted, voice-staging (6 rsync guard
   > lines). Voice file moves go through sudo -n aegean-ops (stage-clips |
   > promote-to-bank <hashes>), both requiring --confirm ARGYRIOS-SAID-GO;
   > promote refuses existing targets.

4. **Inverse — diff scope.** `git diff --stat` before this report: only
   `CLAUDE.md` (6 insertions, 3 deletions); `NEXT-CHAT.md` shows untracked
   (new file, wasn't tracked before). No other file touched.

No deploy — docs only, per task instructions.
