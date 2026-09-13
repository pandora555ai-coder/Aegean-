import { type RoomCode, type SocratesShowPayload, type StageAnnouncePayload } from '@game/shared';
import { SocratesSubtitle } from '../../components/SocratesSubtitle';
import { StageAnnounceOverlay } from './StageAnnounceOverlay';
import { GameLayout } from './GameLayout';

interface SocratesViewProps {
  socrates: SocratesShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  // Task 239 - non-null exactly when this beat is an ANNOUNCE beat
  // (kind GAME_INTRO/STAGE_INTRO) and the caller has a card to show under it
  // (HostScreen keeps the last STAGE_ANNOUNCE payload around for this - see
  // its own comment). null for every other kind (REVEAL/WINNER/...), which
  // renders the subtitle alone, same as before this task.
  announceCard?: StageAnnouncePayload | null;
}

// Task 39/163b - the whole view of the SOCRATES phase: the host alone with
// the line for the round that just ended. HOST ONLY, like every other piece
// of his commentary. The server HOLDS here on the shared timer, so nothing
// else is on screen underneath and the next question hasn't started - and
// it only enters the phase when a line actually fired, so this is never
// empty.
// Task 163b - the old top-of-screen card (GameLayout's read column) is gone;
// the line used to sit here on design/theatre-reference.html's #speech slab.
// Task 196 moved that slab OUT to HostScreen's own chrome-level Socrates
// caption (SpeechSlab there, driven by the audio's own onEnded rather than
// this phase alone) - this view now supplies only the room code + pause
// overlay GameLayout gives every phase, exactly like SOCRATES had them
// before Task 163b's relocation. TheatreScene stays lit here (SOCRATES was
// already in LIT_PHASES).
// The sophists row drops to 60% for this phase (SophistsRow), unchanged.
// Task 239 - the line is no longer audio-only: SocratesSubtitle renders it as
// text (a viewer with no sound must still be able to follow along), and an
// announce beat (GAME_INTRO/STAGE_INTRO) keeps the stage-announce card up
// underneath it, since STAGE_ANNOUNCE itself already ended by the time this
// phase starts and the card would otherwise vanish mid-narration.
export function SocratesView({ socrates, roomCode, paused, pausedByName, announceCard = null }: SocratesViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={socrates.standings}
      contentKey={`socrates-${socrates.questionIndex}`}
    >
      {announceCard && <StageAnnounceOverlay announce={announceCard} />}
      <SocratesSubtitle text={socrates.line} />
    </GameLayout>
  );
}
