import type { StageAnnouncePayload } from '@game/shared';
import { styles } from './hostStyles';

interface StageAnnounceOverlayProps {
  announce: StageAnnouncePayload;
}

// Task 31a - the TV's "here comes stage N" card. Deliberately an OVERLAY on
// top of whatever phase view is already live rather than a phase of its own:
// the server never waits for it, so the question (or the POWER_UP phase in
// front of it) is already running underneath and its timer is untouched.
// Shown once per stage - HostScreen drops it on a timer of its own, and the
// server only ever emits stage:announce on a real stage change.
export function StageAnnounceOverlay({ announce }: StageAnnounceOverlayProps) {
  const lastQuestionNumber = announce.firstQuestionIndex + announce.questionCount;
  return (
    <div style={styles.stageOverlay} data-testid="stage-announce" data-stage={announce.stage}>
      <div className="enter-pop" style={styles.stageCard}>
        <div style={styles.stageKicker}>
          ΣΤΑΔΙΟ {announce.stage}/{announce.totalStages}
        </div>
        <div style={styles.stageTitle} data-testid="stage-announce-title">
          {announce.title}
        </div>
        <div style={styles.stageTagline}>{announce.tagline}</div>
        <div style={styles.stageRange}>
          Ερωτήσεις {announce.firstQuestionIndex + 1}–{lastQuestionNumber} από {announce.totalQuestions}
        </div>
      </div>
    </div>
  );
}
