import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_BITRATE_KBPS, SOCRATES_DURATION_MS, SOCRATES_MAX_DURATION_MS, SOCRATES_VOICE_DIR, lineHash } from '@game/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same directory dev/generate-voice-lines.ts writes into, and the same one
// Express/Vite serve at /voice/* - the client only ever needs the URL, the
// server reads the file directly off disk to size it.
const VOICE_DIR = path.join(__dirname, '../../client/public', SOCRATES_VOICE_DIR);

// Task 42b - how long the SOCRATES phase holds the screen for a given line,
// estimated from its pre-generated audio file's size rather than a flat 4s.
// Constant-bitrate MP3 (the ElevenLabs output format is CBR), so duration is
// just bytes*8/bitrate - no decoding, no new dependency. Missing/unreadable
// file, or no line at all, falls back to SOCRATES_DURATION_MS - the phase
// (and the game) must never hang on a file that isn't there.
export function resolveSocratesDurationMs(template: string | null): number {
  if (!template) {
    return SOCRATES_DURATION_MS;
  }
  try {
    const filePath = path.join(VOICE_DIR, `${lineHash(template)}.mp3`);
    const { size } = statSync(filePath);
    const estimatedMs = (size * 8) / AUDIO_BITRATE_KBPS;
    return Math.min(SOCRATES_MAX_DURATION_MS, Math.max(SOCRATES_DURATION_MS, Math.round(estimatedMs)));
  } catch {
    return SOCRATES_DURATION_MS;
  }
}
