# 152 — CLAUDE.md milestone pass (voice switch + crowd)

CLAUDE.md is current to 141. Sessions 142-151 changed things it now
describes wrongly. Same comb as 117/124/141: every claim verified
against the repo, deletions as well as additions.

## What changed and must be reflected

- The ElevenLabs voice was SWITCHED. New default NOpBlnGInO9m6vDvFkFC,
  old gFpOFEriJA3T1VbGi2Be, restorable via ELEVENLABS_VOICE_ID.
- lineHash(text, tag) does NOT include the voice ID — a voice change
  writes over the SAME filenames. This is the central trap of the whole
  voice system and belongs in the traps section.
- client/public/voice is a symlink into the rsync target, so generation
  writes straight into production. Full regeneration goes to a staging
  dir, then dev/voice/swap-staging.sh (refuses unless the count matches).
- ALT_VOICE_ID / ALT_OUTPUT_DIR / ONLY_HASHES env overrides exist in
  dev/generate-voice-lines.ts. Defaults unchanged without them.
- LINE_TAGS is 254. Six orphaned mp3s sit in the voice dir from replaced
  text; the generator's "longest clip" warning scans the DIRECTORY, not
  active hashes, so it warns about orphans forever.
- Line length: measured ~100ms of audio per character. Lines must stay
  under roughly 95 characters to land under SOCRATES_MAX_DURATION_MS.
  The cap is a BACKSTOP, not a limit — source.onended drives phase
  length, so a long clip really does hold the phase that long. Never
  raise the cap to make a clip fit.
- Four dev routes added: /dev/voice, /dev/voice-ab, /dev/voice-matrix,
  /dev/voice-eq.
- Pitch shift (144) and EQ (145) were both tried on the voice and
  REJECTED. Do not propose them again.
- FULL_DRAW_ROUNDS_BY_LENGTH: short 1, medium 1, long 3. Standalone draw
  unchanged.
- dealAssignment reshuffles the full pool each cycle with NO memory of
  prior cycles — words can repeat across draw rounds. Known, unfixed;
  the fix is a usedWords Set carried in DrawState.
- crowd:mood is host-only and now covers all four modes. draw.ts and
  numeric.ts had ZERO wiring before 151. A short full game emits 48
  events. LOBBY and TRIAL_QUESTION produce none, the latter because mood
  is set before phase:changed — the same ordering pattern already
  documented for the score counter.
- The audio cues are STILL LIVE. Crowd playback (task 36) is not built.

## Acceptance criteria — report on each SEPARATELY, under 8 lines total

1. Report every claim in CLAUDE.md that is now FALSE, quoting each one,
   before changing anything.
2. Apply the updates. Report line count before and after, and name at
   least two things DELETED, not just added.
3. Pick three claims you did not write in this task and verify each
   against the repo. Report each with the file and line that proves it.

## Constraints
- Sonnet. No screenshots, no Playwright.
- Do NOT call ElevenLabs, do NOT run any generation.
- CLAUDE.md is the agent's brief: rules, file map, traps. Not history.
