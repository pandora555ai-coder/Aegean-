import type { DuelRevealHostPayload, RoomCode } from '@game/shared';
import { AnavasisChrome } from '../../components/AnavasisScene';

interface DuelRevealViewProps {
  duelReveal: DuelRevealHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 189 - the duel's reveal. Both weapons, the winner and the verdict
// line are AnavasisDuel's own job (mounted at the HostScreen level, reading
// duelReveal directly) - this view exists only to carry the same room-code/
// pause chrome every climb/duel phase needs once it bypasses GameLayout.
export function DuelRevealView({ duelReveal: _duelReveal, roomCode, paused, pausedByName }: DuelRevealViewProps) {
  return <AnavasisChrome roomCode={roomCode} paused={paused} pausedByName={pausedByName} />;
}
