// Dev-only: generates one MP3 per Socrates line (server/src/socrates.ts)
// into client/public/voice-staging/ by default (Task 266 - see below; never
// client/public/voice, the symlink into production). Not part of any
// workspace build or deploy - run manually, then move a verified batch into
// production with dev/voice/swap-staging.sh (see Task 266's own note below).
//
//   tsx dev/generate-voice-lines.ts
//       DRY RUN (the default, no flags needed) - prints what would be
//       generated (count, total characters, per-line list) and makes ZERO
//       API calls. Safe to run any time.
//
//   tsx dev/generate-voice-lines.ts --generate --confirm-spend I-MEAN-TO-SPEND-REAL-MONEY --max-chars 5000
//       Actually synthesizes the missing lines. ALL THREE are required:
//       --generate is the dry-run opt-out, --confirm-spend <exact token>
//       (Task 267) is a SECOND, independent gate proving real intent - it
//       is not satisfied by --generate itself, so a test/control run that
//       only ever types --generate (to exercise a later code path) still
//       can't spend, even with real credentials loaded from .env - and
//       --max-chars is the explicit budget. Task 287 - the guard is now
//       PER REQUEST: billed-so-far + this request's chars is checked
//       against --max-chars before every synthesize() call, first attempts
//       AND tail-check retries alike, and the whole run stops the moment
//       one would breach it (see generateBatch below). A plan whose very
//       first line already exceeds the budget still refuses before any
//       spend, same as before; a plan that only breaches the cap partway
//       through (an early line, or a retry) now stops there instead of
//       either refusing everything up front or - the Task 279 bug this
//       replaces - letting an unmetered retry blow past the cap entirely.
//

//   tsx dev/generate-voice-lines.ts --hashes abc123,def456
//   tsx dev/generate-voice-lines.ts --names Άρης,Νίκη,Τάκης
//       Restrict the plan (dry run) or the generation (with --generate
//       --confirm-spend ... --max-chars) to a named subset - specific
//       lineHash values, or specific PRESET_NAMES entries resolved to
//       their VOCATIVE clip (Task 263). Lets a handful of vocatives be
//       recorded without touching the other ~195 missing lines.
//
//   tsx dev/generate-voice-lines.ts --generate --confirm-spend I-MEAN-TO-SPEND-REAL-MONEY --max-chars 500 --limit 3
//       --limit caps the batch size after any --hashes/--names filtering.
//
// Task 264 - added the dry-run default and the budget refusal after a
// single accidental `voice:generate` run would have synthesized 206
// missing lines (~3,236 chars) against a ~1,300-char balance, writing
// partial results straight into the production symlink (see the Voice
// section of CLAUDE.md). Generation used to be the default with no budget
// check at all; it no longer is.
//
// ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID come from the environment (or a
// gitignored repo-root .env) - never committed. Not read at all in dry-run
// mode, so a plan can be printed with no credentials configured.
//
// Task 147 - three env-only overrides for an A/B voice comparison, none of
// them touching the default (no env vars set) path above:
//   ALT_VOICE_ID     speak with this ElevenLabs voice instead of
//                    ELEVENLABS_VOICE_ID, for this run only.
//   ALT_OUTPUT_DIR   write mp3s here instead of the default staging dir
//                    below.
//   ONLY_HASHES      comma-separated lineHash values; same effect as
//                    --hashes, kept as an env var too because ALT_OUTPUT_DIR
//                    starts empty, so without this every line would look
//                    "missing" against a fresh staging dir.
//
// Task 266 - two fixes:
//
//   1. WRITE-BEFORE-PAY. A write failure used to surface only AFTER the paid
//      API call, burning characters for a clip that then couldn't be saved.
//      verifyWritable() below probes the output directory (create+delete a
//      throwaway file) before ANYTHING is generated, and again before EVERY
//      individual synthesize() call - cheap (one fs write+unlink), and it
//      catches a directory that goes unwritable mid-run before the next
//      clip's characters are spent, not just the first.
//
//   2. WRITE TO STAGING, NOT PROD. The default OUT_DIR is no longer
//      client/public/voice (a SYMLINK straight into /opt/party-game's own
//      voice dir - see CLAUDE.md's Voice section) - it is
//      client/public/voice-staging, a plain gitignored directory this repo
//      owns. dev/voice/swap-staging.sh already expects exactly this default
//      and copies (never deletes) a verified, exact-count staging batch into
//      the live symlink - that script is the one intended way a staged batch
//      ever reaches production. ALT_OUTPUT_DIR still overrides this, as
//      always.
//
// Task 267 - a THIRD guard, independent of both 266 fixes: --confirm-spend
// <SPEND_CONFIRM_TOKEN>, required alongside --generate before any provider
// is constructed. 266's own two guards (write-before-pay, staging-not-prod)
// both protect WHERE/HOW a spend lands, not WHETHER one was actually meant
// - and a real incident during 266 proved that gap: a control run typed
// --generate only to reach an unrelated later failure, and with real
// credentials sitting in .env it spent for real instead. --generate can't
// be the only spend gate because it's also the flag every test/harness run
// needs to reach the code paths it's testing. --confirm-spend is not that
// flag renamed - it's a second, independent one that must be typed exactly,
// so intent has to be spelled out, not inferred from "did this call take
// the --generate branch".
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AUDIO_BITRATE_KBPS, PRESET_NAMES, SOCRATES_MAX_DURATION_MS, SOCRATES_VOICE_STAGING_DIR, getVocative } from '@game/shared';
import { LINE_TAGS, collectVoiceLineEntries } from '../server/src/socrates.ts';
import { loadDotEnvIfPresent } from './voice/env.ts';
import { createElevenLabsProvider } from './voice/provider.ts';
import { lineHash, stripPlaceholders } from './voice/text.ts';
import { checkTail } from './voice/tailCheck.ts';

// Task 251 - ElevenLabs occasionally returns an HTTP-complete response whose
// AUDIO stops mid-sentence (see tasks/251-voice-generation-truncation.md):
// no networking race, just a generation-side truncation at a roughly
// constant ~12-13% rate regardless of text length or batch. Undetectable
// from the response alone, so each freshly written clip is checked with the
// same test Task 249 diagnosed the defect with, and re-synthesized (a fresh
// API call, not a retried read of the same response) on failure rather than
// silently kept.
export const MAX_SYNTHESIS_ATTEMPTS = 3;

// Task 267 - a SECOND, independent opt-in, belt-and-braces with --generate,
// not a rename of it. Task 266's own incident: a control/test run typed
// --generate (to reach a LATER, unrelated failure) with real credentials
// loaded from .env, and nothing stopped it from going all the way through
// and spending. --generate alone can't be the only gate, because it's
// exactly the flag every test/control/harness run ALSO needs to exercise
// that code path. This token must be typed out in full on the command line
// - never inferred from --generate, never defaulted, never satisfiable by
// any other flag - so a run whose INTENT is a test can never carry it by
// accident, even with valid credentials sitting in .env.
const SPEND_CONFIRM_TOKEN = 'I-MEAN-TO-SPEND-REAL-MONEY';

const ROOT = path.resolve(import.meta.dirname, '..');

loadDotEnvIfPresent(path.join(ROOT, '.env'));

// Task 148 - the voice accepted from the 147 A/B test is now the default.
// Only fills in when nothing (shell env or .env) already set it, so it's
// still fully overridable. Restore the old voice with
// ELEVENLABS_VOICE_ID=gFpOFEriJA3T1VbGi2Be in the environment or .env.
process.env.ELEVENLABS_VOICE_ID ??= 'NOpBlnGInO9m6vDvFkFC';

// Read after loadDotEnvIfPresent so a repo-root .env can set these too.
// Task 266 - default is now the staging dir (swap-staging.sh's own default
// STAGING_DIR), never client/public/voice, which is the prod symlink.
// Task 269 - the literal moved into @game/shared (SOCRATES_VOICE_STAGING_DIR)
// so the audition page's server-side handler names the same directory.
const OUT_DIR = process.env.ALT_OUTPUT_DIR
  ? path.resolve(ROOT, process.env.ALT_OUTPUT_DIR)
  : path.join(ROOT, 'client', 'public', SOCRATES_VOICE_STAGING_DIR);

const ONLY_HASHES = process.env.ONLY_HASHES
  ? new Set(
      process.env.ONLY_HASHES.split(',')
        .map((h) => h.trim())
        .filter(Boolean),
    )
  : null;

if (process.env.ALT_VOICE_ID) {
  // createElevenLabsProvider() itself takes no args and always reads
  // ELEVENLABS_VOICE_ID - overriding that var here (this run only, in this
  // process) is simpler than threading an override parameter through it.
  process.env.ELEVENLABS_VOICE_ID = process.env.ALT_VOICE_ID;
}

function findFlagValue(argv: string[], name: string): string | null {
  const flag = argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!flag) {
    return null;
  }
  const value = flag.includes('=') ? flag.split('=').slice(1).join('=') : argv[argv.indexOf(flag) + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseLimit(argv: string[]): number | null {
  const value = findFlagValue(argv, '--limit');
  if (value === null) {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid --limit value: ${value}`);
  }
  return n;
}

function parseMaxChars(argv: string[]): number | null {
  const value = findFlagValue(argv, '--max-chars');
  if (value === null) {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid --max-chars value: ${value}`);
  }
  return n;
}

// Task 266 - the write-before-pay guard. Creates and immediately deletes a
// throwaway probe file in `dir`; throws with a clear, actionable message on
// any failure (missing dir that can't be created, permission denied, read-
// only filesystem, ...). Called once up front (before any budget check or
// provider construction) and again before every individual synthesize()
// call, so no API spend ever happens without a just-proven write path.
function verifyWritable(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    const probePath = path.join(dir, `.write-probe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    writeFileSync(probePath, '');
    unlinkSync(probePath);
  } catch (err) {
    throw new Error(`Output directory is not writable: ${dir}\n  (${(err as Error).message})`);
  }
}

// Task 287 - a single item this generator can bill for: enough to check
// and spend against the budget, nothing about WHY it's in the batch (the
// filename/lineHash/template plumbing stays in `toGenerate` below).
export interface GenerationBatchItem {
  filename: string;
  spoken: string;
  chars: number;
}

// Task 287 - the dependencies the actual spend loop needs, injected so the
// budget guard below can be exercised with zero API calls and zero real
// filesystem writes (dev/287-voice-budget-check.ts mocks all five). main()
// wires these to the real ElevenLabs provider, the real checkTail, and the
// real fs calls; nothing else in this file constructs a provider.
export interface GenerationDeps {
  synthesize: (text: string) => Promise<Buffer>;
  checkTail: (mp3Path: string) => ReturnType<typeof checkTail>;
  writeFile: (path: string, data: Buffer) => void;
  unlinkFile: (path: string) => void;
  verifyWritable: (dir: string) => void;
}

export interface GenerationResult {
  billed: number;
  refusedByBudget: boolean;
  generated: string[];
}

// Task 287 - the fix. Task 264's old gate compared the PLANNED total
// (one synthesize() per line) against --max-chars exactly once, before
// generation started. But a tail-check retry (Task 251) is a fresh,
// separately-billed API call - `provider.synthesize` is invoked again,
// full price, for the same line - and nothing re-checked the budget before
// that second (or third) request went out. A line that retries twice bills
// 3x its planned chars with no gate at all.
//
// The fix tracks billedSoFar and checks it immediately before EVERY
// synthesize() call - the loop's only call site, first attempt and every
// retry alike (line ~ the `if (billedSoFar + chars > maxChars)` check
// directly above the one `deps.synthesize(spoken)` line below). A request
// that would breach the cap is refused and the WHOLE run stops there
// (labeled `outer` break) rather than skipping ahead to a later, smaller
// line - once a refusal has happened the plan can no longer be trusted to
// fit, so nothing further gets spent this run.
export async function generateBatch(
  batch: GenerationBatchItem[],
  maxChars: number,
  outDir: string,
  deps: GenerationDeps,
): Promise<GenerationResult> {
  let billedSoFar = 0;
  let refusedByBudget = false;
  const generated: string[] = [];

  outer: for (const { filename, spoken, chars } of batch) {
    const destPath = path.join(outDir, filename);
    let attempt = 0;
    for (;;) {
      attempt++;
      // Task 287 - THE check. Runs before every request this loop can ever
      // make, so a retry can't sneak past it the way it used to.
      if (billedSoFar + chars > maxChars) {
        console.error(
          `\nRefusing ${filename} attempt ${attempt}/${MAX_SYNTHESIS_ATTEMPTS}: billed-so-far ${billedSoFar} + ` +
            `${chars} char(s) would exceed --max-chars ${maxChars}. Stopping run. ` +
            `${billedSoFar} char(s) billed so far, 0 more API calls made.`,
        );
        refusedByBudget = true;
        break outer;
      }
      // Task 266 - re-proven right before THIS clip's paid call, not just
      // once at the top of the run, so a directory that goes unwritable
      // mid-run (disk full, permissions changed) aborts the whole run
      // before spending this clip's characters too.
      deps.verifyWritable(outDir);
      const audio = await deps.synthesize(spoken);
      billedSoFar += chars;
      deps.writeFile(destPath, audio);
      const { ok, analysis } = deps.checkTail(destPath);
      if (ok) {
        console.log(`  ${filename}  "${spoken}"`);
        generated.push(filename);
        break;
      }
      const verdict = `ratio=${analysis.ratio.toFixed(2)} peak=${analysis.recentPeakRms.toFixed(0)}`;
      if (attempt < MAX_SYNTHESIS_ATTEMPTS) {
        console.warn(`  ${filename} failed the tail check (${verdict}) on attempt ${attempt}/${MAX_SYNTHESIS_ATTEMPTS} - re-synthesizing`);
        continue;
      }
      // Refuse to keep a clip this test would flag - regeneration next
      // run is better than shipping a silently truncated line.
      deps.unlinkFile(destPath);
      throw new Error(
        `${filename} ("${spoken}") failed the tail check ${MAX_SYNTHESIS_ATTEMPTS} times in a row (${verdict}) - refusing to save a truncated clip`,
      );
    }
  }

  return { billed: billedSoFar, refusedByBudget, generated };
}

function parseCommaList(argv: string[], name: string): string[] | null {
  const value = findFlagValue(argv, name);
  if (value === null) {
    return null;
  }
  const items = value
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new Error(`${name} was given but resolved to an empty list`);
  }
  return items;
}

// Task 264 - resolves a PRESET_NAMES entry to the lineHash of its VOCATIVE
// clip (Task 263's coronationVocative/getVocative), so `--names` can target
// exactly the clips a subset-recording session actually wants. Rejects
// anything not verbatim in PRESET_NAMES rather than silently hashing an
// arbitrary string that would never match a real missing line.
function vocativeHashForName(name: string): string {
  if (!PRESET_NAMES.includes(name)) {
    throw new Error(`"${name}" is not a PRESET_NAMES entry`);
  }
  const template = getVocative(name);
  const tag = LINE_TAGS[template] ?? null;
  return lineHash(template, tag);
}

// Task 263 - this used to re-walk every pool by hand, which is why it could
// not see anything it hadn't been taught about: the two SEQUENCES (Task 236),
// the duel pool, and - the reason this changed - the coronation lines and the
// per-name VOCATIVE clips, none of which it would ever have generated.
// collectVoiceLineEntries (server/src/socrates.ts) already IS the one
// authoritative walk over every pool, used by /dev/voice and the voice index;
// deriving from it means this script and those two listings can no longer
// disagree about what an "active line" is. Tag resolution below is unchanged
// (LINE_TAGS[template]), and an untagged line - every vocative - hashes
// exactly as it always would have.
function allLineTemplates(): string[] {
  return [...new Set(collectVoiceLineEntries().map((entry) => entry.line))];
}

async function main() {
  const argv = process.argv.slice(2);
  const limit = parseLimit(argv);
  const generate = argv.includes('--generate');
  const maxChars = parseMaxChars(argv);
  const hashesFlag = parseCommaList(argv, '--hashes');
  const namesFlag = parseCommaList(argv, '--names');

  // Task 264 - the subset filter is the union of every way to name one:
  // the legacy ONLY_HASHES env var, --hashes, and --names (resolved through
  // getVocative). Any of them present narrows the plan; none present means
  // "every missing line", exactly as before this task.
  const targetHashes = new Set<string>();
  for (const h of ONLY_HASHES ?? []) targetHashes.add(h);
  for (const h of hashesFlag ?? []) targetHashes.add(h);
  for (const name of namesFlag ?? []) targetHashes.add(vocativeHashForName(name));
  const hasSubsetFilter = ONLY_HASHES !== null || hashesFlag !== null || namesFlag !== null;

  // Task 266 - proven BEFORE anything else: no budget check, no provider
  // construction, no API call happens until this passes. Runs in dry-run
  // mode too (cheap, and it's the "proof no spend can happen here" signal
  // this task's own acceptance criteria check for), not just --generate.
  verifyWritable(OUT_DIR);
  console.log(`Write probe passed: ${path.relative(ROOT, OUT_DIR)} is writable.`);

  const existing = new Set(readdirSync(OUT_DIR));
  const templates = allLineTemplates();

  // Task 43: the filename hashes (template, tag) together, so editing an
  // existing line's tag in socrates.ts changes ONLY that line's filename -
  // it's picked up here as "missing" (and generated fresh) without ever
  // touching the now-orphaned file the old tag produced.
  const toGenerate: Array<{ template: string; tag: string | null; filename: string; hash: string; spoken: string; chars: number }> = [];
  for (const template of templates) {
    const tag = LINE_TAGS[template] ?? null;
    const hash = lineHash(template, tag);
    if (hasSubsetFilter && !targetHashes.has(hash)) {
      continue;
    }
    const filename = `${hash}.mp3`;
    if (existing.has(filename)) {
      continue;
    }
    const stripped = stripPlaceholders(template);
    // Tag is spoken direction for the model only - never part of what's
    // shown on screen (that stays `template`/`stripped`, untouched). It IS
    // part of what's actually sent (and billed) per character, so it's
    // counted here too.
    const spoken = tag ? `${tag} ${stripped}` : stripped;
    toGenerate.push({ template, tag, filename, hash, spoken, chars: spoken.length });
  }

  const batch = limit === null ? toGenerate : toGenerate.slice(0, limit);
  const totalChars = batch.reduce((sum, item) => sum + item.chars, 0);

  const printPlan = () => {
    for (const { hash, chars, spoken } of batch) {
      console.log(`  ${hash}.mp3  ${chars}ch  "${spoken}"`);
    }
  };

  if (batch.length === 0) {
    console.log(`Nothing to generate (${templates.length} line(s) known${hasSubsetFilter ? ', subset filter applied' : ''}, all already have audio). 0 API calls.`);
    return;
  }

  if (!generate) {
    // Task 264 - DRY RUN is the default. No provider is constructed, no
    // network call is made, and ELEVENLABS_API_KEY is never even read.
    console.log(`DRY RUN (default, no API calls) - pass --generate --max-chars <N> to actually synthesize.`);
    console.log(`Would generate ${batch.length} of ${toGenerate.length} missing line(s), ${totalChars} char(s) total.`);
    printPlan();
    return;
  }

  // Task 267 - the second, independent opt-in. Checked BEFORE the budget
  // check and BEFORE the provider is ever constructed, so a run missing it
  // refuses immediately regardless of what --max-chars says or whether
  // credentials are even valid.
  const confirmValue = findFlagValue(argv, '--confirm-spend');
  if (confirmValue !== SPEND_CONFIRM_TOKEN) {
    throw new Error(
      `--generate also requires --confirm-spend ${SPEND_CONFIRM_TOKEN} (typed exactly - this is a ` +
        `second, independent gate proving real intent to spend, not a rename of --generate; a test/` +
        `control run should never carry it). 0 API calls made.`,
    );
  }

  if (maxChars === null) {
    throw new Error('--generate requires an explicit --max-chars <N> budget (e.g. --generate --max-chars 1300)');
  }

  // Task 287 - the old one-time `totalChars > maxChars` gate is gone. It
  // only ever compared the PLAN (one synthesize() per line) and could not
  // see a retry's extra billed request; printing the plan and refusing
  // when the plan alone already tops the budget is now just what happens
  // when generateBatch's per-request check hits the very first request.
  console.log(`Planned ${batch.length} of ${toGenerate.length} missing line(s), ${totalChars} char(s) total (budget ${maxChars}):`);
  printPlan();

  const provider = createElevenLabsProvider();
  console.log(`\nGenerating (budget ${maxChars})...`);
  const result = await generateBatch(batch, maxChars, OUT_DIR, {
    synthesize: (text) => provider.synthesize(text),
    checkTail,
    writeFile: writeFileSync,
    unlinkFile: unlinkSync,
    verifyWritable,
  });

  console.log(
    `\nPlanned ${totalChars} char(s), billed ${result.billed} char(s), refused-by-budget: ${result.refusedByBudget}.`,
  );
  if (result.refusedByBudget) {
    process.exitCode = 1;
  }

  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3'));
  const totalBytes = files.reduce((sum, f) => sum + statSync(path.join(OUT_DIR, f)).size, 0);

  // Task 42c - the longest clip is exactly what SOCRATES_MAX_DURATION_MS
  // (server/src/socratesAudio.ts's estimate cap, and the phase's fallback
  // advance timer) has to comfortably exceed - reported here, every run, so
  // that constant can be sized from a real measurement instead of a guess.
  let longestMs = 0;
  let longestFile = '';
  for (const f of files) {
    const estimatedMs = (statSync(path.join(OUT_DIR, f)).size * 8) / AUDIO_BITRATE_KBPS;
    if (estimatedMs > longestMs) {
      longestMs = estimatedMs;
      longestFile = f;
    }
  }
  const capWarning = longestMs > SOCRATES_MAX_DURATION_MS ? '  ⚠ exceeds SOCRATES_MAX_DURATION_MS - raise the cap' : '';
  console.log(`\n${files.length} file(s) in ${path.relative(ROOT, OUT_DIR)}, ${(totalBytes / 1024).toFixed(1)} KB total.`);
  console.log(`Longest clip: ~${Math.round(longestMs)}ms (${longestFile})${capWarning}`);
}

// Task 287 - guarded so dev/287-voice-budget-check.ts can `import` this
// module (for generateBatch/MAX_SYNTHESIS_ATTEMPTS) without also kicking
// off a real dry-run scan of the whole voice line pool as a side effect of
// import. `tsx dev/generate-voice-lines.ts` still runs main() exactly as
// before - process.argv[1] is this file's own path only when it's the
// entry point, never when another module imports it.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
