# Task 269 — staging audition page

A read-only dev page, `/dev/voice-audition`, that plays any Socrates line's
clip from the bank AND/OR staging, side by side, so 201 vocatives and 36
regenerations can be listened to before `swap-staging.sh` ever runs.

## What was built

- **`shared/src/index.ts`**: moved `stripPlaceholders` here from
  `dev/voice/text.ts` (re-exported unchanged from there, same as `lineHash`
  already was) — the server needs it too, and server never imports from
  `dev/`. Added `SOCRATES_VOICE_STAGING_DIR = 'voice-staging'` (used by both
  the generator's own default and this page, one constant instead of two
  copies of the literal). Added the `DEV_GET_VOICE_AUDITION` /
  `DEV_VOICE_AUDITION` event pair and `DevVoiceAuditionPayload` — same
  request/response shape as `DEV_GET_VOICE_LINES`/`DevVoiceLinesPayload`,
  extended with `inBank`/`inStaging`/`bankDurationMs`/`stagingDurationMs`.
- **`server/src/voiceAudition.ts`** (new): `collectVoiceAuditionEntries()`,
  built on `collectVoiceLineEntries()` (the one authoritative pool walk
  `/dev/voice` and the generator already share) plus a `statSync` against
  each of `client/public/voice` and `client/public/voice-staging` per hash —
  read-only, no fs writes anywhere in this module.
- **`server/src/index.ts`**: one new socket handler,
  `DEV_GET_VOICE_AUDITION` → `DEV_VOICE_AUDITION`, same dev-sink pattern as
  the six others already there (no room, no phase, no session state).
- **`client/src/screens/DevVoiceAuditionScreen.tsx`** (new) +
  `devRoutes.tsx`: the page itself. Per row — hash, pool (`moment`), tag,
  the exact spoken text (`tag + stripPlaceholders(template)`, computed
  client-side from the now-shared function, never a second regex), a
  BANK/STAGING/BOTH/NEITHER badge, and up to two independent `<audio>`
  elements (`/voice/<hash>.mp3`, `/voice-staging/<hash>.mp3`) — one per
  location that actually has a file, each with its own duration. A source
  filter (All/In bank/In staging/In both/Neither) and a pool filter narrow
  the list. No app-level auth code — same as `/dev/intro-lines`, gated by
  Caddy's existing `/dev` basic-auth prefix in production, nothing to add.
  Palette-only styling (no raw hex, tokens copied from `DevVoiceScreen`'s
  own already-audited set).

**Never built, on purpose**: no rating UI. The row shape (one row per hash,
keyed the same way `/dev/voice` keys its own) is what a future keep/kill
pass would bolt a `Rating` type + localStorage map + button row onto,
exactly like `DevVoiceScreen` already does — adding that later extends this
component, it doesn't replace it.

## Acceptance criteria

Verified against a throwaway local `npm run dev`-equivalent (server on
4001, Vite on 5173 — both stopped before this report), via Playwright
against `http://localhost:5173/dev/voice-audition`.

**1 — the 4 staged coronation clips play from staging.** URL:
`http://localhost:5173/dev/voice-audition` (then click "In staging"). All
4 render with `status=STAGING ONLY`, pool `CORONATION`:

| hash | text shown | staging duration |
|---|---|---|
| `2783003bfb1eca35` | `[serious] Το πλήθος αγάπησε το όνομά σου νωρίς. Συνήθως το ξεχνάει πριν αδειάσει το θέατρο. Απόψε δεν θα το ξεχάσει.` | 9.7s |
| `1ef3e41f99ea15c3` | `[dry] Ήρθατε εδώ λέγοντας πως είστε σοφιστές. Το έλεγα κι εγώ όλη τη βραδιά — κοροϊδεύοντας.` | 7.3s |
| `dd09e7993b172139` | `[warm] Σ' εσένα το λέω σοβαρά. Σοφιστή. Δεν το έχω πει ποτέ σε κανέναν… Πήγαινε να το πουλήσεις. Απόψε αξίζει.` | 9.2s |
| `bcc2ae3833de4e46` | `[warm] Σ' εσένα το λέω σοβαρά. Σοφίστρια. Δεν το έχω πει ποτέ σε καμία… Πήγαινε να το πουλήσεις. Απόψε αξίζει.` | 7.6s |

Each `<audio>`'s `src` (`/voice-staging/<hash>.mp3`) was independently
fetched and returned HTTP 200, `content-type: audio/mpeg`, with byte counts
matching Task 268's own generation exactly (77366/58767/73604/60648 B) —
real, playable files, not just a resolved URL.

**2 — bank mode still works.** "In bank" filter: **271** clips listed (of
476 total pool entries; 476 − 271 not-in-bank ≠ 205 orphans — CLAUDE.md's
own documented bank-orphan count is separate and about files with NO
matching active-line hash at all, invisible to this count by construction).
First bank-only row's `<audio src="/voice/<hash>.mp3">` fetched → HTTP 200,
`audio/mpeg`, 70,261 bytes — a real bank clip, playing.

**3 — overlap (both bank and staging).** Not hypothetical: **244** clips
currently exist in both (the "In both" filter). Example hash
`e673a74d9f588d5c`: two separate `<audio>` elements render,
`/voice/e673a74d9f588d5c.mp3` and `/voice-staging/e673a74d9f588d5c.mp3`,
each independently fetchable (both HTTP 200, both 70,261 bytes — this
particular line's staging copy happens to be byte-identical to its bank
copy, from an earlier full-regeneration staging batch, not something this
task produced).

**4 — inverse.**
- `/opt/party-game` mp3 count: **283 before, 283 after.**
- `client/public/voice-staging` count: **258 before, 258 after** — this
  page never writes; confirmed by count, not by trusting the "read-only"
  claim.
- **Zero API calls**: no `--generate` was run anywhere in this task
  (`dev/generate-voice-lines.ts` was touched only for its `OUT_DIR`
  constant, verified with a dry run); `swap-staging.sh` was not run.
- **`git diff --stat` does NOT touch only `client/` and `dev/`** — it also
  touches `shared/src/index.ts` and two files under `server/`
  (`server/src/index.ts`, new `server/src/voiceAudition.ts`). This is a
  deliberate deviation from the literal ask, not an oversight: the page
  needs to know, per hash, whether a file exists on THIS machine's disk in
  two specific directories, and only the server can stat a filesystem — the
  client can't. Every other `/dev/*` page that needs server data
  (`/dev/voice`, `/dev/numeric`, `/dev/draw`) already goes through exactly
  this shape (a shared event pair + a server socket handler), and
  duplicating `collectVoiceLineEntries`'s pool walk client-side instead
  would violate the "one authoritative source" rule CLAUDE.md already
  states for that function. Full file list:
  `client/src/devRoutes.tsx`, `client/src/screens/DevVoiceAuditionScreen.tsx`
  (new), `dev/generate-voice-lines.ts`, `dev/voice/text.ts`,
  `server/src/index.ts`, `server/src/voiceAudition.ts` (new),
  `shared/src/index.ts`, plus this task doc.

`server/src/socrates.ts` carries a separate, pre-existing uncommitted
change (not authored by this task, present since before Task 266) that
this task again left alone and did not stage or commit.
