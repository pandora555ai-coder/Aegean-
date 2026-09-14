// Task 251 - a permanent, reusable form of Task 249's one-off Python sweep:
// runs dev/voice/tailCheck.ts's exact test over every mp3 in a directory and
// reports which ones fail it. Read-only - never writes, deletes, or
// regenerates anything, so running this against client/public/voice is
// always safe.
//
//   npx tsx dev/voice/bank-tail-check.ts                  # client/public/voice
//   npx tsx dev/voice/bank-tail-check.ts path/to/other/dir
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { checkTail } from './tailCheck.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'client', 'public', 'voice');

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.mp3'))
  .sort();

const flagged: string[] = [];
for (const f of files) {
  const { ok, analysis } = checkTail(path.join(dir, f));
  if (!ok) {
    flagged.push(f);
    console.log(`  FLAGGED ${f}  ratio=${analysis.ratio.toFixed(2)}  peak=${analysis.recentPeakRms.toFixed(0)}`);
  }
}

console.log(`\n${flagged.length} of ${files.length} file(s) in ${path.relative(ROOT, dir)} fail the tail test.`);
