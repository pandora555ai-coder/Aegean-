import type { ClimbRevealHostPayload } from '@game/shared';

interface ClimbRevealViewProps {
  climbReveal: ClimbRevealHostPayload;
}

// Task 189 built this as a papyrus panel (correct answer, a duel/winner
// note, a progress bar). Task 192 tore that out: CLIMB_REVEAL is Frame B of
// the climb's own alternation - the round's outcome is told ENTIRELY by the
// climbers on the stair (AnavasisClimbers' up/down arrows, then their
// glide), and CLAUDE.md's invariant for this scene is now "no on-screen
// text while any body is moving". The correct answer, the duel/winner
// note, and the progress bar all duplicated something told better
// elsewhere (the climbers themselves; DUEL_PICK's own caption; the
// crowning at GAME_OVER) - not shortened to fit around the movement, just
// dropped. This renders only a hidden anchor so the screenshot harness
// still has a stable CLIMB_REVEAL marker to wait on.
// 1x1px, not 0x0 - Playwright's own `visible` state (used by the screenshot
// harness's CLIMB_CAPTURES, same as every other phase marker there) requires
// a non-empty bounding box.
const MARKER_STYLE = { position: 'fixed', width: 1, height: 1, opacity: 0 } as const;

export function ClimbRevealView({ climbReveal }: ClimbRevealViewProps) {
  return <div aria-hidden="true" style={MARKER_STYLE} data-testid="climb-reveal-marker" key={climbReveal.roundIndex} />;
}
