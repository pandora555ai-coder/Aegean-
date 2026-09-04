import type { StageAnnouncePayload } from '@game/shared';

interface StageAnnounceOverlayProps {
  announce: StageAnnouncePayload;
}

// Task 163a - replaces the old two-tier stage card (kicker/title/tagline/
// question-range block) with design/theatre-reference.html's .overlay: a
// single centred group, stage label in tracked ember caps, the title in a
// serif at 16cqh, the stage's own tagline as the rule line below. The
// question-range line is gone - the reference's overlay carries no player-
// or progress-count text at all, only the three lines it shows here.
// Sized in cqh off its own container-type:size root (same technique as
// SophistsRow/Krater/MarbleSlab), not vw/rem, so it scales with the TV
// frame rather than in player-count steps - this view has no player-count
// dependency to begin with.
const STYLE_TAG = `
.stage-announce-root{position:fixed;inset:var(--tv-safe-top) 0 var(--tv-safe-bottom) 0;container-type:size;
  display:grid;place-items:center;text-align:center;pointer-events:none;z-index:45}
.stage-announce-root .n{font-size:3cqh;letter-spacing:.35em;text-transform:uppercase;color:var(--ember);font-weight:700}
.stage-announce-root .t{font-family:"Gentium Book Plus",Georgia,"Times New Roman",serif;font-size:16cqh;
  font-weight:700;line-height:1;color:var(--marble);margin-top:.6cqh;text-shadow:0 .6cqh 3cqh rgba(0,0,0,.8)}
.stage-announce-root .r{font-size:3.4cqh;color:var(--marble-2);margin-top:2.2cqh;max-width:40ch;
  text-shadow:0 2px 10px rgba(0,0,0,.8)}
`;

// The server holds STAGE_ANNOUNCE for its own fixed duration (nothing here
// needs a timer) - the fade is purely the entrance, same screen-fade-in
// class every other host view uses, already animation:none under
// prefers-reduced-motion (palette-theatro.css).
export function StageAnnounceOverlay({ announce }: StageAnnounceOverlayProps) {
  return (
    <div className="stage-announce-root screen-fade-in" data-testid="stage-announce" data-stage={announce.stage}>
      <style>{STYLE_TAG}</style>
      <div>
        <div className="n">
          ΓΥΡΟΣ {announce.stage}/{announce.totalStages}
        </div>
        <div className="t" data-testid="stage-announce-title">
          {announce.title}
        </div>
        <div className="r">{announce.tagline}</div>
      </div>
    </div>
  );
}
