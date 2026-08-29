import type { CSSProperties } from 'react';
import {
  REVEAL_DURATION_MS,
  type QuestionShowHostPayload,
  type RevealHostPayload,
  type RoomCode,
} from '@game/shared';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

// Ελαιογραφία palette pass - REVEAL's own content (the shared chrome
// - score panel, timer, category - is ported in hostStyles.ts already).
// Correctness is never colour-coded here: it reads purely as
// full-opacity/bold (correct) vs 42%-opacity/regular (wrong) -
// see WRONG_OPACITY below - so nothing here needs a correctness hue.
const WRONG_OPACITY = 0.42;

// Task: each option gets its own bordered box (--wood, on papyrus) instead
// of a bare row - the border colour never changes with correctness, only
// this row's opacity/weight does (see WRONG_OPACITY).
const optionsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1rem',
  width: '100%',
  maxWidth: '1100px',
};

const optionRowStyle = (isCorrect: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  fontSize: '2.25rem',
  fontWeight: isCorrect ? 800 : 500,
  opacity: isCorrect ? 1 : WRONG_OPACITY,
  color: 'var(--ink)',
  padding: '0.75rem 1.25rem',
  border: '1px solid var(--wood)',
  borderRadius: '0.5rem',
});

const answerCountStyle: CSSProperties = {
  marginLeft: 'auto',
  fontWeight: 800,
  color: 'var(--ink)',
};

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--panel)',
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
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto' }}>
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
                <span>{option}</span>
                <span style={answerCountStyle} data-testid="answer-count">
                  {reveal.answerCounts[index]}
                </span>
              </div>
            );
          })}
        </div>
      </PapyrusPanel>
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
