// Task 36a - generates the seven crowd sound-effect files (three loops, four
// one-shots) via ElevenLabs' sound-generation endpoint into
// client/public/crowd/, then converts each MP3 to OGG (ffmpeg, libvorbis
// q5) beside it. Dev-only, run manually:
//
//   tsx dev/generate-crowd-sfx.ts
//
// This is the ONE task allowed to call ElevenLabs sound generation
// (CLAUDE.md forbids it otherwise). Hard cap: 14 requests total (7 sounds,
// at most one retry each) - the script stops itself at that count. Any
// error, network failure, or rejected parameter aborts immediately; no
// retry loops, no parameter guessing.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadDotEnvIfPresent } from './voice/env.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
loadDotEnvIfPresent(path.join(ROOT, '.env'));

const OUT_DIR = path.join(ROOT, 'client', 'public', 'crowd');
mkdirSync(OUT_DIR, { recursive: true });

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  throw new Error('Set ELEVENLABS_API_KEY (e.g. in a repo-root .env file, gitignored) before running this.');
}

const SETTING =
  'Ancient Greek open-air stone theatre at dusk, a live audience seated on stone tiers. ' +
  'No words, no music, no instruments, no birds, no wind.';

interface SoundSpec {
  name: string;
  prompt: string;
  durationSeconds: number;
  loop: boolean;
}

const SOUNDS: SoundSpec[] = [
  {
    name: 'murmur',
    prompt: `${SETTING} A few hundred people seated, low continuous conversational hum, an occasional distant cough, no words intelligible.`,
    durationSeconds: 30,
    loop: true,
  },
  {
    name: 'unrest',
    prompt: `${SETTING} The same seated crowd grown restless: bodies shifting on stone, murmur rising and falling in waves, isolated shouts, feet scraping stone, mounting tension.`,
    durationSeconds: 30,
    loop: true,
  },
  {
    name: 'roar',
    prompt: `${SETTING} The crowd on its feet, a sustained roar, rhythmic stamping and clapping in unison. No whistles, no modern stadium sound.`,
    durationSeconds: 30,
    loop: true,
  },
  {
    name: 'cheer-small',
    prompt: `${SETTING} A brief warm approving swell from the crowd: an "ah" of pleasure and scattered applause, then it fades.`,
    durationSeconds: 3,
    loop: false,
  },
  {
    name: 'cheer-big',
    prompt: `${SETTING} A full eruption from the crowd: shouts, cheering and stamping all at once, with a big decay tail.`,
    durationSeconds: 3,
    loop: false,
  },
  {
    name: 'boo-small',
    prompt: `${SETTING} A brief disapproving groan from the crowd with scattered jeers, then it fades.`,
    durationSeconds: 3,
    loop: false,
  },
  {
    name: 'boo-big',
    prompt: `${SETTING} Loud sustained booing and hissing from the whole theatre.`,
    durationSeconds: 3,
    loop: false,
  },
];

const MAX_CALLS = 14;
let callsMade = 0;

async function requestSoundOnce(spec: SoundSpec): Promise<{ buffer: Buffer; grantedDuration: number }> {
  callsMade += 1;
  if (callsMade > MAX_CALLS) {
    throw new Error(`Hard cap of ${MAX_CALLS} ElevenLabs calls reached before finishing "${spec.name}".`);
  }
  const body: Record<string, unknown> = {
    text: spec.prompt,
    duration_seconds: spec.durationSeconds,
    model_id: 'eleven_text_to_sound_v2',
  };
  if (spec.loop) {
    body.loop = true;
  }
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs sound-generation failed for "${spec.name}" (${res.status}): ${await res.text()}`);
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), grantedDuration: spec.durationSeconds };
}

async function requestSoundWithOneRetry(spec: SoundSpec): Promise<{ buffer: Buffer; grantedDuration: number }> {
  try {
    return await requestSoundOnce(spec);
  } catch (err) {
    console.error(`First attempt for "${spec.name}" failed: ${(err as Error).message}. Retrying once.`);
    return await requestSoundOnce(spec);
  }
}

async function fetchCreditBalance(): Promise<{ characterCount: number; characterLimit: number } | null> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey! },
    });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as { character_count: number; character_limit: number };
    return { characterCount: json.character_count, characterLimit: json.character_limit };
  } catch {
    return null;
  }
}

function mp3ToOgg(mp3Path: string, oggPath: string): void {
  execFileSync('ffmpeg', ['-y', '-i', mp3Path, '-c:a', 'libvorbis', '-q:a', '5', oggPath], { stdio: 'pipe' });
}

async function main(): Promise<void> {
  const before = await fetchCreditBalance();
  console.log(
    before
      ? `Credit balance BEFORE: ${before.characterCount}/${before.characterLimit} characters used.`
      : 'Credit balance BEFORE: unavailable (subscription endpoint did not respond ok).',
  );

  const results: { name: string; grantedDuration: number }[] = [];
  const failures: { name: string; error: string }[] = [];

  for (const spec of SOUNDS) {
    try {
      const { buffer, grantedDuration } = await requestSoundWithOneRetry(spec);
      const mp3Path = path.join(OUT_DIR, `${spec.name}.mp3`);
      const oggPath = path.join(OUT_DIR, `${spec.name}.ogg`);
      writeFileSync(mp3Path, buffer);
      mp3ToOgg(mp3Path, oggPath);
      results.push({ name: spec.name, grantedDuration });
      console.log(`OK ${spec.name}: requested ${spec.durationSeconds}s, wrote ${mp3Path} and ${oggPath}`);
    } catch (err) {
      failures.push({ name: spec.name, error: (err as Error).message });
      console.error(`FAILED ${spec.name}: ${(err as Error).message}`);
      break; // stop on first unrecoverable error per task instructions
    }
  }

  const after = await fetchCreditBalance();
  console.log(
    after
      ? `Credit balance AFTER: ${after.characterCount}/${after.characterLimit} characters used.`
      : 'Credit balance AFTER: unavailable (subscription endpoint did not respond ok).',
  );

  console.log(`\nSummary: ${callsMade} ElevenLabs calls made (cap ${MAX_CALLS}).`);
  console.log(`Succeeded: ${results.map((r) => r.name).join(', ') || '(none)'}`);
  if (failures.length > 0) {
    console.log(`Failed: ${failures.map((f) => `${f.name} (${f.error})`).join('; ')}`);
    process.exitCode = 1;
  }
}

main();
