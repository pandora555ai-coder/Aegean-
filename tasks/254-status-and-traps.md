# Task 254 — status report + two CLAUDE.md traps

Context check: the task read was **254**, as expected.

DOCS ONLY. Exactly two files changed: `CLAUDE.md` and this report. Zero
`.ts` / `.tsx` / `.css` files, no deploy.

## 1. Status

| value | reading |
|---|---|
| HEAD | `ed608e2fa9653431ab527678e6385c1a00c01aff` (`ed608e2`, "chore: ignore local .claude directory") |
| working tree | **clean** (`git status --porcelain` printed nothing) |
| local `main` vs `origin/main` | **equal** — `git rev-list --left-right --count main...origin/main` = `0	0` (0 ahead, 0 behind), after `git fetch origin` |
| highest task number in `tasks/` | **253** (`tasks/253-blitz-second-round.md`); this task becomes 254 |

## 2. The two traps added to CLAUDE.md

Both appended to the existing `## Traps that have bitten before` section
(which starts at line 1099), after its last entry, immediately before
`## Working style`.

**Trap (a)** — first line, `CLAUDE.md:1192`:

```
- **The stage titled «Η Αγορά» does NOT use the AGORA_* phases — «Η Λήθη»
```

**Trap (b)** — first line, `CLAUDE.md:1206`:

```
- **Preset-only names (Task 241/245) silently killed eight dev harnesses.**
```

### Evidence behind trap (a)

- `server/src/modes/full.ts:29` — stage 1 is `Η Αγορά`, "quiz questions (a
  POWER_UP before each, per the table)"; `:40` — stage 5 is `Η Λήθη`, "one
  agora round", with its own comment giving Task 231's reason for the
  rename off "Η Μνήμη της Αγοράς": *that title read as a return to stage 1,
  Η Αγορά*.
- `shared/src/index.ts:1448` `title: 'Γύρος 1 — Η Αγορά'` vs `:1485`
  `title: 'Γύρος 5 — Η Λήθη'`.
- `client/src/screens/HostScreen.tsx:2837` — the gate is a phase-value test,
  nothing else: `const isAgoraScenePhase = phase === 'AGORA_EXPOSE' || phase
  === 'AGORA_QUESTION' || phase === 'AGORA_REVEAL';`
- The false alarm: commit `cd498a0` ("Task 252 follow-up: confirm Socrates
  removal is Λήθη-only, not Η Αγορά too") — observation-only, added
  `dev/lethe-vs-agora-stage-check.ts` and measured socrates-figure count = 1
  during stage 1's QUESTION, 0 during stage 5's AGORA_QUESTION.

### Evidence behind trap (b)

`server/src/state.ts:655-658` — `isValidPlayerName` is strict membership in
`PRESET_NAMES`. Run against the real function (`npx tsx`, importing
`server/src/state.js`):

```
Άλφα false    Βήτα false    Γάμα false    Δέλτα false    Έψιλον false
Άρης true     Νίκη true     Τάκης true
```

So a pre-241 name is rejected at `server/src/index.ts:826-827` with
`JOIN_REJECTED { reason: 'INVALID_NAME' }` — on the FIRST join, before any
check runs, which is why these harnesses score *nothing* rather than
failing visibly.

Repairs already done: **three at Task 246** — `climb-ceremony-check.ts:111`,
`climb-lane-check.ts:104`, `finale-staging-check.ts:112`, all now
`const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης', 'Γιώργος', 'Ζωή']` — and
**one at Task 249**, `socrates-pacing-check.ts:127`
(`['Άρης', 'Νίκη', 'Χαρά', 'Τάκης']`). Those three files still *mention*
Άλφα/Βήτα/Δέλτα, but only in comments and check labels, never in a join.

## 3. The five still-broken harnesses

`grep -anE "(Άλφα|Βήτα|Γάμα|Δέλτα|Έψιλον|Ζήτα)" dev/` matched eight files;
removing the four repaired above (whose remaining hits are comments only)
leaves five, each with a pre-241 name on a live join path:

| # | file | grep evidence (file:line — matched name, in context) |
|---|---|---|
| 1 | `dev/242-subtitle-check.ts` | `:85` — `for (const name of ['Άλφα', 'Βήτα']) {` → filled into the join form at `:94` |
| 2 | `dev/climb-entry-check.ts` | `:319` — `sims.push(await joinSim('Άλφα', humanAvatars[0], code));` (`:320` `'Βήτα'`); `joinSim` emits `PLAYER_JOIN` at `:132` |
| 3 | `dev/duel-hint-check.ts` | `:99` — `const phoneA = await joinPhone(browser, code, 'Άλφα');` (`:100` `'Βήτα'`) |
| 4 | `dev/end-state-timer-subtitles-check.ts` | `:42` — `const NAMES = ['Άλφα', 'Βήτα'];`, consumed at `:306-307` and typed in at `:314` |
| 5 | `dev/podium-subtitle-followup-check.ts` | `:134` — `for (const name of ['Άλφα', 'Βήτα']) {` (again at `:210-211`) |

A whole-`dev/` sweep against `PRESET_NAMES` (49 `.ts` files, every
Greek-word string literal checked for membership) confirms no sixth file
carries an Άλφα/Βήτα-family name. It does surface other non-preset literals
— `Δοκιμή`, `Δοκιμαστής`, `Παρατηρητής`, `Ένας`, `Δύο`, `Ανθρωπος` — in
`agora-phone-check.ts`, `bot-room-lifecycle-check.ts`, `intro-lines-check.ts`,
`stage-intro-check.ts` and `screenshot-phases.ts`. Those are outside this
task's named scope (the pre-241 Άλφα/Βήτα set) and were NOT investigated or
touched; they are flagged here, not claimed broken.

## 4. Finding: the NAMES constant is not always the whole repair

Not asked for, but it changes how trap (b) should be acted on, so it is
recorded rather than left to bite the next task. Task 241 also deleted the
custom-name entry UI: `grep -arn "custom-name" client/src` returns **0**
hits (removed in `14eed31`, Task 241), and `dev/241-name-check.ts:229-230`
asserts those testid counts are 0 by design. The post-241 join flow is
`name-search` / `name-list` / `preset-name-option`.

Four of the five broken harnesses drive the deleted flow as well as using a
dead name — `242-subtitle-check.ts:93`, `duel-hint-check.ts:65`,
`end-state-timer-subtitles-check.ts:313`,
`podium-subtitle-followup-check.ts:141,216` — so a NAMES-only repair will
leave them hanging on `custom-name-toggle`. Only `climb-entry-check.ts`,
which joins at the socket level, is a genuine NAMES-only fix.
`dev/242-numeric-check.ts` hit exactly this wall during Task 252 and was
documented, not fixed. Two harnesses currently *believed* green,
`dev/screenshot-phases.ts:739` and `dev/socrates-pacing-check.ts:665`, also
still drive that dead flow on their phone paths — unverified by execution
here, since this task is docs-only; per trap (b)'s own rule, treat a green
claim from either phone path as unproven until run.

## 5. Inverse criterion — what the commit touched

```
 CLAUDE.md                     |  44 +++++++++++++++
 tasks/254-status-and-traps.md | 128 ++++++++++++++++++++++++++++++++++
 2 files changed, 172 insertions(+)
```

Nothing under `client/`, `server/`, `shared/` or `dev/`. No deploy.
