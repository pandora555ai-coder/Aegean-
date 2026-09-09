// Task 221 - measures whether a `?bot=N` run now reflects a REAL game
// rather than the old blind-25%-on-4-options baseline. Same throwaway
// dev-server / socket.io-client pattern as dev/full-lineup-check.ts (no
// Playwright, no screenshots) - its own port so the two never collide.
// One `mode=full, botCount=6` run feeds all three of 221's socket-level
// criteria:
//
//   1. ACCURACY HELD  each bot's assigned p (read back off the server's own
//                      stdout log line, bots.ts's spawnBots) vs its OBSERVED
//                      correct rate per stage family (quiz, blitz,
//                      draw-guess, agora, climb; numeric has no "correct" -
//                      reported as mean |error|/max instead, which should
//                      FALL as p rises)
//   2. DIVERGENCE     final score spread (top - bottom)
//   3. AUDIO ACK      every Socrates beat's totalDurationMs and its actual
//                      measured phase-hold time (bots.ts's own
//                      wireHostSocratesAck, wired onto this harness's host
//                      socket) vs the SOCRATES_MAX_DURATION_MS backstop,
//                      plus total game duration
//
// Criterion 4 (the climb N=3 cap re-measurement) is a separate, in-process
// run: server/scripts/trial-montecarlo.ts's new --p-correct-range flag,
// no server/sockets needed for that one.
//
//   npx tsx dev/bot-accuracy-check.ts
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { ClientEvents, ServerEvents, SOCRATES_MAX_DURATION_MS, type GameModeId } from '@game/shared';
import { wireHostSocratesAck } from '../server/src/bots.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const SERVER_PORT = 3909; // distinct from every other harness's throwaway port
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const BOT_COUNT = 6;

let serverProc: ChildProcess | null = null;
const serverLog: string[] = [];
const sockets: Socket[] = [];

// --------------------------------------------------------------------------
// server lifecycle (full-lineup-check.ts's spawn/cleanup shape)
// --------------------------------------------------------------------------
function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function cleanup(): Promise<void> {
  for (const s of sockets) s.disconnect();
  killGroup(serverProc);
}

async function startServer(): Promise<void> {
  serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    detached: true,
    env: { ...process.env, PORT: String(SERVER_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
  serverProc.stderr?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
  for (let attempt = 0; attempt < 60; attempt++) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = io(ORIGIN, { reconnection: false, timeout: 1000, transports: ['websocket'] });
      probe.on('connect', () => {
        probe.disconnect();
        resolve(true);
      });
      probe.on('connect_error', () => {
        probe.disconnect();
        resolve(false);
      });
    });
    if (ok) return;
    await delay(500);
  }
  throw new Error(`server did not come up on port ${SERVER_PORT}`);
}

function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitFor<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs: number, predicate?: (p: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event} after ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(p: T) {
      if (predicate && !predicate(p)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}

// --------------------------------------------------------------------------
// bots.ts logs "room CODE: bot NAME (UUID) accuracy=P profile=fast|slow" at
// spawn time (Task 221) - read it back off the server's own stdout rather
// than re-deriving it, since the harness has no other way to see a value
// that lives only in bots.ts's per-bot closure.
// --------------------------------------------------------------------------
interface BotInfo {
  name: string;
  accuracy: number;
  profile: string;
}

function parseBotAccuracies(): Map<string, BotInfo> {
  const map = new Map<string, BotInfo>();
  const re = /bot (\S+) \(([0-9a-f-]+)\) accuracy=([0-9.]+) profile=(fast|slow)/;
  for (const chunk of serverLog) {
    for (const line of chunk.split('\n')) {
      const m = re.exec(line);
      if (m) map.set(m[2], { name: m[1], accuracy: Number(m[3]), profile: m[4] });
    }
  }
  return map;
}

// --------------------------------------------------------------------------
// observation - everything the harness needs arrives on the HOST socket
// alone: host-shaped reveals go only to hostSocketId, and the public/
// symmetric ones (GUESS_REVEAL_SHOW, NUMERIC_REVEAL_SHOW) are room-wide
// broadcasts the host receives too since it joined room.code at CREATE_ROOM.
// --------------------------------------------------------------------------
interface FamilyTally {
  correct: number;
  total: number;
}

interface NumericTally {
  sumAbsErrOverMax: number;
  n: number;
}

interface SocratesBeat {
  line: string;
  totalDurationMs: number; // what the harness's ack was scheduled for
  measuredPhaseMs: number | null; // actual PHASE_CHANGED-to-PHASE_CHANGED hold time (round-trip included)
}

class Tracker {
  t0 = Date.now();
  byFamily = new Map<string, Map<string, FamilyTally>>(); // family -> playerId -> tally
  numericByPlayer = new Map<string, NumericTally>();
  socratesBeats: SocratesBeat[] = [];
  finalStandings: { playerId: string; name: string; score: number }[] = [];
  gameOverAt = -1;
  cards: { stage: number; title: string; t: number }[] = [];

  private bump(family: string, playerId: string, correct: boolean): void {
    let byPlayer = this.byFamily.get(family);
    if (!byPlayer) {
      byPlayer = new Map();
      this.byFamily.set(family, byPlayer);
    }
    const tally = byPlayer.get(playerId) ?? { correct: 0, total: 0 };
    tally.total += 1;
    if (correct) tally.correct += 1;
    byPlayer.set(playerId, tally);
  }

  attach(socket: Socket): void {
    // PHASE_CHANGED fires BEFORE the phase's own payload at every emit site
    // (CLAUDE.md's own documented ordering), so "entered SOCRATES" always
    // precedes this SOCRATES_SHOW - pairing them by array position is safe.
    let socratesEnteredAt = -1;
    socket.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => {
      if (p.phase === 'SOCRATES') {
        socratesEnteredAt = Date.now();
      } else if (socratesEnteredAt >= 0) {
        const beat = this.socratesBeats[this.socratesBeats.length - 1];
        if (beat && beat.measuredPhaseMs === null) beat.measuredPhaseMs = Date.now() - socratesEnteredAt;
        socratesEnteredAt = -1;
      }
    });
    socket.on(ServerEvents.SOCRATES_SHOW, (p: { line: string; totalDurationMs: number }) => {
      this.socratesBeats.push({ line: p.line, totalDurationMs: p.totalDurationMs, measuredPhaseMs: null });
    });

    socket.on(ServerEvents.STAGE_ANNOUNCE, (p: { stage: number; title: string }) => {
      this.cards.push({ stage: p.stage, title: p.title, t: Date.now() - this.t0 });
    });

    socket.on(ServerEvents.REVEAL_SHOW, (p: { results?: { playerId: string; correct: boolean }[] }) => {
      if (!p.results) return;
      for (const r of p.results) this.bump('quiz', r.playerId, r.correct);
    });
    socket.on(ServerEvents.TRIAL_REVEAL_SHOW, (p: { results?: { playerId: string; correct: boolean }[] }) => {
      if (!p.results) return;
      for (const r of p.results) this.bump('trial', r.playerId, r.correct);
    });
    socket.on(ServerEvents.CLIMB_REVEAL_SHOW, (p: { results?: { playerId: string; correct: boolean }[] }) => {
      if (!p.results) return;
      for (const r of p.results) this.bump('climb', r.playerId, r.correct);
    });
    socket.on(ServerEvents.AGORA_REVEAL_SHOW, (p: { results?: { playerId: string; correct: boolean }[] }) => {
      if (!p.results) return;
      for (const r of p.results) this.bump('agora', r.playerId, r.correct);
    });
    socket.on(ServerEvents.GUESS_REVEAL_SHOW, (p: { results?: { playerId: string; correct: boolean }[] }) => {
      if (!p.results) return;
      for (const r of p.results) this.bump('draw-guess', r.playerId, r.correct);
    });
    socket.on(ServerEvents.BLITZ_REVEAL_SHOW, (p: { results?: { playerId: string; correct: number; wrong: number }[] }) => {
      if (!p.results) return;
      for (const r of p.results) {
        let byPlayer = this.byFamily.get('blitz');
        if (!byPlayer) {
          byPlayer = new Map();
          this.byFamily.set('blitz', byPlayer);
        }
        byPlayer.set(r.playerId, { correct: r.correct, total: r.correct + r.wrong });
      }
    });
    socket.on(ServerEvents.NUMERIC_REVEAL_SHOW, (p: { max?: number; results?: { playerId: string; value: number | null; distance: number }[] }) => {
      if (!p.results || p.max === undefined) return;
      for (const r of p.results) {
        if (r.value === null) continue;
        const tally = this.numericByPlayer.get(r.playerId) ?? { sumAbsErrOverMax: 0, n: 0 };
        tally.sumAbsErrOverMax += r.distance / p.max!;
        tally.n += 1;
        this.numericByPlayer.set(r.playerId, tally);
      }
    });
    socket.on(ServerEvents.GAME_OVER, (p: { standings?: { playerId: string; name: string; score: number }[] }) => {
      this.gameOverAt = Date.now() - this.t0;
      if (p.standings) this.finalStandings = p.standings;
    });
  }
}

// --------------------------------------------------------------------------
// run
// --------------------------------------------------------------------------
async function main(): Promise<void> {
  process.on('SIGINT', () => cleanup().then(() => process.exit(1)));
  await startServer();

  const host = connect();
  const tracker = new Tracker();
  tracker.attach(host);
  wireHostSocratesAck(host); // bots.ts's own harness-side Socrates ack (Task 221)

  const created = await (async () => {
    const p = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { botCount: BOT_COUNT });
    return p;
  })();
  const code = created.code;

  // A human stand-in (never a bot - only a real player can be VIP/start the
  // game), scripted exactly like full-lineup-check.ts's own `wireHuman`: a
  // blind random pick, so it contributes NOTHING to the accuracy analysis
  // below (only the 6 real bots are read back from parseBotAccuracies).
  const human = connect();
  const pick = (n: number) => Math.floor(Math.random() * n);
  const soon = (fn: () => void) => setTimeout(fn, 400 + Math.random() * 400);
  human.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => p.options && soon(() => human.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) })));
  human.on(ServerEvents.STEAL_SHOW, (p: { youAreThief?: boolean; targets?: { playerId: string }[] }) => {
    if (p.youAreThief && p.targets?.length) soon(() => human.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: p.targets![pick(p.targets!.length)].playerId }));
  });
  human.on(ServerEvents.DRAW_SHOW, (p: { wordToDraw?: string }) => {
    if (p.wordToDraw)
      soon(() =>
        human.emit(ClientEvents.DRAW_SUBMIT, {
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        }),
      );
  });
  human.on(ServerEvents.GUESS_SHOW, (p: { isDrawer?: boolean; options?: string[] }) => {
    if (p.isDrawer === false && p.options) soon(() => human.emit(ClientEvents.DRAW_GUESS, { choice: pick(p.options!.length) }));
  });
  human.on(ServerEvents.NUMERIC_QUESTION_SHOW, (p: { max?: number; submittedCount?: number }) => {
    if (p.submittedCount === undefined && p.max !== undefined) soon(() => human.emit(ClientEvents.NUMERIC_SUBMIT, { value: pick(p.max! + 1) }));
  });
  human.on(ServerEvents.TRIAL_QUESTION_SHOW, (p: { options?: string[]; onTrial?: boolean }) => {
    if (p.options && p.onTrial !== false) soon(() => human.emit(ClientEvents.TRIAL_SUBMIT, { choice: pick(p.options!.length) }));
  });
  human.on(ServerEvents.CLIMB_QUESTION_SHOW, (p: { options?: string[]; climbing?: boolean; eliminated?: boolean }) => {
    if (p.options && p.climbing !== false && !p.eliminated) soon(() => human.emit(ClientEvents.CLIMB_SUBMIT, { choice: pick(p.options!.length) }));
  });
  human.on(ServerEvents.AGORA_QUESTION_SHOW, (p: { options?: string[]; answered?: boolean }) => {
    if (p.options && !p.answered) soon(() => human.emit(ClientEvents.AGORA_SUBMIT, { choice: pick(p.options!.length) }));
  });
  human.on(ServerEvents.DUEL_PICK_SHOW, (p: { youDuel?: boolean; picked?: boolean }) => {
    if (p.youDuel && !p.picked) soon(() => human.emit(ClientEvents.DUEL_PICK, { weapon: 'xifos' }));
  });
  human.on(ServerEvents.BLITZ_SHOW, (p: { total?: number; answeredCount?: number; progressByPlayerId?: unknown }) => {
    if (p.progressByPlayerId !== undefined || p.total === undefined) return;
    let next = p.answeredCount ?? 0;
    const swipe = () => {
      if (next >= p.total!) return;
      human.emit(ClientEvents.BLITZ_SWIPE, { index: next, answeredTrue: Math.random() < 0.5 });
      next += 1;
      setTimeout(swipe, 400 + Math.random() * 400);
    };
    setTimeout(swipe, 400);
  });

  // 'cerberus' - the 7th of the 7 avatars with art on disk (avatars.ts), the
  // ONE index spawnBots' `avatarPool[i % length]` never reaches for
  // BOT_COUNT=6 (i=0..5 uses the other six in AVATAR_CATALOGUE order). Any
  // avatar the bot loop could also reach (full-lineup-check.ts's 'sphinx'
  // is index 4, reachable at botCount>=5) risks an AVATAR_TAKEN race that
  // silently drops a bot below BOT_COUNT+1 total players.
  const humanPlayerId = randomUUID();
  const joined = waitFor(human, ServerEvents.PLAYER_JOINED, 15000);
  human.emit(ClientEvents.PLAYER_JOIN, { code, name: 'Αργύρης', playerId: humanPlayerId, avatarId: 'cerberus' });
  await joined;
  await waitFor<{ players: unknown[] }>(human, ServerEvents.LOBBY_UPDATE, 20000, (p) => p.players.length >= BOT_COUNT + 1);

  const modeSet = waitFor<{ mode: string }>(human, ServerEvents.LOBBY_UPDATE, 8000, (p) => p.mode === ('full' as GameModeId));
  human.emit(ClientEvents.VIP_SET_MODE, { mode: 'full' as GameModeId });
  await modeSet;

  console.log(`room ${code}: ${BOT_COUNT} bots + 1 human, mode=full - starting`);
  const t0 = Date.now();
  const over = waitFor(host, ServerEvents.GAME_OVER, 900_000);
  human.emit(ClientEvents.VIP_START_GAME, {});
  await over;
  const totalMs = Date.now() - t0;
  await delay(300);

  // -------------------------------------------------------------------
  // report
  // -------------------------------------------------------------------
  const bots = parseBotAccuracies();
  console.log(`\n===== bots (assigned accuracy, from server stdout) =====`);
  for (const [playerId, info] of bots) console.log(`  ${info.name} (${playerId.slice(0, 8)}): p=${info.accuracy.toFixed(3)} profile=${info.profile}`);

  console.log(`\n===== 1. ACCURACY HELD (observed correct rate per family) =====`);
  for (const family of ['quiz', 'blitz', 'draw-guess', 'agora', 'climb', 'trial']) {
    const byPlayer = tracker.byFamily.get(family);
    if (!byPlayer || byPlayer.size === 0) continue;
    console.log(`  -- ${family} --`);
    for (const [playerId, tally] of byPlayer) {
      const info = bots.get(playerId);
      if (!info) continue; // the human stand-in, excluded by design
      const observed = tally.total > 0 ? tally.correct / tally.total : NaN;
      console.log(`    ${info.name}: assigned=${info.accuracy.toFixed(3)} observed=${observed.toFixed(3)} (${tally.correct}/${tally.total})`);
    }
  }
  console.log(`  -- numeric (no "correct" - mean |error|/max, should FALL as p rises) --`);
  for (const [playerId, tally] of tracker.numericByPlayer) {
    const info = bots.get(playerId);
    if (!info) continue;
    console.log(`    ${info.name}: assigned=${info.accuracy.toFixed(3)} meanErrOverMax=${(tally.sumAbsErrOverMax / tally.n).toFixed(3)} (n=${tally.n})`);
  }

  console.log(`\n===== 2. DIVERGENCE =====`);
  // Identified by NOT being the human (rather than requiring bots.ts's own
  // accuracy log line), so this section still works against a pre-Task-221
  // bots.ts checked out for a "before" comparison run.
  const botScores = tracker.finalStandings.filter((r) => r.playerId !== humanPlayerId).map((r) => r.score);
  if (botScores.length > 0) {
    const top = Math.max(...botScores);
    const bottom = Math.min(...botScores);
    console.log(`  bot scores: [${botScores.join(', ')}]`);
    console.log(`  spread (top - bottom): ${top - bottom}`);
  } else {
    console.log(`  no bot standings captured (isTrialResult finale shows no digits - check gameOver.isTrialResult)`);
  }

  console.log(`\n===== 3. AUDIO ACK =====`);
  console.log(`  Socrates beats fired: ${tracker.socratesBeats.length}`);
  let maxBeat = 0;
  for (const beat of tracker.socratesBeats) {
    maxBeat = Math.max(maxBeat, beat.totalDurationMs);
    const rodeBackstop = beat.totalDurationMs >= SOCRATES_MAX_DURATION_MS;
    console.log(`    "${beat.line.slice(0, 50)}..." totalDurationMs=${beat.totalDurationMs} measuredPhaseMs=${beat.measuredPhaseMs} rodeBackstop=${rodeBackstop}`);
  }
  console.log(`  max observed beat duration: ${maxBeat}ms (backstop is ${SOCRATES_MAX_DURATION_MS}ms)`);
  console.log(`  total game duration: ${(totalMs / 1000).toFixed(1)}s`);

  await cleanup();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => cleanup());
