import { SCOREBOARD_DURATION_MS, type RoomCode, type ScoreboardPayload } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import {
  SURFACE_GLOW,
  containerGap,
  standingAvatarSize,
  standingRowSizeStyle,
  standingsListGap,
  styles,
  type CSSVars,
} from './hostStyles';

interface ScoreboardViewProps {
  scoreboard: ScoreboardPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  scoreboardSecondsLeft: number;
}

export function ScoreboardView({ scoreboard, roomCode, paused, pausedByName, scoreboardSecondsLeft }: ScoreboardViewProps) {
  const sortedStandings = [...scoreboard.standings].sort((a, b) => a.rank - b.rank);
  const count = sortedStandings.length;
  const rowSize = standingRowSizeStyle(count);

  return (
    <div
      style={{ ...styles.container, gap: containerGap(count) }}
      className="screen-fade-in"
      key={scoreboard.questionIndex}
    >
      {roomCode && (
        <div style={styles.cornerRoomCode} data-testid="corner-room-code">
          {roomCode}
        </div>
      )}
      {paused && (
        <div style={styles.pauseOverlay} data-testid="pause-overlay">
          <div style={styles.pauseTitle}>ΠΑΥΣΗ</div>
          <div style={styles.pauseSubtitle}>Ο/Η {pausedByName} έκανε παύση</div>
        </div>
      )}
      <div style={styles.progress}>
        Ερώτηση {scoreboard.questionIndex + 1}/{scoreboard.totalQuestions} ολοκληρώθηκε
      </div>
      <div style={{ ...styles.standingsList, gap: standingsListGap(count) }}>
        {/* Rows are already in rank order (leader first) - the stagger
            delay below (--i = row position) makes them visibly slide in
            "from the leader down". */}
        {sortedStandings.map((standing, index) => {
          const isLeader = standing.rank === 1 && standing.connected;
          return (
            <div
              key={standing.playerId}
              data-testid="standing-row"
              data-connected={standing.connected}
              data-leader={isLeader}
              className="enter-rise"
              style={
                !standing.connected
                  ? ({
                      ...styles.standingRowDisconnected,
                      ...rowSize,
                      boxShadow: SURFACE_GLOW,
                      '--i': String(index),
                    } as CSSVars)
                  : isLeader
                    ? ({ ...styles.standingRowLeader, ...rowSize, '--i': String(index) } as CSSVars)
                    : ({ ...styles.standingRow, ...rowSize, boxShadow: SURFACE_GLOW, '--i': String(index) } as CSSVars)
              }
            >
              <span style={styles.standingRank}>#{standing.rank}</span>
              <Avatar avatarId={standing.avatarId} sizeRem={standingAvatarSize(count)} ringColor={isLeader ? 'var(--gold)' : undefined} />
              <span style={styles.standingName}>
                {standing.name}
                {!standing.connected && ' (αποσυνδέθηκε)'}
              </span>
              <span style={styles.standingScore}>{standing.score}</span>
            </div>
          );
        })}
      </div>
      <div style={styles.progressBarTrack} data-testid="scoreboard-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(scoreboardSecondsLeft / Math.ceil(SCOREBOARD_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
