# Task 300 — Skip-vote for Socrates' narrations

Branch `skip-vote` (cut from `main` at `d025b43`), tree clean at start, built on
Task 299's diagnosis and its proposed sequence verbatim. No deploy.

Scope: during the two multi-line SEQUENCES only — `GAME_INTRO_SEQUENCE` (10
lines) and `ANAVASIS_INTRO_SEQUENCE` (3) — every connected phone shows a vote
button; one-way vote; TV counter in the subtitle band; threshold is strictly
more than half of the CURRENTLY-connected roster; on pass the clip stops
mid-word, the rest of the narration is discarded, ONE `SKIP_INTERRUPTED` beat
plays, and the flow resumes exactly where the narration's own end would have led.

Check: `npx tsx dev/300-skip-vote-check.ts` (`SCENARIO=A|B|C|D|E|F`), socket-only,
in-process server on throwaway port 3986. **54/54 checks, 0 failures.**

## How the ack is suppressed (the dangerous part, 299 §2)

`useGameAudio.stopSocratesLine(beatId)` nulls `source.onended` **before**
calling `source.stop()`. `stop()` FIRES `onended`, so leaving it attached would
emit `socrates:audio_ended` for the beat just cancelled — synthesising precisely
the ack this feature must suppress, and re-opening Task 236's double-advance. A
generation counter (bumped on every play and every stop) covers the four `await`
points in the play path, where a stop can land with no source to stop yet: an
aborted chain returns **without** calling `onEnded`, including from the `catch`.
Nothing is emitted back to the server at all. Belt and braces: `enterSocratesBeat`
bumps `socratesBeatId`, so an escaped ack arrives stale and is refused anyway.

## Acceptance criteria

**1. Live bot run — votes land mid-GAME_INTRO, threshold passes.**
SCENARIO=A, 3 real phone sockets (bots never vote; the threshold is a fraction of
the connected roster, so an all-bot room could never pass one), `mode=full`.
Vote cast on **line 3 of 10**. One vote: counter 1/2, `open:true`, zero stops,
narration continues. Second vote passes. Measured timeline —
`vote@11989ms -> socrates:stop(beat 3)@11992ms (3ms) -> interruption beat 4
@11992ms (same tick) -> its own ack@12991ms -> QUESTION@18152ms`. The stopped
beat was **never acked** (acked ids: 1,2 — beat 3 absent). Interruption beat
carries `kind: GAME_INTRO` (the ORIGINAL kind — zero new routing) and a
SKIP_INTERRUPTED line. Queue discarded: **3 of 10** lines played, **7 discarded**,
and no GAME_INTRO_SEQUENCE line appears after the stop. Flow resumed through the
existing switch: STAGE_INTRO beat 5, then `question 1/15 (stage 1)`.

**BOTH sequences, not just the opening one.** A–E all exercise GAME_INTRO, so
SCENARIO=F covers Η Ανάβασις' own three-line announcement, which enters as
`STAGE_INTRO` and leaves through a DIFFERENT arm of `advanceFromSocrates`'
switch. Same result: `skip vote OPEN for STAGE_INTRO (3 lines, 2 of 3 needed)`
→ `PASSED on beat 1 (2/2) - 2 queued line(s) discarded`, interruption beat
carries `kind: STAGE_INTRO`, stopped beat never acked, 1 of 3 lines played, and
the climb still starts — `stop@3608ms -> interruption@3608ms ->
CLIMB_QUESTION@4611ms`. (Runup per Task 237: `startClimb` direct, with
`room.gameIntroPlayed` seeded true.) This is also why the pool has FOUR lines
rather than three: one game can skip two narrations, and `usedLines` must still
have something unrepeated for the second.

**2. Guards, each proven in a run.**
- Below threshold does nothing — 1/2, `open:true`, `stops.length === 0` (A).
- Disconnect drops the threshold and a pending tally re-evaluates — B: 4 players,
  needed 3, two votes standing, no pass; a **non-voter** disconnects → connected 3,
  needed 2, `skip vote PASSED (2/2)`, **no new vote cast** (2 votes total).
- Vote during pause ignored — C: two votes → two `rejected player:skip_vote ...
  game is paused`, tally unmoved at 0/2, zero stops; the **same two votes pass
  after resume** (stop at 5672ms), which is what proves the pause was the reason.
- Second vote round impossible — A: a third vote inside the same sequence →
  `rejected ... no open skip vote` (the `resolved` latch), `stops.length === 1`.
- 238 VIP skip refused on the interruption beat — A: `rejected vip:skip_socrates
  ... this beat is unskippable`; the beat stays on screen and ends on its OWN ack.
  (This answers 299's open question: unskippable by BOTH the vote and Παράλειψη.)

**3. Registration.** `collectVoiceLineEntries()` **517 → 521** (4 new rows; nothing
shares these lines). `content/speech-policy-lines.md` now **14 pools / 43 lines**,
sha256 `5e87cefc369111098c26788ffdf187e6d2bdf59fbee3ae8f151921a921010295` (was
`a14cb9e2…`); all four lines and all four `LINE_TAGS` entries counted row-by-row
against the code, byte-equal. Reconnect mid-vote (D): the rejoining phone's
targeted resend is
`{"votes":1,"needed":2,"connected":3,"open":true,"youVoted":true}` — and while
away, a disconnected voter correctly stops counting (0/2 of 2) without passing it.
The resend had to go on the **reconnect** branch (index.ts:876), which returns
before the new-join path; `state:sync` cannot carry it, since SOCRATES has no
player-facing sync case at all (the line is host-only).

**4. INVERSE — no-vote runs unchanged.** Four full `mode=full`, `BOT_COUNT=4`
shows through `dev/294-speech-policy-check.ts`: two BEFORE any edit, two after.
A bot never votes, so these are genuine no-vote runs.

| kind | v1 before | v1 after | v2 before | v2 after |
|---|---|---|---|---|
| GAME_INTRO | 10 | **10** | 10 | **10** |
| STAGE_INTRO | 9 | **9** | 9 | **9** |
| WINNER | 3 | **3** | 3 | **3** |
| DRAW_INTRO | 2 | **2** | 1 | **1** |
| DRAW_WINNER | 1 | **1** | 1 | **1** |
| NUMERIC_MOMENT | 2 | **2** | — | — |
| SPEAR_OUT | 1 | **1** | — | — |
| SPEECH_SLOT | 0 | **0** | 9 | **9** |
| REVEAL *(detector)* | 14 | 13 | 0 | 0 |
| DRAW_MOMENT *(detector)* | 3 | 4 | 0 | 0 |
| AGORA_MOMENT *(detector)* | 3 | 2 | 0 | 0 |
| **TOTAL** | 48 | 47 | **33** | **33** |

**v2 is byte-equivalent**: same total, same tallies, and the harness's `order:`
string matches token-for-token across all 33 beats. **v1 matches on every
FIXED-count kind** and moves only in the three content-dependent detector kinds
(REVEAL/DRAW_MOMENT/AGORA_MOMENT), which is the allowed variance — 297's own
method, since neither the bot timing nor the question draw is seedable. The
load-bearing number is GAME_INTRO = 10 in all four: with nobody voting, all ten
narration lines still play, untouched.

The ONE wire-level difference in a no-vote run, stated rather than hidden: the
vote still OPENS and closes, so two extra room-wide `skip:progress` emits per
sequence. Confirmed in both after-runs' server logs — `OPEN=2` (GAME_INTRO and
STAGE_INTRO, i.e. both sequences), `PASSED=0`, `socrates:stop=0`. Note a bot
room still opens a vote whose threshold counts BOTS (`3 of 4 needed` above),
which is harmless because no bot can emit `player:skip_vote` — it simply can
never pass. `collectVoiceLineEntries(): 521` in both.

Typecheck ×3: all three clean (`exit=0`). `dev/277-splice-check.ts`: **24/24
passed, 0 failed**.
`main` is `d025b43` = `origin/main`, untouched; tag `v1.0-playtest` still resolves
to commit `c87443a`, untouched. All work is on `skip-vote`.

## The bots.ts hole 299 flagged

`wireHostSocratesAck` acked with **no beatId**, so a harness host was the one
client exempt from Task 236's staleness rule — a late ack for a stopped or
cut-off beat would end whichever beat had replaced it. It now echoes
`payload.beatId`, exactly as a real browser has since 236. `index.ts:608` is
**annotated, not tightened**: an absent id must keep meaning "whatever is
current", because `vip:next` deliberately sends none and a VIP who reloaded
mid-beat relies on it. No harness broke — an id that IS current validates
exactly as an absent one did (callers: bot-accuracy-check, bot-mode-param-check,
socrates-cutoff-timing-check).

## Notes

- The coronation (`WINNER`) is also a sequence and deliberately opens **no** vote:
  it plays after the game is decided, and there is nothing for a skip to get back to.
- The interruption beat has no mp3 until the October pass, so it is subtitle-only
  and ends on the client's immediate 404 ack — which is exactly why it cannot
  strand a room that just asked for the talking to stop.
