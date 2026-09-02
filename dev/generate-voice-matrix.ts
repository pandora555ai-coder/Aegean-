// Task 144 - dev-only, throwaway: DSP-only "older, deeper Socrates" A/B
// matrix over 4 EXISTING mp3s (never ElevenLabs, never voice:generate).
// Every variant uses ffmpeg's rubberband filter (pitch-shift with
// tempo LOCKED to 1.0 and formant=preserved) - never bare asetrate, which
// shifts pitch by changing playback rate and therefore duration too.
// source.onended (client/src/hooks/useGameAudio.ts) drives how long a
// SOCRATES phase holds on screen, so duration must be bit-for-bit
// unchanged - see verify-voice-matrix.ts for the check.
//
//   npx tsx dev/generate-voice-matrix.ts
//
// Output goes to client/public/voice-matrix/ (gitignored, real directory -
// NOT client/public/voice, which is read-only and, on a dev checkout, a
// symlink to the real voice bank).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'voice-matrix');

// Picked in the task report by SPAN alone (ratings live in browser
// localStorage, unreadable from here): one long (8.2-8.9s), one short
// (<3s), one from the 49 new draw/numeric lines, one from the original 186.
const CLIPS = [
  { hash: 'f8fd43b55abb4ded', label: 'long-old', moment: 'GENERIC_INTRO' },
  { hash: '70a4306f0a9a8091', label: 'short-old', moment: 'FINAL_QUESTION' },
  { hash: '0b70f382e31dbd39', label: 'new49', moment: 'ALL_CLUSTERED' },
  { hash: '74d727dd9e68ce2c', label: 'old186', moment: 'STUCK_IN_LAST' },
];

// Subtle -> clearly deeper. tempo is never set (stays 1.0 = duration
// unchanged); formant=preserved keeps the shift from sounding like a
// chipmunk-in-reverse; bass/treble lean the timbre older on top of the
// pitch move itself.
const VARIANTS = [
  { tag: 'v1_p-1st_b+3', af: 'rubberband=pitch=0.9439:formant=preserved,bass=g=3:f=200,treble=g=-1:f=6000' },
  { tag: 'v2_p-2st_b+5', af: 'rubberband=pitch=0.8909:formant=preserved,bass=g=5:f=200,treble=g=-2:f=6000' },
  { tag: 'v3_p-3st_b+7', af: 'rubberband=pitch=0.8409:formant=preserved,bass=g=7:f=180,treble=g=-3:f=5500' },
  { tag: 'v4_p-4st_b+9', af: 'rubberband=pitch=0.7937:formant=preserved,bass=g=9:f=160,treble=g=-4:f=5000' },
];

mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
for (const clip of CLIPS) {
  const src = path.join(VOICE_DIR, `${clip.hash}.mp3`);
  if (!existsSync(src)) {
    throw new Error(`missing source mp3: ${src}`);
  }
  const origOut = path.join(OUT_DIR, `${clip.hash}__${clip.label}__orig.mp3`);
  copyFileSync(src, origOut);
  written++;
  console.log(`wrote ${path.basename(origOut)}`);

  for (const variant of VARIANTS) {
    const out = path.join(OUT_DIR, `${clip.hash}__${clip.label}__${variant.tag}.mp3`);
    execFileSync('ffmpeg', ['-y', '-i', src, '-af', variant.af, '-c:a', 'libmp3lame', '-q:a', '2', out], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    written++;
    console.log(`wrote ${path.basename(out)}`);
  }
}

console.log(`\ndone: ${written} files in ${OUT_DIR}`);
