import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ClientEvents,
  DEFAULT_ROOM_SETTINGS,
  MAX_PLAYERS,
  REVEAL_DURATION_MS,
  SCOREBOARD_DURATION_MS,
  ServerEvents,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  type AnswerProgressPayload,
  type GameOverPayload,
  type GamePhase,
  type LobbyUpdatePayload,
  type PhaseChangedPayload,
  type QuestionShowHostPayload,
  type QuestionShowPayload,
  type RevealHostPayload,
  type RevealShowPayload,
  type RoomCode,
  type RoomCreatedPayload,
  type RoomSettings,
  type ScoreboardPayload,
  type ServerErrorPayload,
  type SettingsUpdatedPayload,
  type StateSyncPayload,
} from '@game/shared';
import QRCode from 'qrcode';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { clearStoredHostRoomCode, getStoredHostRoomCode, setStoredHostRoomCode } from '../hostRoomCode';
import { DIFFICULTY_MIX_LABELS } from '../difficultyLabels';

const OPTION_LABELS = ['Α', 'Β', 'Γ', 'Δ'];
const QR_SIZE_PX = 240; // comfortably above the "at least 200px" floor

export default function HostScreen() {
  const { connected } = useSocketConnection();
  const [roomCode, setRoomCode] = useState<RoomCode | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [question, setQuestion] = useState<QuestionShowHostPayload | null>(null);
  const [answerProgress, setAnswerProgress] = useState<AnswerProgressPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(DEFAULT_ROOM_SETTINGS.questionTimeMs / 1000));
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [reveal, setReveal] = useState<RevealHostPayload | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [revealSecondsLeft, setRevealSecondsLeft] = useState(0);
  const [scoreboardSecondsLeft, setScoreboardSecondsLeft] = useState(0);
  const [wakeLockFailed, setWakeLockFailed] = useState(false);
  // True from mount only when a stored room code exists - keeps the
  // "Create Room" button from flashing while a host:rejoin is in flight.
  const [isRejoining, setIsRejoining] = useState(() => !!getStoredHostRoomCode());
  // Mirrors `roomCode` for handlers registered once (empty dep array) that
  // still need the LATEST value - avoids a stale-closure read of `roomCode`.
  const roomCodeRef = useRef<RoomCode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    function handleRoomCreated(payload: RoomCreatedPayload) {
      setRoomCode(payload.code);
      roomCodeRef.current = payload.code;
      setIsRejoining(false);
      setStoredHostRoomCode(payload.code);
      startKeepAliveAudio();
    }

    // A failed host:rejoin (the stored room no longer exists server-side) -
    // the only thing that currently emits server:error. Drop the stale
    // code and fall back to the create screen.
    function handleServerError(payload: ServerErrorPayload) {
      console.warn(`server error: ${payload.message}`);
      clearStoredHostRoomCode();
      roomCodeRef.current = null;
      setRoomCode(null);
      setIsRejoining(false);
    }

    function handleLobbyUpdate(payload: LobbyUpdatePayload) {
      setLobby(payload);
      setRoomSettings(payload.settings);
    }

    function handleSettingsUpdated(payload: SettingsUpdatedPayload) {
      setRoomSettings(payload);
    }

    function handlePhaseChanged(payload: PhaseChangedPayload) {
      setPhase(payload.phase);
      if (payload.phase === 'LOBBY') {
        // A fresh game (via "play again") - clear every transient round view
        // so the lobby renders cleanly instead of a stale QUESTION/REVEAL/
        // SCOREBOARD/GAME_OVER screen flashing first.
        setQuestion(null);
        setAnswerProgress(null);
        setReveal(null);
        setScoreboard(null);
        setGameOver(null);
        // Re-arm recovery for game 2+: GAME_OVER clears the stored code
        // below, so a fresh "play again" round needs it set again for a
        // mid-game refresh to still auto-rejoin.
        if (roomCodeRef.current) {
          setStoredHostRoomCode(roomCodeRef.current);
        }
      }
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

    function handleGameOver(payload: GameOverPayload) {
      setGameOver(payload);
      // The game concluded - nothing left to recover on a future refresh
      // unless/until "play again" makes the room live again (see
      // handlePhaseChanged's LOBBY branch, which re-arms this).
      clearStoredHostRoomCode();
    }

    // Catches the TV display up to whatever's live right now - the normal
    // path after host:rejoin (a fresh page load recovering a stored room
    // code, or socket.io's own automatic reconnect after the TV wakes up).
    function handleStateSync(payload: StateSyncPayload) {
      setPhase(payload.phase);
      setQuestion(null);
      setAnswerProgress(null);
      setReveal(null);
      setScoreboard(null);
      setGameOver(null);

      switch (payload.phase) {
        case 'LOBBY':
          setRoomCode(payload.code);
          roomCodeRef.current = payload.code;
          setLobby({ code: payload.code, players: payload.players, canStart: payload.canStart, settings: payload.settings });
          setRoomSettings(payload.settings);
          break;
        case 'QUESTION':
          if (isQuestionShowHostPayload(payload)) {
            setQuestion(payload);
          }
          break;
        case 'REVEAL':
          if (isRevealHostPayload(payload)) {
            setReveal(payload);
          }
          break;
        case 'SCOREBOARD':
          setScoreboard(payload);
          break;
        case 'GAME_OVER':
          setGameOver(payload);
          break;
      }
    }

    socket.on(ServerEvents.ROOM_CREATED, handleRoomCreated);
    socket.on(ServerEvents.ERROR, handleServerError);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);
    socket.on(ServerEvents.GAME_OVER, handleGameOver);
    socket.on(ServerEvents.STATE_SYNC, handleStateSync);
    socket.on(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);

    return () => {
      socket.off(ServerEvents.ROOM_CREATED, handleRoomCreated);
      socket.off(ServerEvents.ERROR, handleServerError);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);
      socket.off(ServerEvents.GAME_OVER, handleGameOver);
      socket.off(ServerEvents.STATE_SYNC, handleStateSync);
      socket.off(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'QUESTION' || !question) {
      return;
    }
    // The ROOM's configured per-question time, not a global default - a
    // 10s room must count down from 10, not from whatever the app's
    // hardcoded value used to be.
    setSecondsLeft(Math.ceil(question.questionTimeMs / 1000));
    const interval = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, question?.questionIndex, question?.questionTimeMs]);

  // Local countdowns driving the REVEAL/SCOREBOARD progress bars - purely
  // cosmetic, so the moment doesn't feel abrupt. The server's own timers are
  // what actually advance the game; these never have to be trusted.
  useEffect(() => {
    if (!reveal) {
      return;
    }
    setRevealSecondsLeft(Math.ceil(reveal.autoAdvanceMs / 1000));
    const interval = setInterval(() => {
      setRevealSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [reveal]);

  useEffect(() => {
    if (!scoreboard) {
      return;
    }
    setScoreboardSecondsLeft(Math.ceil(scoreboard.autoAdvanceMs / 1000));
    const interval = setInterval(() => {
      setScoreboardSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [scoreboard]);

  // Screen wake lock - the TV/tablet must not sleep mid-game, or the
  // WebSocket freezes and the host connection drops. Tracks whether it
  // actually succeeded (Tizen and others silently ignore this API entirely)
  // so the lobby can hint at a manual fallback instead of failing silently.
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) {
        setWakeLockFailed(true);
        return;
      }
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        setWakeLockFailed(false);
      } catch {
        // e.g. some browsers reject while the tab is hidden - visibilitychange
        // below retries once the page is visible again.
        setWakeLockFailed(true);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        // AudioContexts get suspended when backgrounded - best effort retry.
        audioCtxRef.current?.resume().catch(() => {});
      }
    }

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLock?.release().catch(() => {});
    };
  }, []);

  // Silent Web Audio keep-alive - best effort suppression of the TV's own
  // screensaver/idle detection, which (unlike the Wake Lock API) many smart
  // TV browsers respect for "still doing something" heuristics. Deliberately
  // no audio ASSET: the loop is generated entirely in code.
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  function startKeepAliveAudio() {
    if (audioCtxRef.current) {
      return; // already running
    }
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return; // unsupported - fail silently, this is best-effort only
      }
      const ctx = new AudioContextCtor();
      const gain = ctx.createGain();
      // NOT exactly 0 - some platforms treat true silence as "not playing"
      // and suspend/drop the context anyway, defeating the whole point.
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const oscillator = ctx.createOscillator();
      oscillator.connect(gain);
      oscillator.start();
      audioCtxRef.current = ctx;
    } catch {
      // Best effort - AudioContext unavailable or blocked. Continue without it.
    }
  }

  // Auto-recovery: on EVERY successful connection - the very first one on
  // mount, and every automatic reconnect socket.io performs after the TV
  // wakes back up - reattach as this room's host display if we have a
  // stored code. This is the one mechanism that covers all three recovery
  // paths (fresh page load, reconnect-after-sleep, and a plain refresh)
  // with a single code path.
  useEffect(() => {
    function attemptRejoin() {
      const stored = getStoredHostRoomCode();
      if (stored) {
        socket.emit(ClientEvents.HOST_REJOIN, { code: stored });
      }
    }

    socket.on('connect', attemptRejoin);
    if (socket.connected) {
      attemptRejoin();
    }

    return () => {
      socket.off('connect', attemptRejoin);
    };
  }, []);

  // Renders the join QR code onto the canvas - only mounted during LOBBY,
  // so this re-runs (and redraws) every time we land back there, including
  // after "play again" resets the phase with the SAME room code.
  useEffect(() => {
    if (!roomCode || phase !== 'LOBBY') {
      return;
    }
    const canvas = qrCanvasRef.current;
    if (!canvas) {
      return;
    }
    // Never hardcode the domain - derive from wherever this page was
    // actually served from, so dev/staging/prod all just work.
    const joinUrl = `${window.location.origin}/play?code=${roomCode}`;
    QRCode.toCanvas(canvas, joinUrl, {
      width: QR_SIZE_PX,
      margin: 2,
      // Forced light background regardless of any future theme - QR
      // scanning fails on dark/inverted codes on many phone cameras.
      color: { dark: '#000000', light: '#ffffff' },
    }).catch((err: unknown) => {
      console.warn('failed to render QR code', err);
    });
  }, [roomCode, phase]);

  function handleCreateRoom() {
    socket.emit(ClientEvents.CREATE_ROOM, {});
  }

  const players = lobby?.players ?? [];
  const connectedCount = players.filter((player) => player.connected).length;
  const vip = players.find((player) => player.isVip) ?? null;

  if (phase === 'GAME_OVER' && gameOver) {
    const sortedFinalStandings = [...gameOver.standings].sort((a, b) => a.rank - b.rank);

    return (
      <div style={styles.container}>
        <div style={styles.gameOverTitle}>Τέλος παιχνιδιού!</div>
        <div style={styles.winnerBanner} data-testid="winner-banner">
          {gameOver.isTie ? 'Ισοπαλία: ' : 'Νικητής/τρια: '}
          {gameOver.winnerName}
        </div>
        <div style={styles.standingsList}>
          {sortedFinalStandings.map((standing) => (
            <div
              key={standing.playerId}
              data-testid="final-standing-row"
              style={standing.rank === 1 ? styles.standingRowWinner : styles.standingRow}
            >
              <span style={styles.standingRank}>#{standing.rank}</span>
              <span style={styles.standingName}>{standing.name}</span>
              <span style={styles.standingScore}>{standing.score}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'REVEAL' && reveal && question) {
    const sortedResults = [...reveal.results].sort((a, b) => b.totalScore - a.totalScore);

    return (
      <div style={styles.container}>
        {roomCode && (
          <div style={styles.cornerRoomCode} data-testid="corner-room-code">
            {roomCode}
          </div>
        )}
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
        <div style={styles.progressBarTrack} data-testid="reveal-progress">
          <div
            style={{
              ...styles.progressBarFill,
              width: `${(revealSecondsLeft / Math.ceil(REVEAL_DURATION_MS / 1000)) * 100}%`,
            }}
          />
        </div>
      </div>
    );
  }

  if (phase === 'SCOREBOARD' && scoreboard) {
    const sortedStandings = [...scoreboard.standings].sort((a, b) => a.rank - b.rank);

    return (
      <div style={styles.container}>
        {roomCode && (
          <div style={styles.cornerRoomCode} data-testid="corner-room-code">
            {roomCode}
          </div>
        )}
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

  if (phase === 'QUESTION' && question) {
    const answeredIds = new Set(answerProgress?.answeredPlayerIds ?? []);
    const answeredCount = answerProgress?.answered ?? 0;
    const totalCount = answerProgress?.total ?? connectedCount;

    return (
      <div style={styles.container}>
        {roomCode && (
          <div style={styles.cornerRoomCode} data-testid="corner-room-code">
            {roomCode}
          </div>
        )}
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
      {phase === 'LOBBY' && wakeLockFailed && (
        <div style={styles.wakeLockHint} data-testid="wake-lock-hint">
          Συμβουλή: απενεργοποιήστε το Eco Mode / Screen Saver στις ρυθμίσεις της τηλεόρασης
        </div>
      )}

      {roomCode === null ? (
        isRejoining ? (
          <div style={styles.status} data-testid="rejoining">
            Επανασύνδεση...
          </div>
        ) : (
          <button style={styles.createButton} type="button" onClick={handleCreateRoom} disabled={!connected}>
            Create Room
          </button>
        )
      ) : (
        <>
          <div data-testid="room-code" style={styles.code}>
            {roomCode.split('').join(' ')}
          </div>

          <div style={styles.qrWrapper}>
            <canvas ref={qrCanvasRef} data-testid="qr-code" width={QR_SIZE_PX} height={QR_SIZE_PX} />
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
                data-vip={player.isVip}
                style={player.connected ? styles.playerName : styles.playerNameDisconnected}
              >
                {player.isVip && '👑 '}
                {player.name}
                {!player.connected && ' (αποσυνδέθηκε)'}
              </div>
            ))}
          </div>

          <div data-testid="room-settings-summary" style={styles.settingsSummary}>
            {roomSettings.questionCount} ερωτήσεις · {roomSettings.questionTimeMs / 1000}΄΄ ·{' '}
            {DIFFICULTY_MIX_LABELS[roomSettings.difficultyMix]}
          </div>

          {vip ? (
            <div data-testid="waiting-message" style={styles.waitingMessage}>
              Ο/Η {vip.name} ξεκινά το παιχνίδι
            </div>
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
  qrWrapper: {
    // Explicit white background regardless of theme - QR scanning fails on
    // dark/inverted codes on many phone cameras, so this can't just inherit
    // whatever the page background happens to be.
    background: '#ffffff',
    padding: '1rem',
    borderRadius: '1rem',
    lineHeight: 0,
  },
  cornerRoomCode: {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    fontSize: '1rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.15em',
    color: '#888',
    background: 'rgba(255,255,255,0.9)',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.5rem',
    zIndex: 10,
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
  settingsSummary: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#888',
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
  gameOverTitle: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: '#666',
  },
  winnerBanner: {
    fontSize: '3.5rem',
    fontWeight: 800,
    color: '#f59e0b',
    textAlign: 'center',
  },
  standingRowWinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: '#fef3c7',
    border: '3px solid #f59e0b',
  },
  wakeLockHint: {
    fontSize: '0.9rem',
    color: '#999',
  },
  progressBarTrack: {
    width: '100%',
    maxWidth: '500px',
    height: '0.5rem',
    borderRadius: '999px',
    background: '#e5e7eb',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: '#2563eb',
    borderRadius: '999px',
    transition: 'width 1s linear',
  },
};
