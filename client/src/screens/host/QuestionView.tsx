import { useRef } from 'react';
import {
  type AnswerProgressPayload,
  type LobbyPlayer,
  type QuestionShowHostPayload,
  type RoomCode,
} from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { answeredAvatarSize, answeredNamesSizeStyle, styles } from './hostStyles';

interface QuestionViewProps {
  question: QuestionShowHostPayload;
  answerProgress: AnswerProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
  players: LobbyPlayer[];
  connectedCount: number;
}

export function QuestionView({
  question,
  answerProgress,
  roomCode,
  paused,
  pausedByName,
  secondsLeft,
  players,
  connectedCount,
}: QuestionViewProps) {
  const answeredIds = new Set(answerProgress?.answeredPlayerIds ?? []);
  const answeredCount = answerProgress?.answered ?? 0;
  const totalCount = answerProgress?.total ?? connectedCount;

  const timerCritical = !paused && secondsLeft <= 5 && secondsLeft > 0;
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(questionBlockRef, questionTextRef, [question.question, question.questionIndex, players.length], {
    maxRem: 6,
    minRem: 2,
  });
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={question.standings}
      contentKey={question.questionIndex}
    >
      {/* Socrates (Task 24, renamed Task 37a) - HOST ONLY, briefly shown
          then fades on its own via CSS (socrates-intro-fade, see
          theme.css) - no JS timer, so it can never delay anything else on
          this screen. The player side's answer buttons are unaffected
          regardless, since socratesIntro is never even sent in the player
          payload. Conditionally rendered, same reasoning as socratesLine
          on REVEAL - no gap when null. */}
      {question.socratesIntro && (
        <div className="socrates-intro-fade" style={styles.socratesIntroBanner} data-testid="socrates-intro">
          {question.socratesIntro}
        </div>
      )}
      <div className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'} style={styles.timerRingWrap}>
        <div className={timerCritical ? 'timer-critical' : undefined} style={styles.timer} data-testid="countdown">
          {secondsLeft}
        </div>
      </div>
      <div className="enter-pop" style={styles.category}>
        {question.category}
      </div>
      {/* Task 29: the TV shows the question only - no options. Reading four
          answers off the TV and then hunting for the matching button on the
          phone splits attention; the phone already has every option. The
          options come back at REVEAL, where the TV is the only place the
          correct one is shown. Render-only: the host payload still carries
          question.options untouched. questionBlock is the ONLY child of
          questionTextRef's fit measurement, so its own flexed height maps
          1:1 to the text's available space - see useFitFontSize. */}
      <PapyrusPanel className="enter-pop">
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--ink)' }}
            data-testid="question-text"
            ref={questionTextRef}
          >
            {question.question}
          </div>
        </div>
      </PapyrusPanel>
      <div style={styles.answerCounter} data-testid="answer-progress">
        {answeredCount}/{totalCount} απάντησαν
      </div>
      <div style={{ ...styles.answeredNames, ...answeredNamesSizeStyle(players.length) }}>
        {players.map((player) => {
          const answered = answeredIds.has(player.playerId);
          return (
            <span
              key={player.playerId}
              data-testid="answered-marker"
              data-answered={answered}
              style={answered ? styles.nameAnswered : styles.nameNotAnswered}
            >
              <Avatar avatarId={player.avatarId} sizeRem={answeredAvatarSize(players.length)} />
              {answered ? '✓ ' : ''}
              {player.name}
            </span>
          );
        })}
      </div>
    </GameLayout>
  );
}
