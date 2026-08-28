import { useMemo, useRef, type CSSProperties } from 'react';
import { NUMERIC_REVEAL_DURATION_MS, type NumericRevealShowPayload, type RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { NUMERIC_TRACK_LANES, numericLanePitch, numericMarkerNameStyle, numericTrackHeight, styles } from './hostStyles';

// progressBarTrack is shared with GuessRevealView (hostStyles.ts) and still
// carries an old pre-Ελαιογραφία token there - this phase's content is
// ported on its own, so it gets a local override instead of touching that
// shared entry.
const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--panel)',
  overflow: 'hidden',
};

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
  const lanePitch = numericLanePitch(count);
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(questionBlockRef, questionTextRef, [reveal.text, reveal.questionIndex, count], {
    maxRem: 6,
    minRem: 2,
  });

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
      <div className="enter-pop" style={styles.category}>
        {reveal.category}
      </div>
      {/* flex:1 1 0 opts back into filling available height - useFitFontSize
          below needs a determinate, flexed container to shrink text against. */}
      <PapyrusPanel className="enter-pop" style={{ flex: '1 1 0' }}>
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--ink)' }}
            data-testid="numeric-reveal-text"
            ref={questionTextRef}
          >
            {reveal.text}
          </div>
        </div>
      </PapyrusPanel>
      <div style={styles.numericAnswerBanner} data-testid="numeric-reveal-answer">
        Σωστή απάντηση: {reveal.answer}
      </div>
      <PapyrusPanel style={{ flex: '0 0 auto', padding: '1.5rem 1.5rem 0.5rem' }}>
        <div style={{ ...styles.numericTrackWrap, height: numericTrackHeight(count) }} data-testid="numeric-track">
          <div style={styles.numericTrackLine} />
          <div style={{ ...styles.numericTick, left: '0%' }}>0</div>
          <div style={{ ...styles.numericTick, left: '100%', transform: 'translateX(-100%)' }}>{reveal.max}</div>
          <div style={{ ...styles.numericAnswerLine, left: `${answerPercent}%` }} data-testid="numeric-answer-marker" />
          <div style={{ ...styles.numericAnswerLabel, left: `${answerPercent}%` }}>{reveal.answer}</div>
          {submitted.map((result) => {
            const percent = (result.value / reveal.max) * 100;
            const lane = laneOf.get(result.playerId) ?? 0;
            return (
              <div
                key={result.playerId}
                data-testid="numeric-reveal-marker"
                data-exact={result.exact}
                style={{ ...styles.numericMarker, left: `${percent}%`, bottom: `${1.1 + lane * lanePitch}rem` }}
              >
                {/* Player identity here is the name text alone - no avatar
                    art, no hue. "Exact" reads via weight only. */}
                <div style={styles.numericMarkerDot} />
                <span
                  style={{
                    ...styles.numericMarkerName,
                    ...numericMarkerNameStyle(count),
                    fontWeight: result.exact ? 800 : styles.numericMarkerName.fontWeight,
                  }}
                >
                  {result.name}
                </span>
              </div>
            );
          })}
        </div>
      </PapyrusPanel>
      <div style={progressBarTrackStyle} data-testid="numeric-reveal-progress">
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
