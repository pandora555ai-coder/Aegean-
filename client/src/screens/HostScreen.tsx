import { useEffect, useState } from 'react';
import { ClientEvents, ServerEvents, type RoomCode, type RoomCreatedPayload } from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';

export default function HostScreen() {
  const { connected } = useSocketConnection();
  const [roomCode, setRoomCode] = useState<RoomCode | null>(null);

  useEffect(() => {
    function handleRoomCreated(payload: RoomCreatedPayload) {
      setRoomCode(payload.code);
    }

    socket.on(ServerEvents.ROOM_CREATED, handleRoomCreated);

    return () => {
      socket.off(ServerEvents.ROOM_CREATED, handleRoomCreated);
    };
  }, []);

  function handleCreateRoom() {
    socket.emit(ClientEvents.CREATE_ROOM, {});
  }

  return (
    <div>
      <div>HOST</div>
      <div>{connected ? 'connected' : 'disconnected'}</div>

      {roomCode === null ? (
        <button type="button" onClick={handleCreateRoom} disabled={!connected}>
          Create Room
        </button>
      ) : (
        <div
          style={{
            fontSize: '8rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            letterSpacing: '0.5em',
          }}
        >
          {roomCode.split('').join(' ')}
        </div>
      )}
    </div>
  );
}
