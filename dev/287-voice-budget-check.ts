// Task 287 - proves the per-request budget guard in
// dev/generate-voice-lines.ts's generateBatch(): billed-so-far is checked
// against --max-chars before EVERY synthesize() call, first attempts and
// tail-check retries alike - not just once against the planned total
// (Task 279's defect: a tail-check retry bills as its own, separate
// request, and the old one-time totalChars > maxChars gate never saw it).
//
// MOCKED THROUGHOUT. No ElevenLabs API call anywhere in this file, not even
// a "control" run (the Task 266 incident this rule exists because of).
// generateBatch takes its provider/tailCheck/fs calls as injected `deps`,
// so this harness never calls createElevenLabsProvider, never reads
// ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID, and never touches a real
// directory - writeFile/unlinkFile/verifyWritable below are no-op
// recorders, and outDir is a path that is never actually read or written.
//
//   npx tsx dev/287-voice-budget-check.ts
import { generateBatch, MAX_SYNTHESIS_ATTEMPTS, type GenerationBatchItem, type GenerationDeps } from './generate-voice-lines.ts';

let failures = 0;

function assertEqual<T>(label: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

function assert(label: string, ok: boolean): void {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`);
  if (!ok) failures++;
}

function makeBatch(): GenerationBatchItem[] {
  return [
    { filename: 'a.mp3', spoken: 'a'.repeat(40), chars: 40 },
    { filename: 'b.mp3', spoken: 'b'.repeat(40), chars: 40 },
    { filename: 'c.mp3', spoken: 'c'.repeat(40), chars: 40 },
  ];
}

// A deps rig recording exactly what would have been billed/written, with
// zero real I/O and zero network. `alwaysFail` names filenames whose
// (mocked) tail check never passes - the "fails tail check twice" scenario
// wants a filename that WOULD keep failing every attempt it's ever given,
// so a guard that only queries it once proves the guard stopped the retry
// before it could be billed, not that the file happened to pass early.
function makeDeps(alwaysFail: Set<string>): {
  deps: GenerationDeps;
  synthesizeCalls: string[];
  checkTailCallsByFile: Map<string, number>;
} {
  const synthesizeCalls: string[] = [];
  const checkTailCallsByFile = new Map<string, number>();

  const deps: GenerationDeps = {
    async synthesize(text) {
      synthesizeCalls.push(text);
      return Buffer.from('fake-mp3-bytes');
    },
    checkTail(mp3Path) {
      const filename = mp3Path.split('/').pop()!;
      checkTailCallsByFile.set(filename, (checkTailCallsByFile.get(filename) ?? 0) + 1);
      const ok = !alwaysFail.has(filename);
      return { ok, analysis: { lastWindowRms: 100, recentPeakRms: 1000, ratio: ok ? 0.1 : 0.9, durationMs: 1000 } };
    },
    writeFile() {
      // no real fs write - proves 0 disk I/O
    },
    unlinkFile() {
      // no real fs unlink
    },
    verifyWritable() {
      // no real directory probe
    },
  };

  return { deps, synthesizeCalls, checkTailCallsByFile };
}

async function scenario2() {
  console.log('\n=== Scenario 2: cap=100, three 40ch lines, line b fails the tail check (would retry) ===');
  const { deps, synthesizeCalls, checkTailCallsByFile } = makeDeps(new Set(['b.mp3']));
  const result = await generateBatch(makeBatch(), 100, '/fake-out-dir', deps);

  console.log(`  ledger: synthesize() calls in order = ${JSON.stringify(synthesizeCalls.map((s) => s.length))} char(s) each`);
  console.log(`  ledger: billed-so-far after each call = 40, 80 (a.mp3 attempt1, b.mp3 attempt1) - b.mp3 attempt2 REFUSED (80+40=120 > 100)`);
  console.log(`  ledger: checkTail() calls per file = ${JSON.stringify(Object.fromEntries(checkTailCallsByFile))}`);
  console.log(`  result.billed = ${result.billed}, result.generated = ${JSON.stringify(result.generated)}, result.refusedByBudget = ${result.refusedByBudget}`);
  console.log(`  exit code main() would set (mirrors "if (result.refusedByBudget) process.exitCode = 1"): ${result.refusedByBudget ? 1 : 0}`);

  assertEqual('exactly 2 synthesize() calls made (a.mp3, b.mp3 attempt1) - b.mp3 attempt2 never reached the API', synthesizeCalls.length, 2);
  assertEqual('b.mp3 checkTail() queried exactly once - its retry was refused before a second request could be billed', checkTailCallsByFile.get('b.mp3'), 1);
  assertEqual('billed total', result.billed, 80);
  assert('billed total <= cap (100) - the actual defect under test', result.billed <= 100);
  assertEqual('refusedByBudget', result.refusedByBudget, true);
  assertEqual('run stopped at b.mp3 - c.mp3 never attempted', result.generated, ['a.mp3']);
  assertEqual('exit code would be 1', result.refusedByBudget ? 1 : 0, 1);
}

async function scenario3() {
  console.log("\n=== Scenario 3: cap=200, three 40ch lines, no failures - today's behavior, unchanged ===");
  const { deps, synthesizeCalls } = makeDeps(new Set());
  const result = await generateBatch(makeBatch(), 200, '/fake-out-dir', deps);

  console.log(`  ledger: synthesize() calls = ${synthesizeCalls.length}, billed = ${result.billed}, generated = ${JSON.stringify(result.generated)}`);

  assertEqual('synthesize() called exactly once per line - no retries', synthesizeCalls.length, 3);
  assertEqual('all 3 lines generated', result.generated, ['a.mp3', 'b.mp3', 'c.mp3']);
  assertEqual('billed == planned (120)', result.billed, 120);
  assertEqual('refusedByBudget', result.refusedByBudget, false);
}

async function main() {
  console.log(`MAX_SYNTHESIS_ATTEMPTS = ${MAX_SYNTHESIS_ATTEMPTS} (imported from the generator, not redefined here)`);
  await scenario2();
  await scenario3();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
