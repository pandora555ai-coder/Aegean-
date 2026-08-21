import { type RoomCode, type StealShowHostPayload, type StealStanding } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import {
  containerGap,
  densityScale,
  revealStandingsAvatarSize,
  revealStandingsStripSizeStyle,
  styles,
} from './hostStyles';

interface StealViewProps {
  steal: StealShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// One row of the standings strip. Its own component (not inlined in the
// .map below) so useAnimatedNumber's hook state lives per-player, keyed by
// playerId - that's what lets the score tween from its pre-steal value to
// its post-steal one instead of snapping when `standing.score` changes.
function StealStandingItem({
  standing,
  avatarSize,
  isThief,
  isVictim,
}: {
  standing: StealStanding;
  avatarSize: number;
  isThief: boolean;
  isVictim: boolean;
}) {
  const displayScore = useAnimatedNumber(standing.score);
  const color = isThief ? 'var(--gold)' : isVictim ? 'var(--danger-text)' : undefined;

  return (
    <span style={styles.revealStandingsItem} data-testid="steal-standing-item" data-thief={isThief} data-victim={isVictim}>
      <Avatar avatarId={standing.avatarId} sizeRem={avatarSize} ringColor={color} />
      <span style={{ ...styles.revealStandingsName, color: color ?? styles.revealStandingsName.color }}>
        {standing.name}
      </span>
      <span style={{ ...styles.revealStandingsScore, color: color ?? styles.revealStandingsScore.color }}>
        {displayScore}
      </span>
    </span>
  );
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
  const standingsStripStyle = revealStandingsStripSizeStyle(count);
  const standingsAvatar = revealStandingsAvatarSize(count);
  // The banner above the standings strip used to be the whole view - now it
  // shares the screen with a per-player strip (up to 8 rows), so it shrinks
  // at the same density steps everything else on this TV does.
  const s = densityScale(count);
  const bannerAvatar = 3 * s;
  const victimAvatar = 2.5 * s;

  return (
    <div style={{ ...styles.container, gap: containerGap(count) }} className="screen-fade-in">
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

      {/* Every player's score, visible for the whole phase - what's at
          stake while the thief picks, then the transfer animating live once
          resolved (StealStandingItem ticks its own score via
          useAnimatedNumber). Same density-scaled strip REVEAL uses, so this
          still fits with no overflow at MAX_PLAYERS (8). */}
      <div style={{ ...styles.revealStandingsStrip, ...standingsStripStyle }} data-testid="steal-standings-strip">
        {steal.standings.map((standing) => (
          <StealStandingItem
            key={standing.playerId}
            standing={standing}
            avatarSize={standingsAvatar}
            isThief={standing.playerId === steal.thiefPlayerId}
            isVictim={resolved?.victimPlayerId === standing.playerId}
          />
        ))}
      </div>

      <div style={styles.progress}>
        Μετά την ερώτηση {steal.questionIndex + 1}/{steal.totalQuestions}
      </div>
    </div>
  );
}
