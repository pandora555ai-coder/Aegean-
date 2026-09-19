# Task 279 — generate the 6 coronation clips + one vocative (real spend, staging)

Task 278 registered the two coronation sets as six lines with no audio. This
task bought that audio, plus the first real vocative clip, and proved the
splice plays from staging.

## The brief's `--names` argument arrived unfilled

It read literally `[ΟΝΟΜΑΤΑ ΕΔΩ]`. Nothing was guessed: the budget arithmetic
was measured first (the six coronation hashes dry-run at **404 ch** of the
**500** cap, leaving **96 ch**, against an average vocative of **6.2 ch**) and
put to Argyrios, who chose **Νίκος only** — party names to follow in their own
micro-batch, and explicitly **no catalogue-order spend**. All 201 preset
vocatives were ungenerated before this task; 200 still are.

Command, exactly as briefed apart from that one resolved argument:

```
npx tsx dev/generate-voice-lines.ts \
  --hashes bd12930f9369aa78,908d6d37b36aa4e9,8a1a964d20b629b2,\
2edec02cc8a0cd0a,9b482d51db0ca0d7,029e4cb422893a1d \
  --names Νίκος --generate --confirm-spend I-MEAN-TO-SPEND-REAL-MONEY \
  --max-chars 500
```

`dev/voice/swap-staging.sh` was **not** run. Nothing was deployed.

## 1 — dry-run total vs billed, and retries

| | chars |
|---|---|
| dry-run, printed by the run itself | **408** (7 of 7 missing) |
| billed | **478** |
| difference | **+70**, one retry |

**One retry.** `2edec02cc8a0cd0a` (set C line 1, 70 ch) failed the Task 251
tail check on attempt 1 of 3 — `ratio=0.70 peak=2245`, i.e. its last 20ms sat
at 70% of its own recent peak, past the 0.6 threshold — and was re-synthesized.
Attempt 2 passed and is the file on disk. Every synthesis attempt is a separate
billed POST (`dev/voice/provider.ts`), so the rejected attempt's 70 ch were
charged and are counted above. The other six landed on attempt 1.

The run stayed inside the 500-char budget on its **planned** total (408); the
budget guard does not re-check after a retry, so a pathological run could bill
past `--max-chars`. Worth knowing, not changed here.

## 2 — per file

All seven are in `client/public/voice-staging`, which is gitignored
(`.gitignore:11`). Durations are `ffprobe`'s.

| hash | role | duration | bytes |
|---|---|---|---|
| `bd12930f9369aa78` | B1 «Το πλήθος ξεχνάει…» | 8.751 s | 70,261 |
| `908d6d37b36aa4e9` | B2 «Απόψε είδα κάτι σπάνιο…» | 6.531 s | 52,497 |
| `8a1a964d20b629b2` | B3 «Το δικό σου.» | 2.273 s | 18,434 |
| `2edec02cc8a0cd0a` | C1 «Ήρθα απόψε να κοροϊδέψω…» | 5.878 s | 47,273 |
| `9b482d51db0ca0d7` | C2 «Κοιτάζω το σκορ σου…» | 5.878 s | 47,273 |
| `029e4cb422893a1d` | C3 «Η ειρωνεία μου σωπαίνει…» | 6.426 s | 51,661 |
| `069ef3480d9af33f` | vocative «Νίκο» | 0.679 s | 5,686 |

**C1 and C2 are byte-for-byte the same SIZE and duration.** That is the shape
of a provider returning one clip twice, so it was checked rather than assumed:
the seven files have **seven distinct content md5s**, and C1/C2 differ
(`ebd7691e…` vs `ec9a9ba4…`). Genuine coincidence — CBR audio of equal frame
count — and the same thing already exists in the bank, documented at
dev/277-splice-check.ts:270.

**Zero writes to the bank symlink.** `/opt/party-game/client/public/voice`
sampled three times — before the spend, after it, and after the harness run —
identical every time: listing md5 `2d8fa9d95538d2a43da6200470d28bd7`, **130**
files, dir mtime `2026-09-19 13:08:17`. None of the seven hashes exists there.
Staging went **258 → 265** (+7, exactly the seven).

## 3 — tail check on all seven

`dev/voice/tailCheck.ts`'s own test, all seven **PASS**, none truncated.
Tail silence is the trailing run of 20 ms windows under RMS 500:

| hash | tail silence | ratio | notes |
|---|---|---|---|
| `bd12930f9369aa78` | 40 ms | 0.18 | |
| `908d6d37b36aa4e9` | 240 ms | 0.01 | |
| `8a1a964d20b629b2` | 1160 ms | 0.89 | see below |
| `2edec02cc8a0cd0a` | 20 ms | 0.05 | the retried one |
| `9b482d51db0ca0d7` | 0 ms | 0.43 | tightest real margin |
| `029e4cb422893a1d` | 40 ms | 0.05 | |
| `069ef3480d9af33f` | 220 ms | 0.03 | |

Two of these want reading carefully rather than off the ratio column:

- **B3 `8a1a964d20b629b2` scores ratio 0.89, above the 0.6 threshold, and
  still passes — correctly.** Its recent peak is RMS **2**, i.e. digital
  silence, so `TAIL_MIN_RMS` (500) is what passes it. This is the *opposite*
  of truncation: 1160 ms of the 2.27 s file is trailing silence. «Το δικό
  σου.» is a two-word line, so about half the clip is room tone.
- **C2 `9b482d51db0ca0d7` has 0 ms of tail silence** and the highest final
  window (RMS 3283) of the seven. It passes at ratio 0.43, comfortably inside
  the threshold, but it is the one clip that ends *as* the audio stops. Flagged
  for a listen rather than re-bought on a number that passed.

The generator's closing `⚠ exceeds SOCRATES_MAX_DURATION_MS - raise the cap`
names `7ea7750a4ef1bbe4.mp3`, none of this task's files: that scan walks the
whole directory, not the active hashes (CLAUDE.md, Voice), and Task 238 already
retired that cap as a backstop. Pre-existing noise.

## 4 — one local run, staging served, B3's suffix a REAL vocative

New harness `dev/279-staging-splice-check.ts` (the only code committed here),
descended from dev/277-splice-check.ts. That harness had to fake this moment —
two arbitrary bank clips standing in for a line and "a vocative that will be
recorded later". This one plays the real pair: set B's own
`CORONATION_NAME_LINE` with the real «Νίκο» clip spliced after it, the beat
driven through `enterSocratesBeat` exactly as `startSocratesSequence` sets it
up for the coronation.

Staging had to be served at **both** ends, and neither half changes production
lookup:

1. **Server** — `AEGEAN_DEV_VOICE_DIR` (Task 263's dev-only, NODE_ENV-guarded
   *search path*) points at `voice-staging`, so `resolveSocratesClip` can size
   the new clips. Unset, production resolves exactly as before.
2. **Browser** — the TV hardcodes `/voice/<hash>.mp3`, which Vite serves out of
   the symlinked bank, where these clips do not exist. A Playwright
   `page.route` shim rewrites only those requests that staging can satisfy.
   Test-only interception; no committed code teaches the client about staging.

**14 passed, 0 failed** (tsx's own exit status, captured directly — Task 278's
`tail`-swallows-the-status trap). Measured in the page, off an
`AudioBufferSourceNode.prototype.start` probe:

| | |
|---|---|
| clips started | **2** — line then suffix |
| decoded | 2240 ms and 640 ms, vs files of 2304 ms / 711 ms |
| **gap line-end → suffix-start** | **−9.5 ms** (−0.6 ms on the first run) |
| **chain total** | **2871 ms** |
| **armed backstop** | **11000 ms** |
| ack | **2982 ms**, by `socrates:audio_ended` |
| backstop fired | **never** |

The gap is very slightly negative because the suffix is scheduled against the
line's decoded length, so it starts a few ms before the final samples drain —
audibly continuous, which is the point.

The 11000 ms backstop is `4000 + 3000 + 4000`: both clips are **under** the
4000 ms `SOCRATES_DURATION_MS` floor, so each contributes the floor rather than
its true length. Correct per Task 238's arithmetic and verified against
`socratesBackstopMs` directly, but it means the ceremony's shortest beat is
armed for four times its real length. dev/277-splice-check.ts deliberately
chose clips over 4500 ms to avoid demonstrating against the floor; the real
coronation line has no such choice.

The run also confirms the pair could only have come from staging: both hashes
are absent from the bank, `resolveSocratesClip` reports `known=true` for each,
and the shim served the line and the suffix twice each out of 253 rewritten
requests — that bulk is Task 154's LOBBY prefetch pulling the whole bank, not
the beat.

Typecheck clean in all three workspaces.

## State left behind

Seven clips in `client/public/voice-staging`, audible at `/dev/voice-audition`
(Task 269 renders a staging column). Nothing in the bank, nothing deployed.
Promoting them is `dev/voice/swap-staging.sh`, deliberately not run here.
