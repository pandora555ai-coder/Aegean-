import { useSocketConnection } from '../useSocketConnection';

export default function ControllerScreen() {
  const { connected, pingResult, sendPing } = useSocketConnection();

  return (
    <div>
      <div>PLAYER</div>
      <div>{connected ? 'connected' : 'disconnected'}</div>
      <button type="button" onClick={sendPing} disabled={!connected}>
        Ping
      </button>
      {pingResult && (
        <div>
          round-trip: {pingResult.roundTripMs}ms (serverTime: {pingResult.serverTime})
        </div>
      )}
    </div>
  );
}
