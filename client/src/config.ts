// In dev, Vite and the API server run on different ports. In production,
// Caddy proxies both the app and the socket under the same origin, so the
// client should just connect to wherever it was served from.
// VITE_SERVER_URL lets the dev-only screenshot harness (dev/screenshot-phases.ts)
// point at a throwaway server port instead of the real dev port - unset in
// every normal dev/prod run, where this is unchanged from the old constant.
export const SERVER_URL = import.meta.env.PROD ? '' : import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';
