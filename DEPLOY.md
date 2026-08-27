# Deploying to production

Target: Hetzner VPS, Ubuntu 24.04, served at **https://demboyz11.duckdns.org**.

One URL serves everything. Caddy terminates HTTPS and reverse-proxies
*everything* (the built React app, the API, and the WebSocket upgrade) to a
single Node process on `127.0.0.1:3001`. The browser never talks to port
3001 directly, and in production the app is always same-origin, so there's
no CORS to think about at runtime beyond a defensive origin check.

```
phone / TV  --HTTPS-->  Caddy (:80, :443)  --HTTP-->  Node/Express+Socket.IO (127.0.0.1:3001)
                                                          |
                                                          +-- serves client/dist (built React app)
                                                          +-- Socket.IO under /socket.io/
```

## Why tsx in production (not a compiled server build)

The server runs via **`tsx`** in production, exactly as it does in dev - not
compiled to plain JS first. `tsx` transpiles TypeScript once at process
startup (via esbuild), so there's no meaningful runtime cost, and it means
the deploy pipeline only has one build step ("build the client") instead of
two. `shared/` needs no build step either way - its `package.json` points
`main`/`types` straight at `src/index.ts`, and both Vite and `tsx` consume
it directly as TypeScript source.

**Consequence:** `tsx` is a `devDependency` of `@game/server`. Do **not**
run `npm ci` with `--omit=dev` or with `NODE_ENV=production` already set -
that would skip installing `tsx` (and `vite`, needed for the build step) and
the app would fail to start. Install everything, then run the app with
`NODE_ENV=production` only at *runtime* (the systemd unit does this).

## What changed in the code for this task

- `client/src/config.ts` - `SERVER_URL` is `http://localhost:3001` in dev,
  `''` in production (`import.meta.env.PROD`).
- `client/src/socket.ts` - passes `SERVER_URL || undefined` to `io()`, since
  socket.io-client treats `''` as a literal broken URL, not "same origin" -
  `undefined` is what makes it connect to wherever the page was served from.
- `server/src/index.ts`:
  - `NODE_ENV=production` gates: serving `client/dist` as static files, an
    SPA fallback (`app.get('*', ...)`, explicitly skipping `/socket.io/*`
    so it can never intercept Socket.IO's own requests), and locking CORS
    (both Express's and Socket.IO's) to `https://demboyz11.duckdns.org`
    instead of the permissive dev `origin: true`.
  - `PORT` now reads from `process.env.PORT` (default `3001`).
  - The HTTP server binds to `127.0.0.1` in production (`0.0.0.0` in dev,
    unchanged, for LAN phone testing against the Vite dev server) - so even
    if the firewall were ever misconfigured, port 3001 still isn't reachable
    from outside the box.
- `client/package.json` - added `"build": "vite build"`.
- `server/package.json` - added `"start": "NODE_ENV=production tsx src/index.ts"`.
- root `package.json` - added `"build"` (builds the client) and `"start"`
  (delegates to the server's start script).
- `deploy/party-game.service` - the systemd unit (below).
- `deploy/Caddyfile` - the Caddy config (below).

## Files

### `deploy/party-game.service`

```ini
[Unit]
Description=Party Game server
After=network.target

[Service]
Type=simple
User=partygame
Group=partygame
WorkingDirectory=/opt/party-game
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/opt/party-game/node_modules/.bin/tsx server/src/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=party-game

NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Runs directly against the `tsx` binary in `node_modules/.bin` (no `npm run`
wrapper layers), so systemd's `Restart=on-failure` and `systemctl restart`
talk straight to the Node process - no signal-forwarding surprises.

### `deploy/Caddyfile`

```
demboyz11.duckdns.org {
	reverse_proxy localhost:3001
}
```

That's the whole thing. Caddy provisions and renews the Let's Encrypt cert
automatically (needs port 80 reachable for the ACME HTTP-01 challenge, and
port 443 for HTTPS itself), and `reverse_proxy` forwards WebSocket upgrade
requests transparently by default - no extra `Upgrade`/`Connection` header
config needed, unlike older nginx setups.

## Ordered commands - first-time setup

Run these **on the VPS**, in order. `demboyz11.duckdns.org` already resolves
to this box's public IP (verified separately), so there's no DNS step.

```bash
# --- 1. System prep ---
sudo apt-get update
sudo apt-get install -y git curl

# --- 2. Node.js 22 (NodeSource) ---
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # sanity check

# --- 3. Dedicated non-root user + app directory ---
sudo useradd --system --create-home --home-dir /opt/party-game --shell /usr/sbin/nologin partygame

# --- 4. Get the code ---
sudo git clone https://github.com/pandora555ai-coder/Aegean-.git /opt/party-game
cd /opt/party-game

# --- 5. Install deps and build (see note above: do NOT set NODE_ENV=production yet) ---
sudo npm ci
sudo npm run build

# --- 6. Hand the directory over to the app user ---
sudo chown -R partygame:partygame /opt/party-game

# --- 7. systemd service ---
sudo cp deploy/party-game.service /etc/systemd/system/party-game.service
sudo systemctl daemon-reload
sudo systemctl enable party-game
sudo systemctl start party-game
sudo systemctl status party-game          # should show "active (running)"
journalctl -u party-game -n 50 --no-pager # should end with "server listening on 127.0.0.1:3001 (production)"

# --- 8. Caddy (official apt repo) ---
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy

sudo cp /opt/party-game/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl enable caddy
sudo systemctl status caddy               # should show "active (running)"

# --- 9. Firewall ---
# CRITICAL: you are connected over plain SSH on port 22 right now. The
# ufw allow for SSH MUST run and be confirmed BEFORE `ufw enable`, or the
# next command locks you out of this machine with no other way back in.
# Run these exactly in this order - do not enable ufw first.
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw status verbose   # confirm 22 (OpenSSH), 80, 443 are all ALLOW - do this before enabling
sudo ufw enable           # type 'y' when prompted
sudo ufw status verbose   # confirm again after enabling; port 3001 must NOT appear
```

Port `3001` is intentionally never opened in ufw - it's only reachable via
`localhost`, both because the app itself binds to `127.0.0.1` in production
(see above) and because no ufw rule admits external traffic to it.

## Verifying against the acceptance criteria

1. `npm run build` succeeded with no errors in step 5 above.
2. Open `https://demboyz11.duckdns.org/` - host screen loads, padlock shows
   a valid cert (Caddy's first request triggers ACME issuance; can take a
   few seconds the very first time).
3. Open `https://demboyz11.duckdns.org/play` - controller screen loads.
4. Reload `/play` directly (or paste the URL fresh) - still the controller
   screen, not a 404 (the SPA fallback in `server/src/index.ts` handles
   this).
5. Browser devtools -> Network -> WS: the connection shows
   `wss://demboyz11.duckdns.org/socket.io/...` with a `101 Switching
   Protocols` response, not stuck on repeated `polling` requests.
6. Put a phone on mobile data (wifi off), open `/play`, join a room created
   from a laptop on `/`.
7. From a **different** machine (not the VPS): `curl http://<VPS_PUBLIC_IP>:3001`
   should hang/refuse. From *on* the VPS: `curl http://127.0.0.1:3001`
   should get a response (proves the app is up, just not exposed).
8. `sudo systemctl restart party-game`, then `sudo systemctl status
   party-game` shows `active (running)` again and the site keeps working.

## Updating the app later

`deploy/deploy.sh` (run from the dev checkout, `/root/Aegean-`) is the
**only supported update path**. It aborts on a dirty working tree or a
failed `git pull --ff-only`, then rsyncs into `/opt/party-game`, rebuilds,
and restarts the service.

**`/opt/party-game` is NOT a git working copy.** Never `git pull`, `git`
anything, or run a dev server there - it is written only by `deploy.sh`.

```bash
cd /root/Aegean-
./deploy/deploy.sh
```

## Troubleshooting

- App logs: `journalctl -u party-game -f`
- Caddy logs: `journalctl -u caddy -f`
- Validate the Caddyfile without reloading: `sudo caddy validate --config /etc/caddy/Caddyfile`
- If HTTPS provisioning fails, it's almost always port 80 not being reachable
  from the internet yet (DNS not propagated, or the ufw/`80/tcp` step above
  was skipped) - Caddy needs it for the ACME HTTP-01 challenge.
