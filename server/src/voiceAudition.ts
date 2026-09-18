import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_BITRATE_KBPS, SOCRATES_VOICE_DIR, SOCRATES_VOICE_STAGING_DIR, type DevVoiceAuditionEntry } from '@game/shared';
import { collectVoiceLineEntries } from './socrates.js';
import { DELETED_DIR, getRecord, getReviewStatus } from './voiceDeletions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same directories generate-voice-lines.ts reads/writes, Vite/Express serve
// at /voice/* etc., and voiceDeletions.ts moves files between - THIS module
// still only ever STATs them (Task 269's own "never writes, deletes, moves
// or generates" rule holds for voiceAudition.ts specifically; the mutating
// half now lives entirely in voiceDeletions.ts).
const BANK_DIR = path.join(__dirname, '../../client/public', SOCRATES_VOICE_DIR);
const STAGING_DIR = path.join(__dirname, '../../client/public', SOCRATES_VOICE_STAGING_DIR);

// Deliberately NOT socratesAudio.ts's resolveSocratesClip: that function
// searches a PRIORITY-ORDERED list and returns the first hit (right for a
// live beat, which only ever plays ONE clip). The audition page needs BOTH
// answers independently - bank AND staging, never merged - so a clip that's
// only in staging isn't hidden behind "found nothing" the moment a bank
// orphan of a different hash happens to exist.
function clipInfo(dir: string, hash: string): { exists: boolean; durationMs: number | null } {
  try {
    const { size } = statSync(path.join(dir, `${hash}.mp3`));
    return { exists: true, durationMs: Math.round((size * 8) / AUDIO_BITRATE_KBPS) };
  } catch {
    return { exists: false, durationMs: null };
  }
}

// Task 269 - the /dev/voice-audition page's one data source. Built on
// collectVoiceLineEntries (server/src/socrates.ts), the same authoritative
// walk over every pool dev/generate-voice-lines.ts and /dev/voice already
// use - this can never disagree with either about what an "active line" is.
export function collectVoiceAuditionEntries(): DevVoiceAuditionEntry[] {
  return collectVoiceLineEntries().map((entry) => {
    const bank = clipInfo(BANK_DIR, entry.hash);
    const staging = clipInfo(STAGING_DIR, entry.hash);
    const deleted = clipInfo(DELETED_DIR, entry.hash);
    const record = getRecord(entry.hash);
    return {
      hash: entry.hash,
      moment: entry.moment,
      tag: entry.tag,
      template: entry.line,
      inBank: bank.exists,
      inStaging: staging.exists,
      bankDurationMs: bank.durationMs,
      stagingDurationMs: staging.durationMs,
      status: getReviewStatus(entry.hash),
      inDeleted: deleted.exists,
      deletedDurationMs: deleted.durationMs,
      bankMoveStatus: record?.bankMoveStatus ?? null,
      stagingMoveStatus: record?.stagingMoveStatus ?? null,
    };
  });
}
