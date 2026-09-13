import type { CSSProperties } from 'react';

// Task 239 - a viewer with no audio (muted TV, hard of hearing) must still be
// able to follow the intro and every stage announce, so the spoken line's
// TEXT renders alongside the audio rather than only being heard. Same
// full-viewport container-query basis as SpeechSlab/SophistsRow (not the TV
// safe area - see SpeechSlab's own comment), pinned low so it never competes
// with the stage-announce card, which sits vertically CENTRED in the safe
// area (StageAnnounceOverlay) - measured clear at every player count in
// dev/end-state-check.ts.
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
  bottom: '3.5cqh',
  margin: '0 auto',
  padding: '1.4cqh 3cqh',
  borderRadius: '0.8cqh',
  background: 'color-mix(in srgb, var(--night-0) 78%, transparent)',
  color: 'var(--marble)',
  fontFamily: '"Gentium Book Plus", Georgia, "Times New Roman", serif',
  fontSize: '3cqh',
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
