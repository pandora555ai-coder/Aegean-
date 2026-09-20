# Task 301 — Skip-vote: final check, merge to main, deploy

Branch `skip-vote` at `e43e1ac`, tree clean at start. Explicitly authorised:
merge, push, ONE deploy. Report only — no `shared/`/`server/`/`client/` file was
modified by this task.

## 1. Final equivalence — 2 skip-vote runs vs 2 main runs

`dev/294-speech-policy-check.ts`, `BOT_COUNT=4`, `mode=full`, default settings,
`SCENARIO=V1` and `SCENARIO=V2` so **both policies are covered across the four
runs**. `main` ran from a **detached git worktree** at `d025b43`
(`/home/argyrios/aegean-main-wt`) — a worktree, not a stash — with `node_modules`
wired PER ENTRY and `@game/*` pointed at the WORKTREE's own packages, which is
Task 297's trap: symlinking the root `node_modules` wholesale silently runs one
tree's `shared` against the other's `server`. All four ran in parallel on their
own `SERVER_PORT` (3972/3973/3974/3975). No seed hook exists for a socket-level
run (297's method note), so "same params" means identical mode/botCount/settings;
question and bot content is independently random per run.

| kind | main-v1 | skipvote-v1 | main-v2 | skipvote-v2 |
|---|---|---|---|---|
| GAME_INTRO | 10 | **10** | 10 | **10** |
| STAGE_INTRO | 9 | **9** | 9 | **9** |
| WINNER | 3 | **3** | 3 | **3** |
| DRAW_INTRO | 2 | **2** | 1 | **1** |
| DRAW_WINNER | 1 | **1** | 1 | **1** |
| SPEECH_SLOT | 0 | **0** | 9 | 8 |
| REVEAL *(detector)* | 14 | 15 | 0 | **0** |
| DRAW_MOMENT *(detector)* | 4 | 3 | 0 | **0** |
| NUMERIC_MOMENT *(detector)* | 3 | 0 | 0 | **0** |
| AGORA_MOMENT *(detector)* | 1 | 3 | 0 | **0** |
| GENERIC_TRANSITION | 0 | **0** | 0 | **0** |
| TOTAL | 47 | 46 | 33 | 32 |
| collectVoiceLineEntries | 517 | **521** | 517 | **521** |

**Every fixed-count kind is equal on both policies.** The load-bearing one is
`GAME_INTRO` = 10 in all four: with nobody voting, all ten narration lines still
play. Movement is confined to the four detector kinds, which is 297's own
allowed variance. 517 → 521 is Task 300's four `SKIP_INTERRUPTED_LINES`.

Two deltas were investigated rather than waved through:

- **`SPEECH_SLOT` 9 vs 8 (v2).** All 9 slots were ATTEMPTED in both runs;
  skip-vote's `BLITZ_CLOSE` logged `SKIPPED — no untargeted standout with a line
  (already targeted this stage: 1)`, the slot engine's designed silence-on-tie
  (297 saw the identical string in its 5-player room). `GENERIC_TRANSITION` = 0
  on both sides: silence, not filler. Outcome depends on who led a stage — content.
- **`NUMERIC_MOMENT` 3 vs 0 (v1)**, one below the lowest value 297 recorded, and
  skip-vote logged NO `[socrates] ... moment detected=` line at all across its 3
  numeric questions. Not a detector that never ran: `logDrawNumericDetection` is
  called INSIDE `for (const moment of candidates)` (`socrates.ts:2120-2121`), so an
  empty `candidates` array logs nothing. CLAUDE.md's "logs unconditionally" means
  unconditional on the LINE POOL (line 2127), not on detection. Decisively,
  `git diff main..skip-vote -- server/src/socrates.ts` is ONLY the
  `SKIP_INTERRUPTED_LINES` const plus its `LINE_TAGS` entries, and
  `modes/numeric.ts`, `numeric.ts`, `modes/draw.ts` have an EMPTY diffstat — both
  trees run byte-identical numeric-detection code. main-v1's detections were all
  `WILDLY_OFF`/`NOBODY_CLOSE`; skip-vote's bots simply guessed less extremely.

The one wire-level difference, stated rather than hidden (Task 300 documented it):
`skip vote OPEN` = **2** per skip-vote run (both sequences), **0** on main;
`PASSED` = 0 and `socrates:stop` = 0 everywhere, because a bot cannot emit
`player:skip_vote` and the threshold is a fraction of the connected roster.

**Verdict: GO — no unexplained beat-kind, count or ordering difference.**

## 2. Merge

`3462808` on `main` — `--no-ff`, message
"Merge skip-vote: majority skip vote on Socrates sequences + SKIP_INTERRUPTED
(tasks 299-300)", merged from `skip-vote` `e43e1ac` (2 commits, 16 files,
+1486/−11). `merge-base(main, skip-vote)` was `d025b43` = main's own head, so the
merge was conflict-free by construction. Pushed: `d025b43..3462808`.
Tag `v1.0-playtest` untouched, still commit `c87443a`.

## 3. Deploy

`sudo /usr/local/sbin/aegean-deploy`, ONCE, gated on both preconditions printed
first: protection greps = **6**, `main` == `origin/main` == `3462808`.

| | before | after |
|---|---|---|
| bundle | `index-bNi8FZS4.js` 591336 B | `index-CMxlUNKM.js` **593626 B** |
| sha256 | `369cdc58…` | **`2973eb7f…`** |
| mtime | 20:06:18 | **21:44:41** |
| service ActiveEnter | 20:06:18 (PID 47443) | **21:44:41 UTC (PID 53970, running)** |

**Protections held exactly**: review JSON `ffa7c913…` unchanged, voice-deleted
**155**, bank **137** (preflight 137 → postflight 137, floor 100), staging **265**.

**The `SKIP_INTERRUPTED` string is in the deployed SERVER SOURCE, not the client
bundle** — 5 hits in `/opt/party-game/server/src/socrates.ts` with all four Greek
lines byte-present. The bundle's 0 is correct by design: the interruption beat
carries the ORIGINAL kind (Task 300's "zero new routing"), so no client literal
exists. The bundle does carry `player:skip_vote`, `skip:progress`, `socrates:stop`
and `skip-vote-button`, 1 each — and all four were **0** in the pre-deploy bundle.
Staleness ruled out directly: `socrates.ts` (`52faa13f…`), `phases.ts`
(`6c7219fa…`) and `index.ts` (`f46b317c…`) are byte-identical dev vs prod.

## 4. Live smoke — 3 phone sims against the LIVE server

Socket-only clients of the running service on `127.0.0.1:3001` (nothing was
started on 3001), room 5457, `mode=full`, three PRESET names Άρης/Νίκη/Χαρά.
Threshold for 3 connected = 2.

```
beat 1 @ 3542ms GAME_INTRO  "Καλώς ήρθατε στην Αθήνα."
beat 2 @ 4544ms GAME_INTRO  "Το θέατρο γέμισε από νωρίς..."
beat 3 @11530ms GAME_INTRO  "Απόψε ήρθαν για το δεύτερο."   <-- STOPPED MID-LINE
vote 1 (Άρης) @11541ms -> 1/2 of 3, open=true, stops=0   (below threshold: nothing)
vote 2 (Νίκη) @12142ms -> threshold met
socrates:stop(beat 3) @12145ms   (3ms after vote 2)
beat 4 @12145ms GAME_INTRO  "Μιλούσα. Ψηφίσατε. Δημοκρατία — το χειρότερο
                             πολίτευμα, εκτός από όσα δοκιμάσαμε."  <-- INTERRUPTION
beat 5 @13148ms STAGE_INTRO "Πρώτος γύρος. Ακόμα κανείς δεν έχει ντροπιαστεί."
QUESTION (Q1) @14149ms
```

3 of 10 lines played, **7 discarded**; the stopped beat was **never acked**
(acked: 1,2,4,5); the interruption subtitle is `SKIP_INTERRUPTED_LINES[1]`
verbatim and carries kind `GAME_INTRO` — the ORIGINAL kind, so the existing
switch resumed the flow; no further narration line followed.

**Two live runs were made, and the first one's number is not quoted above.** A
pre-deploy dry run (room 2910) confirmed the harness's own plumbing against the
OLD build and timed out waiting for `socrates:stop` — the feature provably absent
before the deploy. The first post-deploy run (room 3730) passed the vote
correctly but the HARNESS mislabelled the interruption: it picked the beat by
`atMs > stop.atMs`, and the interruption lands in the SAME millisecond as the
stop, so the NEXT stage's intro was reported as the interruption subtitle. Fixed
by keying on identity (first beat with `beatId > stop.beatId`) and printing every
beat; room 5457 above is that corrected run. `sudo journalctl` needs a password
(only `aegean-deploy` is passwordless), so the first run's beat could not be
recovered from the server journal instead.

Both throwaway harnesses (`dev/301-live-smoke.ts`, `dev/301-live-smoke2.ts`) lived
in the detached worktree, never in `/home/argyrios/Aegean`, and are deleted along
with the worktree — the deploy's own dirty-tree check is `git status --porcelain`,
which counts untracked files and would have aborted on them.
