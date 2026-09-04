import { type RoomCode, type SocratesShowPayload } from '@game/shared';
import { SpeechSlab } from '../../components/SpeechSlab';
import { GameLayout } from './GameLayout';

interface SocratesViewProps {
  socrates: SocratesShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 39/163b - the whole view of the SOCRATES phase: the host alone with
// the line for the round that just ended. HOST ONLY, like every other piece
// of his commentary. The server HOLDS here on the shared timer, so nothing
// else is on screen underneath and the next question hasn't started - and
// it only enters the phase when a line actually fired, so this is never
// empty.
// Task 163b - the old top-of-screen card (GameLayout's read column) is gone;
// the line now sits on design/theatre-reference.html's #speech slab,
// floating lower-left over the lit scene (TheatreScene stays lit here -
// SOCRATES was already in LIT_PHASES). GameLayout is still the wrapper
// (corner room code + pause overlay), but its own read column renders
// nothing - SpeechSlab is position:fixed and paints over the whole frame
// regardless of where it's mounted in the tree.
// The sophists row drops to 60% for this phase (SophistsRow), unchanged.
export function SocratesView({ socrates, roomCode, paused, pausedByName }: SocratesViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={socrates.standings}
      contentKey={`socrates-${socrates.questionIndex}`}
    >
      <SpeechSlab data-testid="socrates-stage">«{socrates.line}»</SpeechSlab>
    </GameLayout>
  );
}
