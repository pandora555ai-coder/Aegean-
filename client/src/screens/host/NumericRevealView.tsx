import { useMemo } from 'react';
import { NUMERIC_REVEAL_DURATION_MS, type NumericRevealShowPayload, type RoomCode } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import {
  NUMERIC_TRACK_LANES,
  numericLanePitch,
  numericMarkerAvatarSize,
  numericMarkerNameStyle,
  numericTrackHeight,
  styles,
} from './hostStyles';

interface NumericRevealViewProps {
  reveal: NumericRevealShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

interface PlacedMarker {
  playerId: string;
  name: string;
  avatarId: string;
  exact: boolean;
  percent: number;
  lane: number;
}

// A lightweight beeswarm: markers are placed left-to-right by their x
// position, each taking the first lane whose last-placed marker is at least
// `minGapPercent` away. Once every lane is too crowded, it lands in the
// lane least likely to still overlap - guesses can genuinely tie, so this
// never blocks on finding a free slot that doesn't exist.
function assignLanes(
  markers: readonly { playerId: string; percent: number }[],
  minGapPercent: number,
  maxLanes: number,
): Map<string, number> {
  const sorted = [...markers].sort((a, b) => a.percent - b.percent);
  const laneLastPercent: number[] = [];
  const laneOf = new Map<string, number>();
  for (const marker of sorted) {
    let placed = -1;
    for (let lane = 0; lane < laneLastPercent.length; lane++) {
      if (marker.percent - laneLastPercent[lane] >= minGapPercent) {
        placed = lane;
        break;
      }
    }
    if (placed === -1) {
      if (laneLastPercent.length < maxLanes) {
        placed = laneLastPercent.length;
        laneLastPercent.push(marker.percent);
      } else {
        placed = laneLastPercent.indexOf(Math.min(...laneLastPercent));
        laneLastPercent[placed] = marker.percent;
      }
    } else {
      laneLastPercent[placed] = marker.percent;
    }
    laneOf.set(marker.playerId, placed);
  }
  return laneOf;
}

// Task 66 - the TV during NUMERIC_REVEAL. There is no colour+shape option
// identity in this mode, so the number line IS the reveal: every player's
// guess plotted against the correct answer, nothing else competing for the
// screen (no separate per-player results list - the always-visible score
// column already carries each player's new total).
export function NumericRevealView({ reveal, roomCode, paused, pausedByName, secondsLeft }: NumericRevealViewProps) {
  const count = reveal.standings.length;
  const submitted = reveal.results.filter(
    (result): result is typeof result & { value: number } => result.value !== null,
  );
  const answerPercent = (reveal.answer / reveal.max) * 100;
  const markerAvatarSize = numericMarkerAvatarSize(count);
  const lanePitch = numericLanePitch(count);

  const laneOf = useMemo(
    () =>
      assignLanes(
        submitted.map((result) => ({ playerId: result.playerId, percent: (result.value / reveal.max) * 100 })),
        8,
        NUMERIC_TRACK_LANES,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reveal.questionIndex],
  );

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={reveal.standings}
      contentKey={reveal.questionIndex}
    >
      <div className="enter-pop">
        <div style={styles.category}>{reveal.category}</div>
        <div style={styles.questionTextTv} data-testid="numeric-reveal-text">
          {reveal.text}
        </div>
      </div>
      <div style={styles.numericAnswerBanner} data-testid="numeric-reveal-answer">
        Σωστή απάντηση: {reveal.answer}
      </div>
      <div style={{ ...styles.numericTrackWrap, height: numericTrackHeight(count) }} data-testid="numeric-track">
        <div style={styles.numericTrackLine} />
        <div style={{ ...styles.numericTick, left: '0%' }}>0</div>
        <div style={{ ...styles.numericTick, left: '100%', transform: 'translateX(-100%)' }}>{reveal.max}</div>
        <div style={{ ...styles.numericAnswerLine, left: `${answerPercent}%` }} data-testid="numeric-answer-marker" />
        <div style={{ ...styles.numericAnswerLabel, left: `${answerPercent}%` }}>🎯 {reveal.answer}</div>
        {submitted.map((result) => {
          const percent = (result.value / reveal.max) * 100;
          const lane = laneOf.get(result.playerId) ?? 0;
          return (
            <div
              key={result.playerId}
              data-testid="numeric-reveal-marker"
              data-exact={result.exact}
              style={{ ...styles.numericMarker, left: `${percent}%`, bottom: `${2.2 + lane * lanePitch}rem` }}
            >
              <Avatar avatarId={result.avatarId} sizeRem={markerAvatarSize} ringColor={result.exact ? 'var(--gold)' : undefined} />
              <span style={{ ...styles.numericMarkerName, ...numericMarkerNameStyle(count) }}>{result.name}</span>
            </div>
          );
        })}
      </div>
      <div style={styles.progressBarTrack} data-testid="numeric-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(secondsLeft / Math.ceil(NUMERIC_REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
