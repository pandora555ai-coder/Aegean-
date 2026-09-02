// Task 145 - dev-only, throwaway: EQ/dynamics-only "older, deeper Socrates"
// A/B matrix over the SAME 4 source clips as Task 144's pitch-shift matrix
// (dev/generate-voice-matrix.ts), so the two are directly comparable. That
// matrix was rejected as sounding artificial - this one touches spectral
// balance and compression only. NO pitch change, NO asetrate, NO
// regeneration - every filter here either shelves/peaks frequency content
// (bass/treble/equalizer) or compresses dynamics (acompressor); none of
// them touch playback rate, so duration is untouched by construction (see
// verify-voice-eq-matrix.ts for the check anyway).
//
//   npx tsx dev/generate-voice-eq-matrix.ts
//
// Output goes to client/public/voice-matrix-eq/ (gitignored, real
// directory - NOT client/public/voice, read-only, and NOT Task 144's
// client/public/voice-matrix/, untouched by this script).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'voice-matrix-eq');

// Identical to Task 144's CLIPS (dev/generate-voice-matrix.ts) - same
// hashes, same labels, so the two matrices line up clip-for-clip.
const CLIPS = [
  { hash: 'f8fd43b55abb4ded', label: 'long-old', moment: 'GENERIC_INTRO' },
  { hash: '70a4306f0a9a8091', label: 'short-old', moment: 'FINAL_QUESTION' },
  { hash: '0b70f382e31dbd39', label: 'new49', moment: 'ALL_CLUSTERED' },
  { hash: '74d727dd9e68ce2c', label: 'old186', moment: 'STUCK_IN_LAST' },
];

// Subtle -> pronounced. Every step: more low-shelf boost (warmth), more
// high-shelf cut (less brightness), more of a peaking dip around 2-4kHz
// (less youthful "presence"/edge). v1 is EQ-only - no acompressor - so its
// effect can be isolated from compression entirely, per the task.
// acompressor's `threshold` is LINEAR amplitude (0..1), not dB:
// -20dB=0.1, -24dB=0.0631, -28dB=0.0398 (10^(dB/20)).
const VARIANTS = [
  {
    tag: 'eq1_low+2_treb-1_pres-1_nocomp',
    af: 'bass=g=2:f=150,treble=g=-1:f=7000,equalizer=f=3000:t=o:w=1.5:g=-1',
  },
  {
    tag: 'eq2_low+4_treb-2_pres-2_comp2x',
    af: 'bass=g=4:f=150,treble=g=-2:f=6500,equalizer=f=3000:t=o:w=1.5:g=-2,acompressor=threshold=0.1:ratio=2:attack=20:release=250:makeup=1',
  },
  {
    tag: 'eq3_low+6_treb-3_pres-3_comp3x',
    af: 'bass=g=6:f=150,treble=g=-3:f=6000,equalizer=f=3000:t=o:w=1.5:g=-3,acompressor=threshold=0.0631:ratio=3:attack=20:release=250:makeup=1',
  },
  {
    tag: 'eq4_low+8_treb-4_pres-4_comp4x',
    af: 'bass=g=8:f=150,treble=g=-4:f=5500,equalizer=f=3000:t=o:w=1.5:g=-4,acompressor=threshold=0.0398:ratio=4:attack=20:release=250:makeup=1',
  },
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
