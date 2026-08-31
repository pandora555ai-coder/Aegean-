import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ClientEvents,
  ServerEvents,
  type DevDrawingReceivedPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { DrawingCanvas, type DrawingCanvasHandle } from '../components/DrawingCanvas';

// Dev harness for the drawing surface (Task 53), reachable at /dev/draw and
// linked from nowhere. No room, no phase, no player - it exists so the
// canvas can be tried with a real finger and the wire size read off the
// screen. When a drawing phase lands, the surface moves into the phone's
// controller and this screen can go.
export default function DevDrawScreen() {
  const { connected } = useSocketConnection();
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [sentBytes, setSentBytes] = useState<number | null>(null);
  const [ack, setAck] = useState<DevDrawingReceivedPayload | null>(null);

  useEffect(() => {
    function handleReceived(payload: DevDrawingReceivedPayload) {
      setAck(payload);
    }

    socket.on(ServerEvents.DEV_DRAWING_RECEIVED, handleReceived);
    return () => {
      socket.off(ServerEvents.DEV_DRAWING_RECEIVED, handleReceived);
    };
  }, []);

  function submit() {
    const imageDataUrl = canvasRef.current?.exportDataUrl();
    if (!imageDataUrl) {
      return;
    }

    setAck(null);
    setSentBytes(imageDataUrl.length);
    socket.emit(ClientEvents.DEV_SUBMIT_DRAWING, { imageDataUrl });
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Ζωγραφική (dev)</h1>
      <DrawingCanvas ref={canvasRef} onStrokeCountChange={setStrokeCount} />
      <button type="button" style={styles.submit} onClick={submit} disabled={strokeCount === 0 || !connected}>
        Υποβολή
      </button>
      <div style={styles.readout}>
        {sentBytes !== null && <div>στάλθηκαν: {sentBytes.toLocaleString()} bytes</div>}
        {ack && <div>ο server έλαβε: {ack.bytes.toLocaleString()} bytes ({ack.format})</div>}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    // Trimmed from the old 1.5rem/1.25rem: this padding is the only thing
    // standing between the canvas and full phone width, since the canvas
    // is width:100% of this container (criterion 1's "as large as the
    // phone allows").
    padding: '0.6rem 0.6rem 1rem',
    maxWidth: '640px',
    margin: '0 auto',
    minHeight: '100dvh',
    background: 'var(--deep)',
    color: 'var(--cream)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.1rem', fontWeight: 700, textAlign: 'center', margin: '0 0 0.15rem' },
  submit: {
    padding: '1rem',
    fontSize: '1.1rem',
    fontWeight: 700,
    color: 'var(--ink)',
    background: 'var(--gold)',
    border: 'none',
    borderRadius: '0.75rem',
    touchAction: 'manipulation',
  },
  readout: {
    fontSize: '0.9rem',
    color: 'var(--dim)',
    textAlign: 'center',
    lineHeight: 1.6,
  },
};
