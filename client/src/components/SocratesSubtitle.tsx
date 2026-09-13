import type { CSSProperties } from 'react';

// Task 239 - a viewer with no audio (muted TV, hard of hearing) must still be
// able to follow the intro and every stage announce, so the spoken line's
// TEXT renders alongside the audio rather than only being heard.
// Task 242 - moved from `bottom:3.5cqh` to the TOP of the safe area. At the
// bottom it landed inside SophistsRow's own band (SophistsRow.tsx:
// `.sophists{bottom:6.5cqh;height:30cqh}` off the FULL viewport, measured
// y≈457..673 at 1280x720) - straight over the players' plaques, the bug
// this task reported. The stage-announce card (StageAnnounceOverlay) is
// vertically CENTRED in THIS root's own safe-area-bound container
// (`place-items:center`) - measured content box y≈261.6..458.4 at
// 1280x720 - so the only band clear of BOTH the card and the row is ABOVE
// the card: this bar now pins to the top of the safe area instead. Holds
// for a plain SOCRATES beat too (no card at all) since that upper band is
// otherwise empty - see dev/242-subtitle-check.ts. Same full-viewport
// container-query basis as SpeechSlab/SophistsRow (not the TV safe area -
// see SpeechSlab's own comment) for the ROOT; the bar itself still
// measures off this root's own safe-area-bound cqh, unchanged.
const rootStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  containerType: 'size',
  pointerEvents: 'none',
  zIndex: 45,
};

const barStyle: CSSProperties = {
  position: 'absolute',
  left: '12%',
  right: '12%',
  top: '2cqh',
  margin: '0 auto',
  padding: '1.6cqh 3cqh',
  borderRadius: '0.8cqh',
  // Task 242 - darker + a border (the same "chip" treatment the corner
  // controls already use, hostStyles.ts's SURFACE_GLOW family) so the bar
  // holds contrast against a bright scene behind it, not just the plain
  // night wash it had at 78%.
  background: 'color-mix(in srgb, var(--night-0) 90%, transparent)',
  border: '1px solid color-mix(in srgb, var(--marble-3) 55%, transparent)',
  boxShadow: '0 0.4cqh 1.6cqh rgba(0,0,0,.55)',
  color: 'var(--marble)',
  fontFamily: '"Gentium Book Plus", Georgia, "Times New Roman", serif',
  fontSize: '3.4cqh',
  fontWeight: 700,
  lineHeight: 1.3,
  textAlign: 'center',
  textShadow: '0 2px 8px rgba(0,0,0,.8)',
};

interface SocratesSubtitleProps {
  text: string;
}

// Deliberately NOT aria-hidden, unlike SpeechSlab's decorative narration
// panels: this text is the whole point of the feature (a caption standing in
// for audio), so it must be readable content, not decoration.
export function SocratesSubtitle({ text }: SocratesSubtitleProps) {
  return (
    <div style={rootStyle}>
      <div style={barStyle} data-testid="socrates-subtitle">
        {text}
      </div>
    </div>
  );
}
