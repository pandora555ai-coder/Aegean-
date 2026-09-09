import type { AgoraExposeShowPayload, RoomCode } from '@game/shared';
import { greekUpper } from '../../greekUpper';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

interface AgoraExposeViewProps {
  agoraExpose: AgoraExposeShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 208 - the exposure beat's whole job is the market itself (AgoraScene,
// rendered by HostScreen behind this view - see isAgoraScenePhase there) and
// its krater countdown (the existing timer treatment, wired the same way
// every other timed phase's krater is - see HostScreen's timerForPhase). A
// small static caption is the only text: no per-round dynamic content to
// show, unlike QUESTION/REVEAL. `standings` isn't in this payload at all
// (the exposure carries only the scene) - GameLayout only needs a count for
// its own spacing, so an empty array is exactly as correct as the real one
// here (the row itself is fed separately, by HostScreen's own held-over
// standings, same "payload not in yet" fallback every other phase gets).
export function AgoraExposeView({ agoraExpose, roomCode, paused, pausedByName }: AgoraExposeViewProps) {
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={[]}>
      <div className="enter-pop" style={styles.category}>
        {greekUpper('η μνήμη της αγοράς')}
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }} data-testid="agora-expose-caption">
        <div style={{ ...styles.questionTextTv, color: 'var(--carve)', fontSize: '2.4rem' }}>
          Κοίτα προσεκτικά την αγορά
        </div>
      </MarbleSlab>
      {/* Read only for its presence/shape by the harness (criterion 1's
          expose shot) - the actual countdown is the krater, not this text. */}
      <span data-testid="agora-expose-duration" style={{ display: 'none' }}>
        {agoraExpose.exposureMs}
      </span>
    </GameLayout>
  );
}
