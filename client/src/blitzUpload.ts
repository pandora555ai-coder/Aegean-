// Task 70 - auto-upload of finished blitz rounds.
//
// localStorage is the SOURCE OF TRUTH. At the end of every round the round
// is written locally (sent:false) and then POSTed to the server in a pure
// fire-and-forget: a failure never blocks the UI, never shows an error, and
// just leaves the round sent:false for the next app start to retry (oldest
// first). On a 204 the round is flipped to sent:true in place.
//
// The endpoint path is BLITZ_LOG_PATH from @game/shared - the one shared
// definition the server imports too, so the two cannot drift.
import { BLITZ_LOG_PATH } from '@game/shared';
import { SERVER_URL } from './config';

const K_DEVICE_ID = 'blitz:deviceId';
const K_ROUNDS = 'blitz:rounds';

export interface BlitzSwipeUpload {
  statementText: string;
  correct: boolean;
  msSincePrevious: number;
}

export interface BlitzRoundPayload {
  deviceId: string;
  name: string;
  durationSec: number;
  answered: number;
  correct: number;
  medianMs: number;
  endedAt: number; // ms epoch - also the local identity of the stored round
  swipes: BlitzSwipeUpload[];
}

interface StoredRound {
  payload: BlitzRoundPayload;
  sent: boolean;
}

// Random UUID, generated once and reused. If storage is unavailable we still
// return a valid id (just not a stable one) so an upload can proceed.
export function getBlitzDeviceId(): string {
  try {
    const existing = localStorage.getItem(K_DEVICE_ID);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(K_DEVICE_ID, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function readStored(): StoredRound[] {
  try {
    const raw = localStorage.getItem(K_ROUNDS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredRound[]) : [];
  } catch {
    return [];
  }
}

function writeStored(list: StoredRound[]): void {
  try {
    localStorage.setItem(K_ROUNDS, JSON.stringify(list));
  } catch {
    // best-effort - a lost write just costs one retry opportunity
  }
}

function markSent(endedAt: number): void {
  const list = readStored();
  let changed = false;
  for (const r of list) {
    if (r.payload.endedAt === endedAt && !r.sent) {
      r.sent = true;
      changed = true;
    }
  }
  if (changed) writeStored(list);
}

async function upload(payload: BlitzRoundPayload): Promise<void> {
  try {
    const res = await fetch(`${SERVER_URL}${BLITZ_LOG_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // survive the end-screen unmount / navigation
    });
    if (res.status === 204) markSent(payload.endedAt);
  } catch {
    // fire-and-forget: stays sent:false, retried on next app start
  }
}

// Called from finishRound. Persists the round as sent:false FIRST (so it is
// never lost if the POST throws synchronously), then fires the upload.
export function recordAndUploadRound(payload: BlitzRoundPayload): void {
  const list = readStored();
  list.push({ payload, sent: false });
  writeStored(list);
  void upload(payload);
}

let retried = false;

// Called once when the blitz screen mounts. Retries every still-unsent
// round, oldest first. Idempotent - guarded against React StrictMode's
// double effect invocation, and markSent tolerates a double 204 anyway.
export function retryUnsentBlitzRounds(): void {
  if (retried) return;
  retried = true;
  const pending = readStored()
    .filter((r) => !r.sent)
    .sort((a, b) => a.payload.endedAt - b.payload.endedAt);
  for (const r of pending) void upload(r.payload);
}
