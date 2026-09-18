# Task 271 — line audition & deletion tool

Extends `/dev/voice-audition` (Task 269) from a read-only listing into the
tool for listening through the whole bank and culling lines that predate
decisions since reversed (Η Δίκη's old stage-3 wording, μαθητής).

## What was built

- **`server/src/voiceDeletions.ts`** (new): the only module in this
  codebase, besides `dev/generate-voice-lines.ts`, that ever writes into a
  voice directory. `deleteVoiceLine`/`restoreVoiceLine`/`markVoiceLine`,
  persisted to `server/src/data/voice-line-review.json` (git-tracked, never
  localStorage). Deleting moves (never unlinks) the mp3 out of bank and/or
  staging into `client/public/voice-deleted/` and adds the line's TEMPLATE
  to an in-memory `Set` consulted synchronously by every selector.
  Restoring copies it back and clears that Set entry. A bank move that
  fails with `EACCES` is recorded as `bankMoveStatus: 'pending-no-access'`
  rather than forced or silently dropped — see the permissions finding
  below.
- **`server/src/socrates.ts`**: `isLineDeleted(template)` wired into the
  THREE functions every `pick*` export ultimately routes through —
  `pickLine`, `pickSequence`, `pickCoronationLine` (verified by grep: every
  `pickLine(state, ...)`/`pickSequence(state, ...)` call site in the file
  funnels through these three). Same "kept in the pool, filtered at pick
  time" idiom the file already uses for mode-based exclusion
  (`GAME_INTRO_LINES_EXCLUDED_IN_FULL`) — a deleted line degrades exactly
  like an exhausted pool already does: `pickLine`/`pickCoronationLine`
  return `null` (existing fallback paths, e.g. coronation falls back to
  `WINNER_LINES`), `pickSequence` just skips it, one line shorter.
- **`server/src/voiceAudition.ts`**: each entry now also carries `status`
  ('active'/'deleted'/'kept'), `inDeleted`/`deletedDurationMs`, and the two
  move-status fields.
- **`shared/src/index.ts`**: three new request events
  (`DEV_DELETE_VOICE_LINE`/`DEV_RESTORE_VOICE_LINE`/`DEV_MARK_VOICE_LINE`)
  and one result event, plus the extended `DevVoiceAuditionEntry`.
- **`DevVoiceAuditionScreen.tsx`**: free-text search (over the exact spoken
  text), pool filter, tag filter, an Active/Deleted view toggle, a
  judged/remaining progress line, a per-line "✓ Keep (reviewed)" toggle, a
  Delete button that becomes a two-step confirm ("⚠ Last line in «X» —
  deleting makes this moment SILENT") when it would empty a pool, a Restore
  button in the Deleted view, and an at-risk-pools banner.

**Note for the record (not built)**: a future mass rating pass extends
`status`/the row shape, same as Task 269 already scoped it.

## Filesystem permissions - the bank is NOT writable by this process

Checked directly (`fs.writeFileSync` probe against
`/opt/party-game/client/public/voice`, plus `ls -ld`/`id`): the bank is
`drwxr-xr-x`, owned by `partygame:partygame`; this session's user
(`argyrios`) is not in that group → **`EACCES`, confirmed empirically, not
assumed**. A bank-file delete/restore run from a LOCAL dev server therefore
lands as `pending-no-access`, honestly reported, never forced (no `sudo`
was used or considered for this — CLAUDE.md's deploy-wrapper-only rule).
**Nothing further is needed from you for this to work**, though: the
DEPLOYED production server process runs AS `partygame` (confirmed via
`ps aux` — it owns `/opt/party-game` outright), so the exact same delete/
restore code, run from the live site's own `/dev/voice-audition` (Caddy's
basic-auth `/dev` prefix, same as every other page there), moves bank
files for real. Do your bulk listening pass there, not against a local
dev server, if bank deletions matter for a given line.

## Acceptance criteria

**1 — true distinct count, no playable file.** `Σύνολο (distinct): 476`,
and `Distinct hashes: 476` (a second, independent check: a `Set` of every
row's `hash` has the same size as the row count — no duplicate hash exists,
so "one row per line" is verified, not just designed that way).
**201 lines have no playable file anywhere** (`No file: 201` — exactly the
201 vocatives, matching PRESET_NAMES.length, all still unrecorded).

**2 — search «Δίκη» and «μαθητ».**
- **«Δίκη»: 1 match** — `d4d0d1a0466fcd7d`, pool `WINNER`: *"Οι υπόλοιποι,
  μην απελπίζεστε. Και εγώ έχασα μια δίκη κάποτε."* This is NOT the old
  stage-3 finale wording — those 5 lines (`Η Δίκη. Εδώ δεν υπερασπίζεστε...`
  etc.) were already removed from the source pools entirely at Task 258
  (confirmed by reading `socrates.ts`'s own comment at that spot: *"went to
  TRIAL_INTRO_LINES in Task 139 and were deleted with that finale in Task
  258"*) — they can't appear here because they no longer exist in any pool
  this tool walks. (Any orphaned MP3s for those old hashes may still sit in
  the bank per CLAUDE.md's own documented orphan behavior — invisible to
  this LINE-based tool by design, and harmless: nothing selects them.) This
  WINNER line uses «δίκη» as an ordinary noun ("a lawsuit"), unrelated to
  the finale — yours to judge, not pre-filtered out.
- **«μαθητ»: 6 matches** — showing 5: `d44a8fa67a2ce775` (EASY_MISS),
  `7494833a2304dffa` (FINAL_QUESTION), `0b3e026f0ee0fbe8` (GENERIC_INTRO),
  `2a171f7139d3ce02` (WINNER: *"Βρήκα τον μαθητή μου. Η Αθήνα το είδε."*),
  `09cea13c8b72d5bb` (WINNER: *"Ο μαθητής βρέθηκε..."*) — the 6th is a
  second EASY_MISS/WINNER-adjacent entry not printed here. All 6 are live,
  currently-selectable lines — real candidates for your pass.

**3 — delete one line, reload, restore, name it.** Demo line:
**`1ef3e41f99ea15c3`, CORONATION_LINE_TWO** (*"Ήρθατε εδώ λέγοντας πως
είστε σοφιστές..."*, staging-only, chosen specifically so the demo doesn't
hit the bank-permission limitation above). Delete →
`bank:not-present staging:moved`; reload → gone from the Active view,
present in the Deleted view; `voice-line-review.json` gained exactly one
record (`status: "deleted"`); `client/public/voice-deleted/1ef3e41f99ea15c3.mp3`
exists; `client/public/voice-staging/` no longer has it. Restore → banner
`fully restored`; reload → back in the Active view;
`voice-line-review.json` is `[]` again; the file is back in
`voice-staging/`, gone from `voice-deleted/`.

**4 — inverse.** Zero API calls (no `--generate`, no ElevenLabs code path
touched anywhere in this task). No pool left with zero active lines — the
"at-risk" banner showed nothing before the demo, and the one delete+restore
cycle targeted `CORONATION` (4 lines, 3 remaining mid-delete), never a
1-line pool. **Staging count: 258 before, 258 after** (the demo's own
move-then-restore is a round trip; verified by directory listing, not
trusted from the UI). `/opt/party-game` mp3 count: 283 before, 283 after —
confirmed unaffected since the demo never touched a bank file.
