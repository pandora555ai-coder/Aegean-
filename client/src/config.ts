// In dev, Vite and the API server run on different ports. In production,
// Caddy proxies both the app and the socket under the same origin, so the
// client should just connect to wherever it was served from.
export const SERVER_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
