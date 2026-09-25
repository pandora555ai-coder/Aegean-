// Task 174 - what /play needs to rejoin a room with ZERO interaction after a
// lock or a dropped tab: the room code plus the identity already accepted by
// the server (name, avatarId). playerId itself lives separately in
// playerId.ts (it predates any room and outlives every session); this is
// only the "which room, as whom" half, written once a join actually
// succeeds and cleared the moment that identity turns out to be stale.
const STORAGE_KEY = 'lastSession';

export interface LastSession {
  code: string;
  name: string;
  avatarId: string;
  // Task 320 - WHICH room behind that code. Replayed on resume; the server
  // refuses one that is not the live room's (JOIN_REJECTED 'ROOM_CLOSED'),
  // so a reused 4-digit code can't pull this phone into a stranger's game.
  // Absent in a session stored before 320 (resumes as before).
  instanceId?: string;
}

export function getLastSession(): LastSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.code === 'string' && typeof parsed?.name === 'string' && typeof parsed?.avatarId === 'string') {
      return parsed;
    }
  } catch {
    // fall through to null below
  }
  return null;
}

export function saveLastSession(session: LastSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearLastSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
