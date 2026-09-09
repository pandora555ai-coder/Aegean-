import type { CSSProperties } from 'react';
import { AGORA_COLOURS, REVEAL_DURATION_MS, type AgoraRevealHostPayload, type RoomCode } from '@game/shared';
import { CheckMark } from '../../components/CheckMark';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Task 163d's rule, reused verbatim from RevealView: correctness is opacity
// + weight + the check-mark shape, never colour. A colour-kind option's OWN
// swatch is not an exception to that - it shows what the option actually IS
// (the awning colour being asked about), not whether it's right.
const WRONG_OPACITY = 0.42;

const optionsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.2cqh 3.5cqh',
  width: '100%',
};

const optionRowStyle = (isCorrect: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '1.6cqh',
  fontSize: '4cqh',
  fontWeight: isCorrect ? 800 : 700,
  opacity: isCorrect ? 1 : WRONG_OPACITY,
  color: 'var(--carve)',
  minWidth: 0,
});

const optionTextStyle: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const answerCountStyle: CSSProperties = {
  marginLeft: 'auto',
  fontWeight: 800,
  fontSize: '2.2cqh',
  color: 'var(--carve)',
  flex: '0 0 auto',
};

const swatchStyle = (hex: string): CSSProperties => ({
  width: '2.4cqh',
  height: '2.4cqh',
  borderRadius: '50%',
  flex: '0 0 auto',
  background: hex,
  border: '0.2cqh solid rgba(43,36,24,0.5)',
});

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
};

// 1x1px, not 0x0 - same reasoning as ClimbRevealView's own marker: Playwright's
// `visible` state needs a non-empty bounding box.
const MARKER_STYLE: CSSProperties = { position: 'fixed', width: 1, height: 1, opacity: 0 };

function colourHexByName(nameGr: string): string | null {
  return AGORA_COLOURS.find((c) => c.nameGr === nameGr)?.hex ?? null;
}

interface AgoraRevealViewProps {
  agoraReveal: AgoraRevealHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  revealSecondsLeft: number;
  // Task 208's own frame alternation, the Anavasis 192 pattern applied to a
  // phase that ISN'T bypassing GameLayout: 'grid' is the brief "here's what
  // was right" beat (this component's own slab, market still closed exactly
  // like AGORA_QUESTION - see HostScreen's isAgoraScenePhase/marketVisible);
  // 'proof' is the market restored with its highlight, and NOTHING else is
  // drawn here then - not even the progress bar - so there is truly zero
  // announcement text over the scene while it shows (criterion 3). HostScreen
  // owns the grid->proof timer (same architecture as AnavasisClimbers' own
  // revealKey-driven beat) since the scene and this view are siblings, not
  // parent/child - see AGORA_REVEAL_GRID_MS there.
  stage: 'grid' | 'proof';
}

export function AgoraRevealView({ agoraReveal, roomCode, paused, pausedByName, revealSecondsLeft, stage }: AgoraRevealViewProps) {
  if (stage === 'proof') {
    return <div aria-hidden="true" style={MARKER_STYLE} data-testid="agora-reveal-marker" key={agoraReveal.questionIndex} />;
  }
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={agoraReveal.standings}
      contentKey={agoraReveal.questionIndex}
    >
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }} data-testid="agora-reveal-slab">
        <div style={optionsGridStyle}>
          {agoraReveal.options.map((option, index) => {
            const isCorrect = index === agoraReveal.correctIndex;
            const swatchHex = agoraReveal.kind === 'colour' ? colourHexByName(option) : null;
            return (
              <div
                key={index}
                data-testid="reveal-option"
                data-correct={isCorrect}
                className={isCorrect ? 'correct-pop' : undefined}
                style={optionRowStyle(isCorrect)}
              >
                <CheckMark visible={isCorrect} />
                {swatchHex && <span aria-hidden="true" style={swatchStyle(swatchHex)} data-testid="agora-swatch" />}
                <span style={optionTextStyle}>{option}</span>
                <span style={answerCountStyle} data-testid="answer-count">
                  {agoraReveal.answerCounts[index]}
                </span>
              </div>
            );
          })}
        </div>
      </MarbleSlab>
      <div style={progressBarTrackStyle} data-testid="reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(revealSecondsLeft / Math.ceil(REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
