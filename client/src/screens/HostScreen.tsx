import { useEffect, useState, type CSSProperties } from 'react';
import {
  ClientEvents,
  MAX_PLAYERS,
  QUESTION_TIME_MS,
  ServerEvents,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  type AnswerProgressPayload,
  type GamePhase,
  type LobbyUpdatePayload,
  type PhaseChangedPayload,
  type QuestionShowHostPayload,
  type QuestionShowPayload,
  type RevealHostPayload,
  type RevealShowPayload,
  type RoomCode,
  type RoomCreatedPayload,
  type ScoreboardPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';

const OPTION_LABELS = ['Α', 'Β', 'Γ', 'Δ'];

export default function HostScreen() {
  const { connected } = useSocketConnection();
  const [roomCode, setRoomCode] = useState<RoomCode | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [question, setQuestion] = useState<QuestionShowHostPayload | null>(null);
  const [answerProgress, setAnswerProgress] = useState<AnswerProgressPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(QUESTION_TIME_MS / 1000));
  const [reveal, setReveal] = useState<RevealHostPayload | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardPayload | null>(null);

  useEffect(() => {
    function handleRoomCreated(payload: RoomCreatedPayload) {
      setRoomCode(payload.code);
    }

    function handleLobbyUpdate(payload: LobbyUpdatePayload) {
      setLobby(payload);
    }

    function handlePhaseChanged(payload: PhaseChangedPayload) {
      setPhase(payload.phase);
    }

    function handleQuestionShow(payload: QuestionShowPayload) {
      if (isQuestionShowHostPayload(payload)) {
        setQuestion(payload);
        setAnswerProgress(null);
        setReveal(null);
        setScoreboard(null);
      }
    }

    function handleAnswerProgress(payload: AnswerProgressPayload) {
      setAnswerProgress(payload);
    }

    function handleRevealShow(payload: RevealShowPayload) {
      if (isRevealHostPayload(payload)) {
        setReveal(payload);
      }
    }

    function handleScoreboardShow(payload: ScoreboardPayload) {
      setScoreboard(payload);
    }

    socket.on(ServerEvents.ROOM_CREATED, handleRoomCreated);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);

    return () => {
      socket.off(ServerEvents.ROOM_CREATED, handleRoomCreated);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'QUESTION' || !question) {
      return;
    }
    setSecondsLeft(Math.ceil(QUESTION_TIME_MS / 1000));
    const interval = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, question?.questionIndex]);

  function handleCreateRoom() {
    socket.emit(ClientEvents.CREATE_ROOM, {});
  }

  function handleStartGame() {
    socket.emit(ClientEvents.START_GAME, {});
  }

  function handleNext() {
    socket.emit(ClientEvents.NEXT, {});
  }

  const players = lobby?.players ?? [];
  const connectedCount = players.filter((player) => player.connected).length;
  const canStart = lobby?.canStart ?? false;

  if (phase === 'REVEAL' && reveal && question) {
    const sortedResults = [...reveal.results].sort((a, b) => b.totalScore - a.totalScore);

    return (
      <div style={styles.container}>
        <div style={styles.progress}>
          Ερώτηση {question.questionIndex + 1}/{question.totalQuestions}
        </div>
        <div style={styles.optionsGrid}>
          {question.options.map((option, index) => (
            <div
              key={index}
              data-testid="reveal-option"
              data-correct={index === reveal.correctIndex}
              style={index === reveal.correctIndex ? styles.optionCardCorrect : styles.optionCard}
            >
              <span style={styles.optionLabel}>{OPTION_LABELS[index]}</span>
              <span>{option}</span>
              <span style={styles.answerCount} data-testid="answer-count">
                {reveal.answerCounts[index]}
              </span>
            </div>
          ))}
        </div>
        <div style={styles.resultsList}>
          {sortedResults.map((result) => (
            <div key={result.playerId} style={styles.resultRow} data-testid="reveal-result">
              <span style={result.correct ? styles.resultNameCorrect : styles.resultNameWrong}>
                {result.correct ? '✓' : '✗'} {result.name}
              </span>
              <span style={styles.resultPoints}>
                +{result.pointsAwarded} ({result.totalScore})
              </span>
            </div>
          ))}
        </div>
        <button data-testid="continue-button" style={styles.startButton} type="button" onClick={handleNext}>
          Συνέχεια
        </button>
      </div>
    );
  }

  if (phase === 'SCOREBOARD' && scoreboard) {
    const sortedStandings = [...scoreboard.standings].sort((a, b) => a.rank - b.rank);

    return (
      <div style={styles.container}>
        <div style={styles.progress}>
          Ερώτηση {scoreboard.questionIndex + 1}/{scoreboard.totalQuestions} ολοκληρώθηκε
        </div>
        <div style={styles.standingsList}>
          {sortedStandings.map((standing) => (
            <div
              key={standing.playerId}
              data-testid="standing-row"
              data-connected={standing.connected}
              style={standing.connected ? styles.standingRow : styles.standingRowDisconnected}
            >
              <span style={styles.standingRank}>#{standing.rank}</span>
              <span style={styles.standingName}>
                {standing.name}
                {!standing.connected && ' (αποσυνδέθηκε)'}
              </span>
              <span style={styles.standingScore}>{standing.score}</span>
            </div>
          ))}
        </div>
        <button data-testid="next-button" style={styles.startButton} type="button" onClick={handleNext}>
          {scoreboard.isLastQuestion ? 'Τελικά αποτελέσματα' : 'Επόμενη'}
        </button>
      </div>
    );
  }

  if (phase === 'QUESTION' && question) {
    const answeredIds = new Set(answerProgress?.answeredPlayerIds ?? []);
    const answeredCount = answerProgress?.answered ?? 0;
    const totalCount = answerProgress?.total ?? connectedCount;

    return (
      <div style={styles.container}>
        <div style={styles.timer} data-testid="countdown">
          {secondsLeft}
        </div>
        <div style={styles.category}>{question.category}</div>
        <div style={styles.progress} data-testid="question-progress">
          Ερώτηση {question.questionIndex + 1}/{question.totalQuestions}
        </div>
        <div style={styles.questionText} data-testid="question-text">
          {question.question}
        </div>
        <div style={styles.optionsGrid}>
          {question.options.map((option, index) => (
            <div key={index} style={styles.optionCard} data-testid="host-option">
              <span style={styles.optionLabel}>{OPTION_LABELS[index]}</span>
              <span>{option}</span>
            </div>
          ))}
        </div>
        <div style={styles.answerCounter} data-testid="answer-progress">
          {answeredCount}/{totalCount} απάντησαν
        </div>
        <div style={styles.answeredNames}>
          {players.map((player) => (
            <span
              key={player.playerId}
              data-testid="answered-marker"
              data-answered={answeredIds.has(player.playerId)}
              style={answeredIds.has(player.playerId) ? styles.nameAnswered : styles.nameNotAnswered}
            >
              {player.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>

      {roomCode === null ? (
        <button style={styles.createButton} type="button" onClick={handleCreateRoom} disabled={!connected}>
          Create Room
        </button>
      ) : (
        <>
          <div data-testid="room-code" style={styles.code}>
            {roomCode.split('').join(' ')}
          </div>

          <div data-testid="player-counter" style={styles.counter}>
            {connectedCount}/{MAX_PLAYERS} παίκτες
          </div>

          <div style={styles.playerList}>
            {players.map((player) => (
              <div
                key={player.playerId}
                data-testid="player-row"
                data-connected={player.connected}
                style={player.connected ? styles.playerName : styles.playerNameDisconnected}
              >
                {player.name}
                {!player.connected && ' (αποσυνδέθηκε)'}
              </div>
            ))}
          </div>

          {canStart ? (
            <button data-testid="start-button" style={styles.startButton} type="button" onClick={handleStartGame}>
              Έναρξη
            </button>
          ) : (
            <div data-testid="waiting-message" style={styles.waitingMessage}>
              Περιμένουμε παίκτες...
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '3rem 2rem',
  },
  status: { fontSize: '1.25rem', color: '#666' },
  createButton: {
    fontSize: '2rem',
    padding: '1.5rem 3rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontWeight: 700,
  },
  code: {
    fontSize: '8rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.5em',
  },
  counter: {
    fontSize: '2.5rem',
    fontWeight: 700,
  },
  playerList: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '2.5rem',
    minHeight: '3rem',
  },
  playerName: {
    fontWeight: 600,
  },
  playerNameDisconnected: {
    fontWeight: 600,
    opacity: 0.4,
  },
  waitingMessage: {
    fontSize: '2.5rem',
    fontWeight: 600,
    color: '#999',
  },
  startButton: {
    fontSize: '3rem',
    padding: '1.5rem 4rem',
    borderRadius: '1rem',
    border: 'none',
    background: '#16a34a',
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer',
  },
  category: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  progress: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#999',
  },
  questionText: {
    fontSize: '4rem',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.3,
    maxWidth: '90%',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    width: '100%',
    maxWidth: '1100px',
  },
  optionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 600,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    background: '#f3f4f6',
    border: '3px solid #d1d5db',
  },
  optionLabel: {
    fontWeight: 800,
    color: '#2563eb',
    minWidth: '2rem',
  },
  timer: {
    fontSize: '3rem',
    fontWeight: 800,
    fontFamily: 'monospace',
    color: '#dc2626',
  },
  answerCounter: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#16a34a',
  },
  answeredNames: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.75rem',
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  nameAnswered: {
    color: '#16a34a',
  },
  nameNotAnswered: {
    color: '#bbb',
  },
  optionCardCorrect: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    background: '#dcfce7',
    border: '3px solid #16a34a',
  },
  answerCount: {
    marginLeft: 'auto',
    fontWeight: 800,
    color: '#666',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    width: '100%',
    maxWidth: '700px',
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '1.75rem',
    fontWeight: 600,
    padding: '0.5rem 1rem',
  },
  resultNameCorrect: {
    color: '#16a34a',
  },
  resultNameWrong: {
    color: '#dc2626',
  },
  resultPoints: {
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  standingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    maxWidth: '800px',
  },
  standingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: '#f3f4f6',
  },
  standingRowDisconnected: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: '#f3f4f6',
    opacity: 0.4,
  },
  standingRank: {
    color: '#2563eb',
    minWidth: '3rem',
  },
  standingName: {
    flex: 1,
  },
  standingScore: {
    fontFamily: 'monospace',
  },
};
