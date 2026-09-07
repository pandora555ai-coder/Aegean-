# Task 180 — dev-shots: serve under the password-protected /dev, link in ΔΟΚΙΜΕΣ

## Context
/dev/* on production is behind basic auth (Caddyfile). /dev-shots/
is currently a SIBLING path — likely outside the auth — and shows
nothing on production anyway. Convention from now on: anything for
testing/review lives under the protected /dev prefix, discoverable
from the ΔΟΚΙΜΕΣ section.

## Do
- DIAGNOSE first, one line: why is the live /dev-shots/ empty?
  Trace client/public/dev-shots through deploy.sh (pull → rsync →
  build) and state where the PNGs drop out.
- MOVE the serving path to /dev/shots/ (under the auth prefix).
  Update the harness output location or the static-serving config —
  whichever is simpler — so repeated harness runs + deploys keep
  working. PNGs stay gitignored, never committed.
- Old /dev-shots/ must stop serving content (404 or redirect into
  the protected path — say which).
- Add a «Screenshots φάσεων» entry in the ΔΟΚΙΜΕΣ list pointing to
  /dev/shots/.
- Push, then run deploy/deploy.sh yourself.

## Acceptance criteria — report each one separately
1. The one-line root cause of the empty live dev-shots.
2. After deploy: request /dev/shots/ WITHOUT credentials → 401;
   WITH credentials → 200 and an index listing 26 entries (17 TV +
   9 phone). Report both statuses + the count. Do NOT open PNGs.
3. Old /dev-shots/ without credentials: report status (must not be
   200 with content).
4. Re-run `npm run screenshot:phases`, confirm the live /dev/shots/
   still lists 26 (re-deploy only if your fix needs it — say).
   Commit as task 180 and push.
