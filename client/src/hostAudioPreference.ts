// Whether the host has muted all game audio (countdown ticks, question-start
// jingle, reveal chord, etc). Persisted so a host who mutes once doesn't
// have to re-mute after a refresh or a TV reconnect mid-game.
const HOST_MUTED_KEY = 'hostMuted';

export function getStoredHostMuted(): boolean {
  return localStorage.getItem(HOST_MUTED_KEY) === 'true';
}

export function setStoredHostMuted(muted: boolean): void {
  localStorage.setItem(HOST_MUTED_KEY, muted ? 'true' : 'false');
}
