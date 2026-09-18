import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCRATES_VOICE_DELETED_DIR, SOCRATES_VOICE_DIR, SOCRATES_VOICE_STAGING_DIR, type VoiceLineReviewStatus } from '@game/shared';
import { collectVoiceLineEntries } from './socrates.js';

// Task 271 - the line audition & deletion tool's own persistence and file
// moves. Read-only everywhere except the three functions at the bottom
// (deleteVoiceLine/restoreVoiceLine/markVoiceLine), which are the ONLY
// things in this codebase that ever write into a voice directory outside
// dev/generate-voice-lines.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK_DIR = path.join(__dirname, '../../client/public', SOCRATES_VOICE_DIR);
const STAGING_DIR = path.join(__dirname, '../../client/public', SOCRATES_VOICE_STAGING_DIR);
export const DELETED_DIR = path.join(__dirname, '../../client/public', SOCRATES_VOICE_DELETED_DIR);
const DATA_PATH = path.join(__dirname, 'data', 'voice-line-review.json');

export interface ReviewRecord {
  hash: string;
  template: string;
  tag: string | null;
  moment: string;
  status: VoiceLineReviewStatus; // 'kept' or 'deleted' only - a record is never persisted for 'active'
  updatedAt: string;
  // Only meaningful for status 'deleted' - what existed, and what happened
  // to it, at the moment this line was deleted.
  wasInBank: boolean;
  wasInStaging: boolean;
  bankMoveStatus: 'moved' | 'not-present' | 'pending-no-access' | null;
  stagingMoveStatus: 'moved' | 'not-present' | 'pending-no-access' | null;
}

function loadRecords(): Map<string, ReviewRecord> {
  try {
    const raw = readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ReviewRecord[];
    return new Map(parsed.map((r) => [r.hash, r]));
  } catch {
    return new Map(); // missing/corrupt file - start clean, same as any dev-tool localStorage load
  }
}

const records = loadRecords();
// The fast, synchronous check every pick* function in socrates.ts consults.
// Keyed by TEMPLATE TEXT, not hash - that's what pool arrays actually
// contain and what pickLine already filters `state.usedLines` by, so this
// slots into the exact same idiom (see GAME_INTRO_LINES_EXCLUDED_IN_FULL).
const deletedTemplates = new Set<string>(
  [...records.values()].filter((r) => r.status === 'deleted').map((r) => r.template),
);

function persist(): void {
  writeFileSync(DATA_PATH, `${JSON.stringify([...records.values()], null, 2)}\n`);
}

export function isLineDeleted(template: string): boolean {
  return deletedTemplates.has(template);
}

export function getReviewStatus(hash: string): VoiceLineReviewStatus {
  return records.get(hash)?.status ?? 'active';
}

export function getRecord(hash: string): ReviewRecord | undefined {
  return records.get(hash);
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
function isEacces(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === 'EACCES';
}

// Moves `<hash>.mp3` from `fromDir` into DELETED_DIR. If a copy is ALREADY
// there (the other source got there first - a line present in both bank
// and staging needs only one canonical archived copy), this just removes
// the redundant duplicate instead of overwriting it.
function moveToDeleted(fromDir: string, hash: string): 'moved' | 'not-present' | 'pending-no-access' {
  const fromPath = path.join(fromDir, `${hash}.mp3`);
  if (!existsSync(fromPath)) {
    return 'not-present';
  }
  const toPath = path.join(DELETED_DIR, `${hash}.mp3`);
  try {
    if (existsSync(toPath)) {
      unlinkSync(fromPath);
      return 'moved';
    }
    renameSync(fromPath, toPath);
    return 'moved';
  } catch (err) {
    if (isEacces(err)) {
      return 'pending-no-access'; // e.g. the bank symlink into /opt/party-game, unwritable by this process
    }
    throw err;
  }
}

// Task 271, criterion 2's own report: "delete a line, its file(s) move out
// of the bank/staging into voice-deleted, and it can never be selected
// again" - looks the entry up itself (never trusts a client-sent
// template/tag/moment, which could be stale) via collectVoiceLineEntries,
// the one authoritative pool walk.
export function deleteVoiceLine(hash: string): { ok: true; record: ReviewRecord } | { ok: false; error: string } {
  const entry = collectVoiceLineEntries().find((e) => e.hash === hash);
  if (!entry) {
    return { ok: false, error: `unknown hash ${hash}` };
  }
  mkdirSync(DELETED_DIR, { recursive: true });
  const wasInBank = existsSync(path.join(BANK_DIR, `${hash}.mp3`));
  const wasInStaging = existsSync(path.join(STAGING_DIR, `${hash}.mp3`));
  const bankMoveStatus = wasInBank ? moveToDeleted(BANK_DIR, hash) : 'not-present';
  const stagingMoveStatus = wasInStaging ? moveToDeleted(STAGING_DIR, hash) : 'not-present';
  const record: ReviewRecord = {
    hash,
    template: entry.line,
    tag: entry.tag,
    moment: entry.moment,
    status: 'deleted',
    updatedAt: new Date().toISOString(),
    wasInBank,
    wasInStaging,
    bankMoveStatus,
    stagingMoveStatus,
  };
  records.set(hash, record);
  // Excluded from selection immediately, in THIS process, regardless of
  // whether the bank move above actually succeeded - the pool exclusion
  // and the file move are independent guarantees, and the pool one never
  // depends on filesystem permissions.
  deletedTemplates.add(entry.line);
  persist();
  return { ok: true, record };
}

// Copies the archived file back to wherever it came from, un-excludes the
// line immediately (restoring is a clear statement of intent - the line
// should be selectable again even if one copy-back stalls), and only
// removes the archived copy + record once EVERY copy-back that was needed
// actually succeeded. A stalled bank copy-back (same permission gap as
// delete) leaves the record as 'deleted' with bankMoveStatus updated, so
// the Deleted view keeps it visible as "needs a bank follow-up" rather than
// silently losing track of it.
export function restoreVoiceLine(hash: string): { ok: true; record: ReviewRecord | null; message: string } | { ok: false; error: string } {
  const record = records.get(hash);
  if (!record || record.status !== 'deleted') {
    return { ok: false, error: `no deleted record for ${hash}` };
  }
  const deletedPath = path.join(DELETED_DIR, `${hash}.mp3`);
  if (!existsSync(deletedPath)) {
    return { ok: false, error: `${hash}.mp3 is missing from ${SOCRATES_VOICE_DELETED_DIR}/ - nothing to restore` };
  }

  if (record.wasInStaging) {
    copyFileSync(deletedPath, path.join(STAGING_DIR, `${hash}.mp3`)); // this process always owns staging - let a real failure throw
  }

  let bankRestored = true;
  let bankMessage = '';
  if (record.wasInBank) {
    try {
      copyFileSync(deletedPath, path.join(BANK_DIR, `${hash}.mp3`));
    } catch (err) {
      if (!isEacces(err) && !isEnoent(err)) throw err;
      bankRestored = false;
      bankMessage = 'bank copy still pending - this process has no write access to /opt/party-game; completes automatically once run as the deployed site';
    }
  }

  deletedTemplates.delete(record.template);

  if (bankRestored) {
    unlinkSync(deletedPath);
    records.delete(hash);
    persist();
    return { ok: true, record: null, message: 'fully restored' };
  }

  record.status = 'deleted';
  record.bankMoveStatus = 'pending-no-access';
  record.stagingMoveStatus = record.wasInStaging ? 'not-present' : record.stagingMoveStatus; // it's back in staging, not "deleted" there any more
  record.updatedAt = new Date().toISOString();
  persist();
  return { ok: true, record, message: `restored in staging; ${bankMessage}` };
}

export function markVoiceLine(hash: string, status: 'kept' | 'active'): { ok: true; record: ReviewRecord | null } | { ok: false; error: string } {
  const existing = records.get(hash);
  if (existing?.status === 'deleted') {
    // Un-deleting is restoreVoiceLine's job (it also moves the file back) -
    // mark is a no-op here rather than silently dropping the delete record.
    return { ok: false, error: `${hash} is deleted, not kept - use restore instead` };
  }
  if (status === 'active') {
    const existed = records.delete(hash);
    if (existed) persist();
    return { ok: true, record: null };
  }
  const entry = collectVoiceLineEntries().find((e) => e.hash === hash);
  if (!entry) {
    return { ok: false, error: `unknown hash ${hash}` };
  }
  const record: ReviewRecord = {
    hash,
    template: entry.line,
    tag: entry.tag,
    moment: entry.moment,
    status: 'kept',
    updatedAt: new Date().toISOString(),
    wasInBank: false,
    wasInStaging: false,
    bankMoveStatus: null,
    stagingMoveStatus: null,
  };
  records.set(hash, record);
  persist();
  return { ok: true, record };
}
