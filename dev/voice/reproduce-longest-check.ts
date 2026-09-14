// Task 251 - criterion 2: generate 5 independent clips of the longest of
// the 36 Task 249 truncated lines (117 characters, the longest text among
// them) and report, per attempt, the RAW response byte count vs the written
// file byte count, plus the Task 249 tail test result. No retry here - this
// calls provider.synthesize() directly, once per attempt, so it shows what
// generation looks like BEFORE dev/generate-voice-lines.ts's own retry loop
// would kick in. Writes only under dev/voice/.reproduce-scratch (gitignored,
// see .gitignore's `voice` entry does not cover this - a dedicated ignore
// line was added), never client/public/voice.
//
//   npx tsx dev/voice/reproduce-longest-check.ts
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadDotEnvIfPresent } from './env.ts';
import { createElevenLabsProvider } from './provider.ts';
import { checkTail } from './tailCheck.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
loadDotEnvIfPresent(path.join(ROOT, '.env'));
process.env.ELEVENLABS_VOICE_ID ??= 'NOpBlnGInO9m6vDvFkFC';

// Task 249's own hash 040c8ef98a982d1f - the longest (117-char) text among
// the 36 flagged lines, tag included exactly as spoken generation sends it.
const TAG = '[serious]';
const TEXT =
  "Φτάσαμε στη Συκοφαντία, το θέμα που ξέρω καλύτερα απ' όσο θα ήθελα. Προσέξτε ποιον κοιτάτε στα μάτια από δω και πέρα.";
const SPOKEN = `${TAG} ${TEXT}`;

const OUT_DIR = path.join(ROOT, 'dev', 'voice', '.reproduce-scratch');

async function main(): Promise<void> {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const provider = createElevenLabsProvider();

  console.log(`text: "${SPOKEN}" (${SPOKEN.length} chars)\n`);
  console.log('clip  response-bytes  written-bytes  match  tail-ratio  tail-peak  verdict');

  let flaggedCount = 0;
  for (let i = 1; i <= 5; i++) {
    const audio = await provider.synthesize(SPOKEN);
    const filePath = path.join(OUT_DIR, `clip-${i}.mp3`);
    writeFileSync(filePath, audio);
    const writtenBytes = statSync(filePath).size;
    const { ok, analysis } = checkTail(filePath);
    if (!ok) flaggedCount++;
    console.log(
      `${String(i).padStart(4)}  ${String(audio.length).padStart(14)}  ${String(writtenBytes).padStart(13)}  ` +
        `${audio.length === writtenBytes ? 'yes' : 'NO'}    ${analysis.ratio.toFixed(2).padStart(9)}  ` +
        `${analysis.recentPeakRms.toFixed(0).padStart(9)}  ${ok ? 'ok' : 'FLAGGED (truncated tail)'}`,
    );
  }
  console.log(`\n${flaggedCount} of 5 raw (unretried) attempts flagged by the tail test.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
