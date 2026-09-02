// Task 144 - dev-only: verifies every file in client/public/voice-matrix/
// matches its source clip's duration to within 10ms. Run after
// generate-voice-matrix.ts.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'voice-matrix');

function duration(file: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]).toString().trim();
  return parseFloat(out);
}

const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3'));
const sourceHashes = new Set(files.map((f) => f.split('__')[0]));

let failures = 0;
for (const hash of sourceHashes) {
  const srcDur = duration(path.join(VOICE_DIR, `${hash}.mp3`));
  const variants = files.filter((f) => f.startsWith(`${hash}__`));
  for (const v of variants) {
    const outDur = duration(path.join(OUT_DIR, v));
    const diffMs = Math.abs(outDur - srcDur) * 1000;
    const status = diffMs > 10 ? 'FAIL' : 'ok';
    if (status === 'FAIL') failures++;
    console.log(`${status.padEnd(4)} ${v.padEnd(45)} src=${srcDur.toFixed(3)}s out=${outDur.toFixed(3)}s diff=${diffMs.toFixed(1)}ms`);
  }
}

console.log(`\n${failures} failure(s) out of ${files.length} files checked`);
