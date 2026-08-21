import type { StageAnnouncePayload } from '@game/shared';
import { styles } from './hostStyles';

interface StageAnnounceOverlayProps {
  announce: StageAnnouncePayload;
}

// Task 31a/35 - the TV's "here comes stage N" card, and the whole view of
// the STAGE_ANNOUNCE phase: the server HOLDS there for the announcement's
// duration, so nothing renders underneath and the question that follows
// hasn't started (nor has its timer). Shown once per stage - the server only
// emits stage:announce on a real stage change, and ends the phase itself.
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
