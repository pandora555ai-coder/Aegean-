// Task 249's own diagnostic, made permanent and reusable: does an mp3's
// final ~20ms sit at or near the loudest point of the clip's last ~300ms?
// A genuine sentence ending decays before EOF; a clip truncated mid-word or
// mid-syllable does not - its last window is still near (or at) its own
// recent peak. Exact same algorithm and thresholds as the one-off Python
// analysis in Task 249 (RATIO_THRESHOLD/MIN_RMS below), so re-running this
// over the existing 283-file bank must still find exactly 36 - proof this
// is the same test, not a stricter or looser one.
//
// Used two ways:
//   - dev/generate-voice-lines.ts calls checkTail() on every freshly written
//     clip and REFUSES to keep one that fails it (Task 251).
//   - dev/voice/bank-tail-check.ts sweeps an existing directory and reports
//     which files fail it, with no side effects - the Task 249/251 audit.
import { execFileSync } from 'node:child_process';

const SAMPLE_RATE = 44100;
const WINDOW_MS = 20;
const WINDOW_SAMPLES = Math.round((SAMPLE_RATE * WINDOW_MS) / 1000);
const LOOKBACK_WINDOWS = 15; // 15 * 20ms = 300ms, INCLUDING the final window itself

// Task 249's own thresholds, unchanged: the final window must sit below 60%
// of the clip's own recent peak, UNLESS that peak is itself near silence
// (MIN_RMS guards a quiet fade-out from being flagged just because the
// whole tail is quiet).
export const TAIL_RATIO_THRESHOLD = 0.6;
export const TAIL_MIN_RMS = 500;

export interface TailAnalysis {
  lastWindowRms: number;
  recentPeakRms: number;
  ratio: number;
  durationMs: number;
}

// Decodes with ffmpeg (same tool, same flags Task 249 used) rather than
// pulling in an MP3 decoding dependency - every environment that can
// generate or play these clips already has ffmpeg available for the
// server's own byte-size duration estimate's cross-checks.
function decodeToPcm(mp3Path: string): Int16Array {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', mp3Path, '-f', 's16le', '-acodec', 'pcm_s16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-'],
    { maxBuffer: 200 * 1024 * 1024 },
  );
  // A DataView, not a zero-copy Int16Array cast, because Buffer.byteOffset
  // is not guaranteed 2-byte aligned (Node's Buffer pool can hand back an
  // odd offset), which Int16Array's constructor requires.
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = Math.floor(raw.byteLength / 2);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = view.getInt16(i * 2, true);
  }
  return samples;
}

function rms(samples: Int16Array, start: number, end: number): number {
  let sumSquares = 0;
  for (let i = start; i < end; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / (end - start));
}

// Exact port of Task 249's analyze_trend.py: the lookback loop's first
// window IS the final window (idx starts at n), so `recentPeakRms` includes
// the tail itself - a clip whose last window happens to be the loudest
// point in its own last 300ms scores ratio === 1.
export function analyzeTail(mp3Path: string): TailAnalysis {
  const samples = decodeToPcm(mp3Path);
  const n = samples.length;
  if (n < WINDOW_SAMPLES * 5) {
    return { lastWindowRms: 0, recentPeakRms: 0, ratio: 0, durationMs: (n / SAMPLE_RATE) * 1000 };
  }
  const lastWindowRms = rms(samples, n - WINDOW_SAMPLES, n);
  let recentPeakRms = 0;
  let idx = n;
  for (let w = 0; w < LOOKBACK_WINDOWS; w++) {
    const start = Math.max(0, idx - WINDOW_SAMPLES);
    if (start === idx) break;
    recentPeakRms = Math.max(recentPeakRms, rms(samples, start, idx));
    idx = start;
  }
  const ratio = recentPeakRms > 0 ? lastWindowRms / recentPeakRms : 0;
  return { lastWindowRms, recentPeakRms, ratio, durationMs: (n / SAMPLE_RATE) * 1000 };
}

export function isTailTruncated(analysis: TailAnalysis): boolean {
  return analysis.ratio >= TAIL_RATIO_THRESHOLD && analysis.recentPeakRms > TAIL_MIN_RMS;
}

// Convenience for a single yes/no call site (dev/generate-voice-lines.ts) -
// re-decodes are cheap (these clips are a few seconds each) and keeping the
// analysis + verdict as two steps everywhere else makes the bank sweep's
// reporting (ratio, not just pass/fail) possible.
export function checkTail(mp3Path: string): { ok: boolean; analysis: TailAnalysis } {
  const analysis = analyzeTail(mp3Path);
  return { ok: !isTailTruncated(analysis), analysis };
}
