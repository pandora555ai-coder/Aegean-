import { useCallback, useEffect, useState } from 'react';
import { ClientEvents, ServerEvents, type ServerPongPayload } from '@game/shared';
import { socket } from './socket';

interface PingResult {
  roundTripMs: number;
  serverTime: number;
}

export function useSocketConnection() {
  const [connected, setConnected] = useState(socket.connected);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  useEffect(() => {
    function handleConnect() {
      setConnected(true);
    }

    function handleDisconnect() {
      setConnected(false);
    }

    function handlePong(payload: ServerPongPayload) {
      setPingResult({
        roundTripMs: Date.now() - payload.sentAt,
        serverTime: payload.serverTime,
      });
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on(ServerEvents.PONG, handlePong);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off(ServerEvents.PONG, handlePong);
      socket.disconnect();
    };
  }, []);

  const sendPing = useCallback(() => {
    socket.emit(ClientEvents.PING, { sentAt: Date.now() });
  }, []);

  return { connected, pingResult, sendPing };
}
