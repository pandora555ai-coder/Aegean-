import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_BITRATE_KBPS,
  SOCRATES_BACKSTOP_MARGIN_MS,
  SOCRATES_BACKSTOP_UNKNOWN_MS,
  SOCRATES_DURATION_MS,
  SOCRATES_VOICE_DIR,
  lineHash,
} from '@game/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same directory dev/generate-voice-lines.ts writes into, and the same one
// Express/Vite serve at /voice/* - the client only ever needs the URL, the
// server reads the file directly off disk to size it.
const REAL_VOICE_DIR = path.join(__dirname, '../../client/public', SOCRATES_VOICE_DIR);

// Task 263 - a dev-only EXTRA directory searched BEFORE the real one, same
// NODE_ENV-guarded env-hook idiom as questions.ts's FORCE_QUESTION_ID.
//
// It exists because in the dev checkout client/public/voice is a SYMLINK
// straight into /opt/party-game's own voice dir (the rsync target), so there
// is no way to put a test clip "on disk" for this server to find without
// writing into PRODUCTION. A harness proving the vocative-splice branch needs
// exactly that, so it points this at a throwaway directory instead.
//
// Deliberately a SEARCH PATH rather than a replacement: an override holding
// one test clip must not make every OTHER line look missing, which would move
// every beat in the game onto the unknown-duration backstop and quietly
// change the timings the harness is there to measure.
const DEV_VOICE_DIR =
  process.env.NODE_ENV !== 'production' && process.env.AEGEAN_DEV_VOICE_DIR
    ? path.resolve(process.env.AEGEAN_DEV_VOICE_DIR)
    : null;
const VOICE_DIRS = DEV_VOICE_DIR ? [DEV_VOICE_DIR, REAL_VOICE_DIR] : [REAL_VOICE_DIR];

// Task 238 - the one place a line's clip is measured, and whether it could be
// measured AT ALL. `known: false` means there is no file to size (no line, or
// a missing/unreadable one) - which is a different situation from a genuinely
// short clip, and the two used to be indistinguishable because both returned
// the flat SOCRATES_DURATION_MS floor.
export interface SocratesClip {
  durationMs: number;
  known: boolean;
}

// Task 42b - how long a given line's pre-generated audio actually runs,
// estimated from the file's SIZE rather than by decoding it. Constant-bitrate
// MP3 (the ElevenLabs output format is CBR), so duration is just
// bytes*8/bitrate - no decoding, no new dependency. Measured against ffprobe
// over all 283 mp3s in Task 238: the estimate is within 32ms on every file and
// always runs slightly HIGH, which is the safe direction for a backstop
// derived from it.
// `tag` (Task 43) must match whatever the line was picked with - it's folded
// into the hash, so the wrong tag looks up the wrong (or a missing) file.
export function resolveSocratesClip(template: string | null, tag: string | null = null): SocratesClip {
  if (!template) {
    return { durationMs: SOCRATES_DURATION_MS, known: false };
  }
  const filename = `${lineHash(template, tag)}.mp3`;
  for (const dir of VOICE_DIRS) {
    try {
      const { size } = statSync(path.join(dir, filename));
      const estimatedMs = (size * 8) / AUDIO_BITRATE_KBPS;
      // The floor stays (a very short clip still needs a moment to read). The
      // CEILING is gone as of Task 238: clamping here is what made the TV's own
      // countdown claim 11.0s for a 13.9s clip.
      return { durationMs: Math.max(SOCRATES_DURATION_MS, Math.round(estimatedMs)), known: true };
    } catch {
      // Not in this directory - try the next one, then give up below.
    }
  }
  return { durationMs: SOCRATES_DURATION_MS, known: false };
}

// Task 263 - "is this line's clip actually on disk?", the one question the
// coronation's opener branches on (named variant iff the winner's vocative
// clip exists). Deliberately expressed through resolveSocratesClip rather
// than its own statSync, so the answer can never disagree with the duration
// the same file would report - and so the dev search path above covers both.
export function hasSocratesClip(template: string | null, tag: string | null = null): boolean {
  return resolveSocratesClip(template, tag).known;
}

// The span the TV renders its Socrates countdown/progress bar against. Same
// value this has always returned EXCEPT that it is no longer capped at
// SOCRATES_MAX_DURATION_MS, so the four wired clips that run past the old cap
// now report their true length instead of a truncated one.
export function resolveSocratesDurationMs(template: string | null, tag: string | null = null): number {
  return resolveSocratesClip(template, tag).durationMs;
}

// Task 238 - what the phase's REAL advance timer is armed at. NOT the expected
// audio length: the normal way out of a SOCRATES beat is still the client's
// socrates:audio_ended ack, fired when the clip genuinely finishes. This is
// only the backstop for an ack that never arrives at all (host muted, ack
// lost, audio wedged), so it must sit comfortably PAST the clip rather than
// near it - clip + SOCRATES_BACKSTOP_MARGIN_MS, leaving room for the
// fetch/decode latency before playback even starts.
//
// A clip whose length can't be measured gets the flat
// SOCRATES_BACKSTOP_UNKNOWN_MS instead of "the 4s floor + margin", which would
// cut off any real line that happens to be missing from this server's disk.
// This does NOT slow the missing-clip case down in practice: a missing file
// makes the CLIENT call onEnded() immediately (Task 154, useGameAudio.ts), so
// that beat still ends on an ack at ~0ms and never reaches this timer.
export function socratesBackstopMs(template: string | null, tag: string | null = null): number {
  const clip = resolveSocratesClip(template, tag);
  return clip.known ? clip.durationMs + SOCRATES_BACKSTOP_MARGIN_MS : SOCRATES_BACKSTOP_UNKNOWN_MS;
}
