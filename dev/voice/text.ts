// Shared by the voice generation script (and playback code - HostScreen's
// useGameAudio - that needs to look up an audio file for a given Socrates
// line template).
//
// lineHash itself lives in @game/shared (Task 42b), not here - it's the one
// hashing rule both the generator AND the client resolve a line's audio
// file with, so it can never drift between them.
export { lineHash } from '@game/shared';

// {name}/{n}/{category}/... placeholders can't be resolved outside a real
// game round, so the pre-generated audio is recorded with them removed
// entirely rather than spoken literally as "brace name brace".
export function stripPlaceholders(template: string): string {
  return template
    .replace(/\{\w+\}/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
