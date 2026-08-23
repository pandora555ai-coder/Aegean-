import { type RoomCode, type StealShowHostPayload } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { densityScale, styles } from './hostStyles';

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
  const count = steal.standings.length;
  // The banner used to share the screen with its own standings strip - now
  // that the persistent right column (Task 38) covers that, it just shrinks
  // at the same density steps everything else on this TV does.
  const s = densityScale(count);
  const bannerAvatar = 3 * s;
  const victimAvatar = 2.5 * s;

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={steal.standings}
      thiefPlayerId={steal.thiefPlayerId}
      victimPlayerId={resolved?.victimPlayerId ?? null}
    >
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
              <div style={{ ...styles.stealThiefRow, fontSize: `${(3 * s).toFixed(2)}rem` }}>
                <Avatar avatarId={resolved.thiefAvatarId} sizeRem={bannerAvatar} />
                {resolved.thiefName}
              </div>
              <div
                style={{ ...styles.stealMovedAmount, fontSize: `clamp(${(2.5 * s).toFixed(2)}rem, ${(7 * s).toFixed(2)}vw, ${(7 * s).toFixed(2)}rem)` }}
                data-testid="steal-amount"
              >
                −{resolved.stolenAmount}
              </div>
              <div style={{ ...styles.stealVictimRow, fontSize: `${(2.5 * s).toFixed(2)}rem` }} data-testid="steal-victim">
                από τον/την
                <Avatar avatarId={resolved.victimAvatarId ?? ''} sizeRem={victimAvatar} />
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
            </>
          )}
        </div>
      ) : (
        <>
          <div
            className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'}
            style={{
              ...styles.timerRingWrap,
              width: `${(7 * s).toFixed(2)}rem`,
              height: `${(7 * s).toFixed(2)}rem`,
            }}
          >
            <div
              className={timerCritical ? 'timer-critical' : undefined}
              style={{ ...styles.timer, fontSize: `${(3 * s).toFixed(2)}rem` }}
              data-testid="steal-countdown"
            >
              {secondsLeft}
            </div>
          </div>
          <div className="enter-pop">
            <div style={{ ...styles.stealThiefRow, fontSize: `${(3 * s).toFixed(2)}rem` }} data-testid="steal-thief">
              <Avatar avatarId={steal.thiefAvatarId} sizeRem={bannerAvatar} />
              {steal.thiefName}
            </div>
            <div
              style={{ ...styles.questionTextTv, fontSize: `clamp(${(2.5 * s).toFixed(2)}rem, ${(6 * s).toFixed(2)}vw, ${(6 * s).toFixed(2)}rem)` }}
              data-testid="steal-title"
            >
              Διαλέγει θύμα...
            </div>
            <div style={{ ...styles.stealAmount, fontSize: `${(2.25 * s).toFixed(2)}rem` }} data-testid="steal-attempt">
              Παίζει για {steal.amount} πόντους
            </div>
          </div>
        </>
      )}
    </GameLayout>
  );
}
