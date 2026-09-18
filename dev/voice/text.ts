// Shared by the voice generation script (and playback code - HostScreen's
// useGameAudio - that needs to look up an audio file for a given Socrates
// line template).
//
// lineHash itself lives in @game/shared (Task 42b), not here - it's the one
// hashing rule both the generator AND the client resolve a line's audio
// file with, so it can never drift between them.
//
// Task 269 - stripPlaceholders moved into @game/shared alongside lineHash
// (the audition page's server-side handler needs it too, and server never
// imports from dev/ - dev/ imports server/shared, not the other way
// around). Re-exported here unchanged so this file's own generator import
// site didn't need to change at all.
export { lineHash, stripPlaceholders } from '@game/shared';
