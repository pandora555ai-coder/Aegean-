import type { CSSProperties } from 'react';
import type { DuelPickShowHostPayload, RoomCode } from '@game/shared';
import { AnavasisChrome } from '../../components/AnavasisScene';

interface DuelPickViewProps {
  duelPick: DuelPickShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 189 - Η Μονομαχία's pick window. The two duelists and whether each
// has picked are AnavasisDuel's own job (mounted at the HostScreen level,
// reading duelPick.pickedPlayerIds); this view is just the caption line the
// reference's duelpick() phase speaks - the picks themselves never appear
// here or anywhere else before DUEL_REVEAL.
const CAPTION_STYLE: CSSProperties = {
  position: 'fixed',
  left: '2.5%',
  top: '25%',
  width: '33%',
  fontFamily: '"Gentium Book Plus", Georgia, "Times New Roman", serif',
  fontSize: '3cqh',
  lineHeight: 1.28,
  fontWeight: 700,
  color: 'var(--marble)',
  textShadow: '0 2px 10px rgba(0,0,0,.8)',
  zIndex: 1,
};

export function DuelPickView({ duelPick, roomCode, paused, pausedByName }: DuelPickViewProps) {
  return (
    <>
      <AnavasisChrome roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
      <div style={CAPTION_STYLE} className="screen-fade-in" data-testid="duel-pick-caption">
        Διαλέξτε κρυφά. Η πόλη βλέπει μόνο το αποτέλεσμα.
        {duelPick.tieCount > 0 && <div>Ξανά, για δεύτερη φορά.</div>}
      </div>
    </>
  );
}
