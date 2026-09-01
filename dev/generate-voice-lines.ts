// Dev-only: generates one MP3 per Socrates line (server/src/socrates.ts)
// into client/public/voice/. Not part of any workspace build or deploy -
// run manually, commit the resulting MP3s like any other static asset.
//
//   tsx dev/generate-voice-lines.ts             generate everything missing
//   tsx dev/generate-voice-lines.ts --limit 3    generate at most 3 new files
//
// ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID come from the environment (or a
// gitignored repo-root .env) - never committed.
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AUDIO_BITRATE_KBPS, SOCRATES_MAX_DURATION_MS } from '@game/shared';
import {
  LINES,
  INTRO_LINES,
  LINE_TAGS,
  GAME_INTRO_LINES,
  STAGE_INTRO_LINES,
  WINNER_LINES,
  TRIAL_INTRO_LINES,
  DRAW_LINES,
  NUMERIC_LINES,
} from '../server/src/socrates.ts';
import { loadDotEnvIfPresent } from './voice/env.ts';
import { createElevenLabsProvider } from './voice/provider.ts';
import { lineHash, stripPlaceholders } from './voice/text.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'voice');

loadDotEnvIfPresent(path.join(ROOT, '.env'));

function parseLimit(argv: string[]): number | null {
  const flag = argv.find((a) => a === '--limit' || a.startsWith('--limit='));
  if (!flag) {
    return null;
  }
  const value = flag.includes('=') ? flag.split('=')[1] : argv[argv.indexOf(flag) + 1];
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid --limit value: ${value}`);
  }
  return n;
}

function allLineTemplates(): string[] {
  const templates = new Set<string>();
  for (const pool of Object.values(LINES)) {
    for (const line of pool) {
      templates.add(line);
    }
  }
  for (const pool of Object.values(INTRO_LINES)) {
    for (const line of pool) {
      templates.add(line);
    }
  }
  // Task 48 - GAME_INTRO/STAGE_INTRO/WINNER, generated the same way as
  // every other pool: one MP3 per (template, tag) pair.
  for (const line of GAME_INTRO_LINES) {
    templates.add(line);
  }
  for (const pool of Object.values(STAGE_INTRO_LINES)) {
    for (const line of pool ?? []) {
      templates.add(line);
    }
  }
  for (const line of WINNER_LINES) {
    templates.add(line);
  }
  // Task 139 - the draw/numeric moment pools and the trial's own intro pool.
  for (const line of TRIAL_INTRO_LINES) {
    templates.add(line);
  }
  for (const pool of Object.values(DRAW_LINES)) {
    for (const line of pool) {
      templates.add(line);
    }
  }
  for (const pool of Object.values(NUMERIC_LINES)) {
    for (const line of pool) {
      templates.add(line);
    }
  }
  return [...templates];
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  mkdirSync(OUT_DIR, { recursive: true });

  const existing = new Set(readdirSync(OUT_DIR));
  const templates = allLineTemplates();

  // Task 43: the filename hashes (template, tag) together, so editing an
  // existing line's tag in socrates.ts changes ONLY that line's filename -
  // it's picked up here as "missing" (and generated fresh) without ever
  // touching the now-orphaned file the old tag produced.
  const toGenerate: Array<{ template: string; tag: string | null; filename: string }> = [];
  for (const template of templates) {
    const tag = LINE_TAGS[template] ?? null;
    const filename = `${lineHash(template, tag)}.mp3`;
    if (!existing.has(filename)) {
      toGenerate.push({ template, tag, filename });
    }
  }

  const batch = limit === null ? toGenerate : toGenerate.slice(0, limit);

  if (batch.length === 0) {
    console.log(`Nothing to generate (${templates.length} lines, all already have audio). 0 API calls.`);
  } else {
    const provider = createElevenLabsProvider();
    console.log(`Generating ${batch.length} of ${toGenerate.length} missing line(s)...`);
    for (const { template, tag, filename } of batch) {
      const stripped = stripPlaceholders(template);
      // Tag is spoken direction for the model only - never part of what's
      // shown on screen (that stays `template`/`stripped`, untouched).
      const spoken = tag ? `${tag} ${stripped}` : stripped;
      const audio = await provider.synthesize(spoken);
      writeFileSync(path.join(OUT_DIR, filename), audio);
      console.log(`  ${filename}  "${spoken}"`);
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
  console.log(`\n${files.length} file(s) in client/public/voice, ${(totalBytes / 1024).toFixed(1)} KB total.`);
  console.log(`Longest clip: ~${Math.round(longestMs)}ms (${longestFile})${capWarning}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
