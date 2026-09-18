# Task 270 — land the coronation text fixes (the missing half of Task 265)

`server/src/socrates.ts` carried an uncommitted change since before Task
266 — not scratch work, not an accident: it is Task 265's own three text
fixes, left uncommitted because that task's generation attempt failed
before it could commit. This task lands it, unmodified, as its own commit.

**Why it's required, not optional**: the 4 coronation clips Task 268
generated into staging were hashed from the templates/tags *this*
uncommitted version of `socrates.ts` produces. Without this commit, the
code in `main` still resolves the OLD templates/tags, which hash to
different filenames — the coronation beat would look up clips that don't
exist and play silently.

## The three fixes (verbatim from Task 265's intent)

1. **`CORONATION_OPENER_NAMED`**: removed the stray `{ΚΛΗΤΙΚΗ}. ` prefix.
   `stripPlaceholders` strips the placeholder token itself but leaves the
   bare `. ` behind, so the OLD template would have generated a clip that
   opens on a spoken pause. The vocative is spoken separately (the beat's
   own `prefix` splice, Task 263) — this sentence never needed the
   placeholder at all. Removing it makes `CORONATION_OPENER_NAMED`
   byte-identical to `CORONATION_OPENER_PLAIN` (same tag, same hash — one
   mp3 now serves both branches).
2. **`CORONATION_LINES.m`** tagged `[warm]` in `LINE_TAGS` (was untagged).
3. **`CORONATION_LINES.f`** tagged `[warm]` in `LINE_TAGS` (was untagged).

Everything else in the diff — the `VOCATIVE_PLACEHOLDER` import removal,
`buildCoronationSequence`'s `text:` construction switching from
`.replace(VOCATIVE_PLACEHOLDER, ...)` to prepending the vocative, and the
`LINE_TAGS` entry for `CORONATION_OPENER_NAMED` disappearing — are
mechanical, REQUIRED consequences of fix 1 (the placeholder is gone, so
nothing can `.replace()` it any more; the old entry would now be a
duplicate object key with `CORONATION_OPENER_PLAIN`'s, a TypeScript error),
not separate changes.

## Acceptance criteria

**1 — the 4 hashes the code resolves now match the 4 staged files, exactly.**
Computed live from this version of `socrates.ts` (`lineHash(text, LINE_TAGS[text] ?? null)`
for each of the four coronation texts) against `client/public/voice-staging`'s
actual directory listing:

```
CORONATION_OPENER_NAMED   tag=[serious]  hash=2783003bfb1eca35  inStaging=true
CORONATION_OPENER_PLAIN   tag=[serious]  hash=2783003bfb1eca35  inStaging=true
CORONATION_LINE_TWO       tag=[dry]      hash=1ef3e41f99ea15c3  inStaging=true
CORONATION_LINES.m        tag=[warm]     hash=dd09e7993b172139  inStaging=true
CORONATION_LINES.f        tag=[warm]     hash=bcc2ae3833de4e46  inStaging=true
```

All 5 lookups (opener collapses NAMED/PLAIN to the same hash) resolve to
exactly the 4 filenames Task 268 generated. Exact match, not "close".

**2 — `dev/263-coronation-check.ts` numbers at this commit.**
`SCENARIO=D npx tsx dev/263-coronation-check.ts`: **5 passed, 0 failed**
(unchanged from Task 266's own fix to assertion D — this task changes no
test code, only lands the production fix that assertion was already
written against). Notable lines: `CORONATION entries : 4`,
`one hash for line 1 across all winners — 1 distinct`, `CORONATION_OPENER_NAMED
carries no placeholder and is byte-identical to PLAIN — byte-identical, no
placeholder`, `all 4 coronation texts registered — 4`. `onDisk=false` for
all 4 in that check's own output is correct and expected — it queries the
real bank (`client/public/voice`), and these clips are still in staging
only.

**3 — `git diff` for `socrates.ts` is only those three changes.**
Confirmed: exactly **4 diff hunks**, all inside `pickCoronationLine`'s
surrounding block and `LINE_TAGS` — (a) the now-unused `VOCATIVE_PLACEHOLDER`
import, (b) `CORONATION_OPENER_NAMED`'s string literal + its comment, (c)
`buildCoronationSequence`'s `text:` line, (d) the `LINE_TAGS` entries
(`CORONATION_OPENER_NAMED` removed, `CORONATION_LINES.m`/`.f` added). No
other function, pool, or export in the file changed. `npm run typecheck`
(all three workspaces) passes clean with this file included.

## Deploy retry

Committed here, then `sudo /usr/local/sbin/aegean-deploy` was re-run with
the tree clean — see the top-level report for exit status, bundle mtime,
and the Task 269 string check in the built bundle.
