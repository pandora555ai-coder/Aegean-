// Dev-only: regenerates the BLITZ_STATEMENTS block in shared/src/index.ts
// from blitz-statements.md at the repo root, which is the source of truth.
// blitz-statements.md is MARKDOWN - headers, category sections and trailing
// prose - so this parses it line-by-line and keeps ONLY lines matching
//
//   /^([ΣΛ])\s\s(\S.+)$/     Σ  <statement>   ->  { text, isTrue: true }
//                            Λ  <statement>   ->  { text, isTrue: false }
//
// Everything else is ignored. Run it, then commit the .md and index.ts
// together:
//
//   npm run blitz:generate
//
// Task 69. Fails loudly (non-zero exit, no write) if the parse does not
// yield exactly 218 statements split 109/109 - that balance is a spec
// guarantee the real mode will rely on.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_FILE = path.join(ROOT, 'blitz-statements.md');
const OUT_FILE = path.join(ROOT, 'shared', 'src', 'index.ts');
const BEGIN = '// <BLITZ_STATEMENTS:GENERATED>';
const END = '// </BLITZ_STATEMENTS:GENERATED>';
const LINE_RE = /^([ΣΛ])\s\s(\S.+)$/;

interface Parsed {
  text: string;
  isTrue: boolean;
}

function parse(md: string): Parsed[] {
  const out: Parsed[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const m = raw.match(LINE_RE);
    if (!m) continue;
    out.push({ text: m[2], isTrue: m[1] === 'Σ' });
  }
  return out;
}

function render(rows: Parsed[]): string {
  const body = rows
    .map((r) => `  { text: ${JSON.stringify(r.text)}, isTrue: ${r.isTrue} },`)
    .join('\n');
  return `${BEGIN}\nexport const BLITZ_STATEMENTS: readonly BlitzStatement[] = [\n${body}\n];\n${END}`;
}

const md = readFileSync(SRC_FILE, 'utf8');
const rows = parse(md);
const trueCount = rows.filter((r) => r.isTrue).length;
const falseCount = rows.length - trueCount;

console.log(`parsed ${rows.length} statements from blitz-statements.md`);
console.log(`  isTrue:true  (Σ) = ${trueCount}`);
console.log(`  isTrue:false (Λ) = ${falseCount}`);

if (rows.length !== 218 || trueCount !== 109 || falseCount !== 109) {
  console.error('ABORT: expected exactly 218 statements, 109 Σ and 109 Λ. Nothing written.');
  process.exit(1);
}

const current = readFileSync(OUT_FILE, 'utf8');
const beginAt = current.indexOf(BEGIN);
const endAt = current.indexOf(END);
if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
  console.error(`ABORT: could not find the ${BEGIN} ... ${END} markers in ${OUT_FILE}.`);
  process.exit(1);
}

const next =
  current.slice(0, beginAt) + render(rows) + current.slice(endAt + END.length);

if (next === current) {
  console.log('shared/src/index.ts already up to date.');
} else {
  writeFileSync(OUT_FILE, next);
  console.log('wrote BLITZ_STATEMENTS block into shared/src/index.ts');
}
