// Task 309 - copy the 16 freshly generated clips out of voice-staging into
// audition-drop/<date>/task309/ (POOL-tag-hash8.mp3) with a README, and
// re-run the generator's own tail check on each. Read-only against staging.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkTail } from './voice/tailCheck.ts';
import { collectVoiceLineEntries } from '../server/src/socrates.js';

const DATE = '2026-09-24';
const hashes = readFileSync(process.argv[2], 'utf8').trim().split(',');
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'audition-drop', DATE, 'task309');
mkdirSync(out, { recursive: true });
const entries = collectVoiceLineEntries();
const lines: string[] = [];
let fails = 0;
for (const h of hashes) {
  const entry = entries.find((e) => e.hash === h);
  if (!entry) throw new Error(`no entry for ${h}`);
  const tag = (entry.tag ?? '[none]').replace(/[[\]]/g, '');
  const pool = entry.moment.replace(/^SLOT \((.*)\)$/, '$1');
  const src = path.join(root, 'client/public/voice-staging', `${h}.mp3`);
  const name = `${pool}-${tag}-${h.slice(0, 8)}.mp3`;
  copyFileSync(src, path.join(out, name));
  const { ok, analysis } = checkTail(src);
  if (!ok) fails += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${h} ${analysis.durationMs}ms ratio=${analysis.ratio.toFixed(2)} ${pool} ${tag}`);
  lines.push(`- **${name}** — "${entry.line}" — pool \`${pool}\` — tag \`${tag}\` — ${(analysis.durationMs / 1000).toFixed(3)} s — tail-check ratio ${analysis.ratio.toFixed(2)} (${ok ? 'pass' : 'FAIL'}) — hash \`${h}\``);
}
writeFileSync(
  path.join(out, 'README.md'),
  `# Audition drop — ${DATE} / Task 309\n\n16 clips from Task 309's real-spend run: 4 replaced lines (CORONATION_SET_C #2, AGORA_WORST #1,\nPALAISTRA_MID_BEST #1, LITHI_CLOSE_OBSERVER #3) + 12 new (DRAW_MID_BEST/WORST, NUMERIC_CLOSE_BEST/WORST).\nNames are POOL-tag-hash8.mp3. The replaced lines' old clips stay in the bank as orphans.\n\n${lines.join('\n')}\n`,
);
console.log(`${hashes.length} copied, ${fails} tail-check failures`);
