// Persisted so a TV that goes to sleep (Tizen ignores the Wake Lock API and
// treats "no remote input" as idle) can wake up, let socket.io reconnect on
// its own, and silently rejoin the exact same room instead of getting stuck
// on "Create Room". Also lets the landing page skip itself straight to the
// host view when a room is already live.
const HOST_ROOM_CODE_KEY = 'hostRoomCode';

export function getStoredHostRoomCode(): string | null {
  return localStorage.getItem(HOST_ROOM_CODE_KEY);
}

export function setStoredHostRoomCode(code: string): void {
  localStorage.setItem(HOST_ROOM_CODE_KEY, code);
}

export function clearStoredHostRoomCode(): void {
  localStorage.removeItem(HOST_ROOM_CODE_KEY);
}
