import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import {
  DEFAULT_ROOM_SETTINGS,
  sliderStepForMax,
  type DrawShowHostPayload,
  type GameModeOption,
  type GameOverPayload,
  type GamePhase,
  type GuessRevealShowPayload,
  type GuessShowHostPayload,
  type NumericQuestionShowHostPayload,
  type NumericRevealShowPayload,
  type PlayerStanding,
  type PowerUpShowHostPayload,
  type QuestionShowHostPayload,
  type RevealHostPayload,
  type SocratesShowPayload,
  type StageAnnouncePayload,
  type StealShowHostPayload,
} from '@game/shared';
import { DrawView } from './host/DrawView';
import { GameOverView } from './host/GameOverView';
import { GuessRevealView } from './host/GuessRevealView';
import { GuessView } from './host/GuessView';
import { LobbyView } from './host/LobbyView';
import { SophistsRow } from '../components/SophistsRow';
import { styles as hostStyles } from './host/hostStyles';
import { Krater, type TimerState } from '../components/Krater';
import { NumericQuestionView } from './host/NumericQuestionView';
import { NumericRevealView } from './host/NumericRevealView';
import { PowerUpView } from './host/PowerUpView';
import { QuestionView } from './host/QuestionView';
import { RevealView } from './host/RevealView';
import { TheatreScene, isSceneLit } from '../components/TheatreScene';
import { SocratesView } from './host/SocratesView';
import { StageAnnounceOverlay } from './host/StageAnnounceOverlay';
import { StealView } from './host/StealView';

// Task 106 - fixed fake state for every /host phase, so this route needs
// neither a server nor a room. Every field a view actually reads is filled
// in; nothing here is meant to be internally consistent across phases (each
// entry is its own isolated snapshot, not one continuous fake game).
const ROOM_CODE = '1234';

const STANDINGS: PlayerStanding[] = [
  { playerId: 'p1', name: 'Γιώργος', avatarId: 'minotaur', score: 1200, rank: 1, connected: true },
  { playerId: 'p2', name: 'Ελένη', avatarId: 'medusa', score: 900, rank: 2, connected: true },
  { playerId: 'p3', name: 'Νίκος', avatarId: 'cyclops', score: 900, rank: 2, connected: true },
  { playerId: 'p4', name: 'Μαρία', avatarId: 'centaur', score: 400, rank: 4, connected: false },
  { playerId: 'p5', name: 'Δημήτρης', avatarId: 'cerberus', score: 100, rank: 5, connected: true },
];

const AVAILABLE_MODES: GameModeOption[] = [
  { id: 'quiz', label: 'Κουίζ', minPlayers: 2 },
  { id: 'draw', label: 'Ζωγραφική', minPlayers: 3 },
  { id: 'numeric', label: 'Αριθμητικές', minPlayers: 2 },
];

// A small inline SVG so DRAW/GUESS/GUESS_REVEAL show an actual picture
// instead of a broken-image icon - no real drawing exists in a fake state.
const FAKE_DRAWING =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23fdf6e3"/><circle cx="200" cy="150" r="90" fill="none" stroke="%233a2f22" stroke-width="6"/><path d="M140 150h120M200 90v120" stroke="%233a2f22" stroke-width="6"/></svg>',
  );

const stageAnnounce: StageAnnouncePayload = {
  stage: 2,
  totalStages: 3,
  title: 'Γύρος Β',
  tagline: 'Η αναμέτρηση συνεχίζεται',
  questionCount: 5,
  firstQuestionIndex: 3,
  totalQuestions: 12,
};

const powerUp: PowerUpShowHostPayload = {
  questionIndex: 3,
  totalQuestions: 12,
  durationMs: 10000,
  chosenCount: 2,
  totalPlayers: 5,
  chosenPlayerIds: ['p1', 'p2'],
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const question: QuestionShowHostPayload = {
  questionIndex: 3,
  totalQuestions: 12,
  question: 'Ποια είναι η πρωτεύουσα της Ελλάδας;',
  options: ['Αθήνα', 'Θεσσαλονίκη', 'Πάτρα', 'Ηράκλειο'],
  category: 'Γεωγραφία',
  questionTimeMs: 20000,
  paused: false,
  pausedByName: null,
  socratesIntro: null,
  standings: STANDINGS,
};

const reveal: RevealHostPayload = {
  correctIndex: 0,
  correctOption: 'Αθήνα',
  results: [
    { playerId: 'p1', name: 'Γιώργος', avatarId: 'minotaur', choice: 0, correct: true, pointsAwarded: 950, totalScore: 1200, timeMs: 1200, answerRank: 1 },
    { playerId: 'p2', name: 'Ελένη', avatarId: 'medusa', choice: 0, correct: true, pointsAwarded: 800, totalScore: 900, timeMs: 3400, answerRank: 2 },
    { playerId: 'p3', name: 'Νίκος', avatarId: 'cyclops', choice: 1, correct: false, pointsAwarded: 0, totalScore: 900, timeMs: 2100, answerRank: null },
    { playerId: 'p4', name: 'Μαρία', avatarId: 'centaur', choice: null, correct: false, pointsAwarded: 0, totalScore: 400, timeMs: null, answerRank: null },
    { playerId: 'p5', name: 'Δημήτρης', avatarId: 'cerberus', choice: 2, correct: false, pointsAwarded: 0, totalScore: 100, timeMs: 5000, answerRank: null },
  ],
  answerCounts: [2, 1, 1, 0],
  autoAdvanceMs: 8000,
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const steal: StealShowHostPayload = {
  questionIndex: 8,
  totalQuestions: 12,
  durationMs: 8000,
  thiefPlayerId: 'p1',
  thiefName: 'Γιώργος',
  thiefAvatarId: 'minotaur',
  amount: 350,
  standings: STANDINGS,
  resolved: {
    thiefPlayerId: 'p1',
    thiefName: 'Γιώργος',
    thiefAvatarId: 'minotaur',
    victimPlayerId: 'p2',
    victimName: 'Ελένη',
    victimAvatarId: 'medusa',
    attemptedAmount: 350,
    stolenAmount: 350,
    thiefScore: 1550,
    victimScore: 550,
  },
  paused: false,
  pausedByName: null,
};

const socrates: SocratesShowPayload = {
  line: 'Η γνώση είναι η μόνη λεία που αξίζει να κλέψεις.',
  lineTemplate: 'Η γνώση είναι η μόνη λεία που αξίζει να κλέψεις.',
  lineTag: null,
  questionIndex: 8,
  totalQuestions: 12,
  durationMs: 4000,
  totalDurationMs: 4000,
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const draw: DrawShowHostPayload = {
  durationMs: 60000,
  submittedCount: 2,
  totalPlayers: 5,
  submittedPlayerIds: ['p1', 'p2'],
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const guess: GuessShowHostPayload = {
  drawerPlayerId: 'p3',
  drawerName: 'Νίκος',
  drawerAvatarId: 'cyclops',
  image: FAKE_DRAWING,
  options: ['Αμφορέας', 'Βάζο', 'Μπουκάλι', 'Κύπελλο'],
  roundIndex: 0,
  totalRounds: 5,
  durationMs: 30000,
  guessedCount: 1,
  totalGuessers: 4,
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const guessReveal: GuessRevealShowPayload = {
  drawerPlayerId: 'p3',
  drawerName: 'Νίκος',
  drawerAvatarId: 'cyclops',
  image: FAKE_DRAWING,
  correctIndex: 0,
  correctWord: 'Αμφορέας',
  options: ['Αμφορέας', 'Βάζο', 'Μπουκάλι', 'Κύπελλο'],
  results: [
    { playerId: 'p1', name: 'Γιώργος', avatarId: 'minotaur', choice: 0, correct: true, pointsAwarded: 280, totalScore: 1480, timeMs: 2200 },
    { playerId: 'p2', name: 'Ελένη', avatarId: 'medusa', choice: 1, correct: false, pointsAwarded: 0, totalScore: 900, timeMs: 4100 },
    { playerId: 'p4', name: 'Μαρία', avatarId: 'centaur', choice: null, correct: false, pointsAwarded: 0, totalScore: 400, timeMs: null },
    { playerId: 'p5', name: 'Δημήτρης', avatarId: 'cerberus', choice: 0, correct: true, pointsAwarded: 150, totalScore: 250, timeMs: 6800 },
  ],
  drawerPointsAwarded: 120,
  drawerTotalScore: 1020,
  roundIndex: 0,
  totalRounds: 5,
  autoAdvanceMs: 8000,
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const numericQuestion: NumericQuestionShowHostPayload = {
  questionIndex: 2,
  totalQuestions: 6,
  text: 'Πόσα μέλη έχει η Βουλή των Ελλήνων;',
  category: 'Πολιτεία',
  max: 500,
  sliderStep: sliderStepForMax(500),
  durationMs: 20000,
  submittedCount: 3,
  totalPlayers: 5,
  submittedPlayerIds: ['p1', 'p2', 'p3'],
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const numericReveal: NumericRevealShowPayload = {
  questionIndex: 2,
  totalQuestions: 6,
  text: 'Πόσα μέλη έχει η Βουλή των Ελλήνων;',
  category: 'Πολιτεία',
  answer: 300,
  max: 500,
  results: [
    { playerId: 'p1', name: 'Γιώργος', avatarId: 'minotaur', value: 300, distance: 0, rank: 1, exact: true, pointsAwarded: 500, totalScore: 1700 },
    { playerId: 'p2', name: 'Ελένη', avatarId: 'medusa', value: 250, distance: 50, rank: 2, exact: false, pointsAwarded: 300, totalScore: 1200 },
    { playerId: 'p3', name: 'Νίκος', avatarId: 'cyclops', value: 400, distance: 100, rank: 3, exact: false, pointsAwarded: 150, totalScore: 1050 },
    { playerId: 'p4', name: 'Μαρία', avatarId: 'centaur', value: null, distance: 500, rank: 5, exact: false, pointsAwarded: 0, totalScore: 400 },
    { playerId: 'p5', name: 'Δημήτρης', avatarId: 'cerberus', value: 150, distance: 150, rank: 4, exact: false, pointsAwarded: 50, totalScore: 150 },
  ],
  autoAdvanceMs: 8000,
  paused: false,
  pausedByName: null,
  standings: STANDINGS,
};

const gameOver: GameOverPayload = {
  standings: [
    { playerId: 'p1', name: 'Γιώργος', avatarId: 'minotaur', score: 1800, rank: 1 },
    { playerId: 'p2', name: 'Ελένη', avatarId: 'medusa', score: 1500, rank: 2 },
    { playerId: 'p3', name: 'Νίκος', avatarId: 'cyclops', score: 1500, rank: 2 },
    { playerId: 'p4', name: 'Μαρία', avatarId: 'centaur', score: 900, rank: 4 },
    { playerId: 'p5', name: 'Δημήτρης', avatarId: 'cerberus', score: 400, rank: 5 },
  ],
  winnerName: 'Γιώργος',
  isTie: false,
  isTrialResult: false,
  totalQuestions: 12,
};

// Task 106 - the phase list this route steps through, and the order arrow
// keys/the on-screen buttons move through it: quiz's own sequence (as
// CLAUDE.md's Phases section has it), then DRAW/GUESS/GUESS_REVEAL,
// NUMERIC_QUESTION/NUMERIC_REVEAL (both modes skip STAGE_ANNOUNCE - see
// CLAUDE.md), and GAME_OVER last since every mode ends there.
// Task 112/161 - the same shell HostScreen owns, so this stepper shows what
// a real TV shows: phase content in the read column at the top, the krater
// at the top-right, the sophists row on the orchestra below (rendered once
// by DevSceneScreen itself, like HostScreen, so it survives the phase
// stepping). Without this the views render alone and the timer is simply
// absent from the preview.
function shell(standings: PlayerStanding[], timer: TimerState | null, content: ReactElement): ReactElement {
  return (
    <>
      <div style={hostStyles.gameLayout}>{content}</div>
      {timer && (
        <div style={hostStyles.kraterCorner}>
          <Krater timer={timer} playerCount={standings.length} />
        </div>
      )}
    </>
  );
}

const PHASES: Array<{ phase: GamePhase; render: () => ReactElement }> = [
  {
    phase: 'LOBBY',
    render: () => (
      <LobbyView
        connected
        roomCode={ROOM_CODE}
        isRejoining={false}
        wakeLockFailed={false}
        phase="LOBBY"
        muted={false}
        onToggleMuted={() => {}}
        onCreateRoom={() => {}}
        qrCanvasRef={{ current: null }}
        roomSettings={DEFAULT_ROOM_SETTINGS}
        mode="quiz"
        availableModes={AVAILABLE_MODES}
      />
    ),
  },
  { phase: 'STAGE_ANNOUNCE', render: () => <StageAnnounceOverlay announce={stageAnnounce} /> },
  {
    phase: 'POWER_UP',
    render: () => (
      shell(
        powerUp.standings,
        { secondsLeft: 7, totalSeconds: 10, critical: false },
        <PowerUpView powerUp={powerUp} roomCode={ROOM_CODE} paused={false} pausedByName={null} />,
      )
    ),
  },
  {
    phase: 'QUESTION',
    render: () => (
      shell(
        question.standings,
        { secondsLeft: 14, totalSeconds: 20, critical: false },
        <QuestionView question={question} roomCode={ROOM_CODE} paused={false} pausedByName={null} />,
      )
    ),
  },
  {
    phase: 'REVEAL',
    render: () => (
      shell(
        reveal.standings,
        null,
        <RevealView reveal={reveal} question={question} roomCode={ROOM_CODE} paused={false} pausedByName={null} revealSecondsLeft={5} />,
      )
    ),
  },
  {
    phase: 'STEAL',
    render: () =>
      shell(
        steal.standings,
        { secondsLeft: 4, totalSeconds: 8, critical: false },
        <StealView steal={steal} roomCode={ROOM_CODE} paused={false} pausedByName={null} />,
      ),
  },
  {
    phase: 'SOCRATES',
    render: () =>
      shell(
        socrates.standings,
        null,
        <SocratesView socrates={socrates} roomCode={ROOM_CODE} paused={false} pausedByName={null} />,
      ),
  },
  {
    phase: 'DRAW',
    render: () => (
      shell(
        draw.standings,
        { secondsLeft: 42, totalSeconds: 60, critical: false },
        <DrawView draw={draw} roomCode={ROOM_CODE} paused={false} pausedByName={null} />,
      )
    ),
  },
  {
    phase: 'GUESS',
    render: () =>
      shell(
        guess.standings,
        { secondsLeft: 18, totalSeconds: 25, critical: false },
        <GuessView guess={guess} roomCode={ROOM_CODE} paused={false} pausedByName={null} />,
      ),
  },
  {
    phase: 'GUESS_REVEAL',
    render: () => (
      shell(
        guessReveal.standings,
        null,
        <GuessRevealView guessReveal={guessReveal} roomCode={ROOM_CODE} paused={false} pausedByName={null} secondsLeft={5} />,
      )
    ),
  },
  {
    phase: 'NUMERIC_QUESTION',
    render: () => (
      shell(
        numericQuestion.standings,
        { secondsLeft: 12, totalSeconds: 15, critical: false },
        <NumericQuestionView question={numericQuestion} roomCode={ROOM_CODE} paused={false} pausedByName={null} />,
      )
    ),
  },
  {
    phase: 'NUMERIC_REVEAL',
    render: () => (
      shell(
        numericReveal.standings,
        null,
        <NumericRevealView reveal={numericReveal} roomCode={ROOM_CODE} paused={false} pausedByName={null} secondsLeft={6} />,
      )
    ),
  },
  { phase: 'GAME_OVER', render: () => <GameOverView gameOver={gameOver} /> },
];

// Task 106 - dev-only phase stepper: the REAL host views and the REAL
// TheatreScene, fed fixed fake data, no server/room involved. Arrow
// Left/Right and the on-screen buttons step through PHASES.
export default function DevSceneScreen() {
  const [index, setIndex] = useState(0);
  const current = PHASES[index];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        setIndex((i) => Math.min(i + 1, PHASES.length - 1));
      } else if (event.key === 'ArrowLeft') {
        setIndex((i) => Math.max(i - 1, 0));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <TheatreScene mood="calm" dimmed={!isSceneLit(current.phase)} />
      {current.render()}
      <SophistsRow
        standings={current.phase === 'GAME_OVER' ? gameOver.standings : STANDINGS}
        phase={current.phase}
        deltas={
          current.phase === 'REVEAL'
            ? Object.fromEntries(reveal.results.map((result) => [result.playerId, result.pointsAwarded]))
            : null
        }
      />
      <div style={styles.bar} data-testid="dev-scene-bar">
        <button type="button" style={styles.navButton} onClick={() => setIndex((i) => Math.max(i - 1, 0))} data-testid="dev-scene-prev">
          ← Prev
        </button>
        <span style={styles.label} data-testid="dev-scene-phase">
          {index + 1}/{PHASES.length} · {current.phase}
        </span>
        <button
          type="button"
          style={styles.navButton}
          onClick={() => setIndex((i) => Math.min(i + 1, PHASES.length - 1))}
          data-testid="dev-scene-next"
        >
          Next →
        </button>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    position: 'fixed',
    left: '50%',
    bottom: '1rem',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.6rem',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
  },
  navButton: {
    padding: '0.35rem 0.75rem',
    borderRadius: '0.4rem',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    cursor: 'pointer',
  },
  label: {
    minWidth: '14rem',
    textAlign: 'center',
  },
};
