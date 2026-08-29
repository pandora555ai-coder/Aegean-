import { useRef, type CSSProperties } from 'react';
import {
  type DrawProgressPayload,
  type DrawShowHostPayload,
  type LobbyPlayer,
  type RoomCode,
} from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { answeredAvatarSize, answeredNamesSizeStyle, styles } from './hostStyles';

// questionTextTv/progress are shared with other phases (hostStyles.ts) and
// still carry pre-Ελαιογραφία tokens there - this phase's content is ported
// on its own, so the papyrus text gets local ink overrides instead of
// touching those shared entries. Same layout as PowerUpView's identical
// "instruction card" pattern.
const papyrusTextBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  width: '100%',
};

interface DrawViewProps {
  draw: DrawShowHostPayload;
  progress: DrawProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  players: LobbyPlayer[];
}

// Task 56b - the TV during DRAW: who has submitted, nothing else. Deliberately
// the same shape as PowerUpView's answered-markers strip - WHAT anyone is
// drawing is never sent to the host at all (see buildDrawHostPayload), so
// there is nothing here that could spoil it before the GUESS phase.
export function DrawView({ draw, progress, roomCode, paused, pausedByName, players }: DrawViewProps) {
  const submittedIds = new Set(progress?.submittedPlayerIds ?? draw.submittedPlayerIds);
  const submittedCount = progress?.submittedCount ?? draw.submittedCount;
  const totalCount = progress?.totalPlayers ?? draw.totalPlayers;

  const titleBlockRef = useRef<HTMLDivElement | null>(null);
  const titleTextRef = useRef<HTMLDivElement | null>(null);
  // "Ζωγραφίστε!" is one unbroken word - no space to wrap on, so a fixed
  // 6rem (questionTextTv) ran it past the panel's width with no fallback.
  useFitFontSize(titleBlockRef, titleTextRef, [], { maxRem: 6, minRem: 2 });
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={draw.standings}>
      <div className="enter-pop" style={styles.category}>
        Ζωγραφική
      </div>
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={papyrusTextBlockStyle} ref={titleBlockRef}>
          <div style={{ ...styles.questionTextTv, color: 'var(--ink)' }} data-testid="draw-title" ref={titleTextRef}>
            Ζωγραφίστε!
          </div>
          <div style={{ ...styles.progress, color: 'var(--ink)' }} data-testid="draw-subtitle">
            Στα κινητά σας
          </div>
        </div>
      </PapyrusPanel>
      <div style={styles.answerCounter} data-testid="draw-progress">
        {submittedCount}/{totalCount} υπέβαλαν
      </div>
      <div style={{ ...styles.answeredNames, ...answeredNamesSizeStyle(players.length) }}>
        {players.map((player) => {
          const submitted = submittedIds.has(player.playerId);
          return (
            <span
              key={player.playerId}
              data-testid="draw-marker"
              data-submitted={submitted}
              style={submitted ? styles.nameAnswered : styles.nameNotAnswered}
            >
              <Avatar avatarId={player.avatarId} sizeRem={answeredAvatarSize(players.length)} />
              {submitted ? '✓ ' : ''}
              {player.name}
            </span>
          );
        })}
      </div>
    </GameLayout>
  );
}
