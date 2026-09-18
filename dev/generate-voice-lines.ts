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
//   tsx dev/generate-voice-lines.ts --generate --max-chars 5000
//       Actually synthesizes the missing lines. BOTH flags are required:
//       --generate is the explicit opt-in, --max-chars is the explicit
//       budget. If the planned total exceeds --max-chars, the run REFUSES
//       outright (prints the overage, makes zero API calls, writes zero
//       clips) rather than generating a partial subset silently.
//
//   tsx dev/generate-voice-lines.ts --hashes abc123,def456
//   tsx dev/generate-voice-lines.ts --names Άρης,Νίκη,Τάκης
//       Restrict the plan (dry run) or the generation (with --generate
//       --max-chars) to a named subset - specific lineHash values, or
//       specific PRESET_NAMES entries resolved to their VOCATIVE clip
//       (Task 263). Lets a handful of vocatives be recorded without
//       touching the other ~195 missing lines. Combine with --generate/
//       --max-chars exactly as the full run above.
//
//   tsx dev/generate-voice-lines.ts --generate --max-chars 500 --limit 3
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
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AUDIO_BITRATE_KBPS, PRESET_NAMES, SOCRATES_MAX_DURATION_MS, getVocative } from '@game/shared';
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
const MAX_SYNTHESIS_ATTEMPTS = 3;

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
const OUT_DIR = process.env.ALT_OUTPUT_DIR
  ? path.resolve(ROOT, process.env.ALT_OUTPUT_DIR)
  : path.join(ROOT, 'client', 'public', 'voice-staging');

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

  if (maxChars === null) {
    throw new Error('--generate requires an explicit --max-chars <N> budget (e.g. --generate --max-chars 1300)');
  }

  if (totalChars > maxChars) {
    const overage = totalChars - maxChars;
    console.log(`Planned ${batch.length} of ${toGenerate.length} missing line(s), ${totalChars} char(s) total:`);
    printPlan();
    console.error(`\nRefusing to generate: ${totalChars} chars exceeds --max-chars ${maxChars} by ${overage} char(s). 0 API calls made, 0 clips written.`);
    process.exitCode = 1;
    return;
  }

  const provider = createElevenLabsProvider();
  console.log(`Generating ${batch.length} of ${toGenerate.length} missing line(s), ${totalChars} char(s) total (budget ${maxChars})...`);
  for (const { filename, spoken } of batch) {
    const destPath = path.join(OUT_DIR, filename);
    let attempt = 0;
    for (;;) {
      attempt++;
      // Task 266 - re-proven right before THIS clip's paid call, not just
      // once at the top of the run, so a directory that goes unwritable
      // mid-run (disk full, permissions changed) aborts the whole run
      // before spending this clip's characters too.
      verifyWritable(OUT_DIR);
      const audio = await provider.synthesize(spoken);
      writeFileSync(destPath, audio);
      const { ok, analysis } = checkTail(destPath);
      if (ok) {
        console.log(`  ${filename}  "${spoken}"`);
        break;
      }
      const verdict = `ratio=${analysis.ratio.toFixed(2)} peak=${analysis.recentPeakRms.toFixed(0)}`;
      if (attempt < MAX_SYNTHESIS_ATTEMPTS) {
        console.warn(`  ${filename} failed the tail check (${verdict}) on attempt ${attempt}/${MAX_SYNTHESIS_ATTEMPTS} - re-synthesizing`);
        continue;
      }
      // Refuse to keep a clip this test would flag - regeneration next
      // run is better than shipping a silently truncated line.
      unlinkSync(destPath);
      throw new Error(
        `${filename} ("${spoken}") failed the tail check ${MAX_SYNTHESIS_ATTEMPTS} times in a row (${verdict}) - refusing to save a truncated clip`,
      );
    }
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

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
