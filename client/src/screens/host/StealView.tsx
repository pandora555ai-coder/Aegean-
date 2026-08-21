import { type RoomCode, type StealShowHostPayload } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { styles } from './hostStyles';

interface StealViewProps {
  steal: StealShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 32 - the TV during STEAL. Two beats in one view, driven entirely by
// `steal.resolved`: while it's null the thief is choosing (and the TV shows
// only WHO is choosing and for how much - never the target list, which lives
// on their phone alone), and once it's set the theft is announced. The TV is
// a display: it learns the victim only after the points have already moved.
export function StealView({ steal, roomCode, paused, pausedByName, secondsLeft }: StealViewProps) {
  const resolved = steal.resolved;
  const timerCritical = !paused && !resolved && secondsLeft <= 3 && secondsLeft > 0;

  return (
    <div style={styles.container} className="screen-fade-in">
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
      <div style={styles.category}>Κλοπή Πόντων</div>

      {resolved ? (
        <div className="enter-pop" data-testid="steal-resolved">
          {resolved.victimName === null ? (
            <>
              <div style={styles.stealNothing} data-testid="steal-nothing">
                Δεν πρόλαβε να διαλέξει!
              </div>
              <div style={styles.stealClampNote}>Κανείς δεν έχασε πόντους</div>
            </>
          ) : (
            <>
              <div style={styles.stealThiefRow}>
                <Avatar avatarId={resolved.thiefAvatarId} sizeRem={3} />
                {resolved.thiefName}
              </div>
              <div style={styles.stealMovedAmount} data-testid="steal-amount">
                −{resolved.stolenAmount}
              </div>
              <div style={styles.stealVictimRow} data-testid="steal-victim">
                από τον/την
                <Avatar avatarId={resolved.victimAvatarId ?? ''} sizeRem={2.5} />
                {resolved.victimName}
              </div>
              {/* The clamp made visible: "wanted 400, there were only 150
                  there". Shown only when it actually bit. */}
              {resolved.stolenAmount < resolved.attemptedAmount && (
                <div style={styles.stealClampNote} data-testid="steal-clamped">
                  {resolved.stolenAmount === 0
                    ? `Ήθελε ${resolved.attemptedAmount} — αλλά δεν είχε τίποτα να χάσει`
                    : `Ήθελε ${resolved.attemptedAmount} — τόσα μόνο είχε`}
                </div>
              )}
              <div style={styles.stealScoreLine} data-testid="steal-scores">
                {resolved.thiefName}: {resolved.thiefScore} · {resolved.victimName}: {resolved.victimScore}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div
            className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'}
            style={styles.timerRingWrap}
          >
            <div
              className={timerCritical ? 'timer-critical' : undefined}
              style={styles.timer}
              data-testid="steal-countdown"
            >
              {secondsLeft}
            </div>
          </div>
          <div className="enter-pop">
            <div style={styles.stealThiefRow} data-testid="steal-thief">
              <Avatar avatarId={steal.thiefAvatarId} sizeRem={3} />
              {steal.thiefName}
            </div>
            <div style={styles.questionTextTv} data-testid="steal-title">
              Διαλέγει θύμα...
            </div>
            <div style={styles.stealAmount} data-testid="steal-attempt">
              Παίζει για {steal.amount} πόντους
            </div>
          </div>
          <div style={styles.progress}>
            Μετά την ερώτηση {steal.questionIndex + 1}/{steal.totalQuestions}
          </div>
        </>
      )}
    </div>
  );
}
