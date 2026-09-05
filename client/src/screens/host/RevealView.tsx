import type { CSSProperties } from 'react';
import {
  REVEAL_DURATION_MS,
  type QuestionShowHostPayload,
  type RevealHostPayload,
  type RoomCode,
} from '@game/shared';
import { CheckMark } from '../../components/CheckMark';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Task 163d - correctness is never colour-coded: full opacity + heavier
// weight + the check-mark shape (CheckMark, --wine-2) for the right answer,
// 42% opacity for the rest. design/theatre-reference.html's own .opts (2
// columns, gap 1.2cqh/3.5cqh, 4cqh/700 base) and .opt/.opt.ok - sized in
// cqh off #root (palette-theatro.css), not rem/vh, so it scales with the TV
// frame rather than needing a densityScale step table the way the old
// boxed-card version never had one for anyway. Literal reference figures -
// see CheckMark.tsx's comment for why these no longer need doubling.
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

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
};

interface RevealViewProps {
  reveal: RevealHostPayload;
  question: QuestionShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  revealSecondsLeft: number;
}

// Task 115 - the papyrus reads, the column carries players: the per-player
// results list under the options is gone (name, avatar, answer rank, time and
// +N per row). Every one of those rows named a player the right-hand score
// column already lists, with the same +N beside the same name. What survives
// on the papyrus is the four options and how many picked each - an aggregate
// of the answers, not a roll-call of the room.
export function RevealView({ reveal, question, roomCode, paused, pausedByName, revealSecondsLeft }: RevealViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={reveal.standings}
      contentKey={question.questionIndex}
    >
      {/* Socrates' commentary is NOT here any more (Task 39): it gets its
          own phase after this one, alone on screen, instead of a banner
          crowding the results. */}
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={optionsGridStyle}>
          {question.options.map((option, index) => {
            const isCorrect = index === reveal.correctIndex;
            return (
              <div
                key={index}
                data-testid="reveal-option"
                data-correct={isCorrect}
                className={isCorrect ? 'correct-pop' : undefined}
                style={optionRowStyle(isCorrect)}
              >
                <CheckMark visible={isCorrect} />
                <span style={optionTextStyle}>{option}</span>
                <span style={answerCountStyle} data-testid="answer-count">
                  {reveal.answerCounts[index]}
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
