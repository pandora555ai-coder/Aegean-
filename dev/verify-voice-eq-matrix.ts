// Task 145 - dev-only: verifies every file in
// client/public/voice-matrix-eq/ matches its source clip's duration to
// within 10ms, AND reports peak level (dBFS) so any variant that clips
// (peak >= 0.0 dBFS) is surfaced rather than silently normalised away.
// Run after generate-voice-eq-matrix.ts.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'voice-matrix-eq');

function duration(file: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]).toString().trim();
  return parseFloat(out);
}

function peakDb(file: string): number {
  // volumedetect prints its stats (max_volume/mean_volume) to STDERR, not
  // stdout - execFileSync only captures stdout, so this needs spawnSync.
  const result = spawnSync('ffmpeg', ['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const out = result.stderr.toString();
  const match = /max_volume:\s*(-?\d+(\.\d+)?)\s*dB/.exec(out);
  if (!match) {
    throw new Error(`could not parse max_volume for ${file}`);
  }
  return parseFloat(match[1]);
}

const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3'));
const sourceHashes = new Set(files.map((f) => f.split('__')[0]));

let durationFailures = 0;
let clipCount = 0;
for (const hash of sourceHashes) {
  const srcFile = path.join(VOICE_DIR, `${hash}.mp3`);
  const srcDur = duration(srcFile);
  const srcPeak = peakDb(srcFile);
  console.log(`\n${hash} (source): dur=${srcDur.toFixed(3)}s peak=${srcPeak.toFixed(1)}dB`);
  const variants = files.filter((f) => f.startsWith(`${hash}__`)).sort();
  for (const v of variants) {
    const outFile = path.join(OUT_DIR, v);
    const outDur = duration(outFile);
    const outPeak = peakDb(outFile);
    const diffMs = Math.abs(outDur - srcDur) * 1000;
    const durStatus = diffMs > 10 ? 'DUR-FAIL' : 'ok';
    const clips = outPeak >= 0.0;
    if (durStatus === 'DUR-FAIL') durationFailures++;
    if (clips) clipCount++;
    console.log(
      `  ${durStatus.padEnd(9)} ${v.padEnd(55)} dur=${outDur.toFixed(3)}s diff=${diffMs.toFixed(1)}ms peak=${outPeak.toFixed(1)}dB${clips ? '  <-- CLIPS' : ''}`,
    );
  }
}

console.log(`\n${durationFailures} duration failure(s), ${clipCount} clipping variant(s), out of ${files.length} files checked`);
