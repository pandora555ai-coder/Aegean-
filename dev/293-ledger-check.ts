// Task 293 - the per-stage ledger, observed in a real full show.
//
// The REAL server runs IN-PROCESS on a throwaway port (253-blitz-rounds-check.ts's
// own pattern: process.env.PORT is set before the server is imported, and the
// import is dynamic because ESM hoists every static one above it). That matters
// twice over here: the ledger dump is a server-side console.log, so running the
// server in this process is what puts those [ledger] lines in this harness's own
// stdout, and the live Room can be read directly at the end.
//
// A `?bot=N` mode=full room self-starts (Task 217) the instant enough bots join,
// so there is no VIP to press anything and no browser at all - this is a
// socket-level run. The dump itself is gated on room.requestedBotCount > 0, which
// is exactly what botCount below sets.
//
// Reports, in order: every [ledger] dump (printed by the server as each stage
// closes), the stage cards, the Socrates beat-kind tally (the INVERSE check's
// structural beats), and GAME_OVER's standings so the ledger's per-stage points
// can be sanity-checked against the totals they sum into.
process.env.PORT = process.env.SERVER_PORT ?? '3970';

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3970);
const BOT_COUNT = Number(process.env.BOT_COUNT ?? 5);
const LABEL = process.env.LABEL ?? 'ledger';

const sockets: Socket[] = [];

async function cleanup(): Promise<void> {
  for (const socket of sockets) socket.disconnect();
}

// The host socket. It MUST ack every Socrates beat: without the ack every beat
// rides its full audio backstop and the whole show takes several times longer
// (intro-lines-check.ts's own finding).
interface HostHooks {
  onStageAnnounce?: (payload: any) => void;
  onSocrates?: (payload: any) => void;
  onGameOver?: (payload: any) => void;
}

function connectHost(create: Record<string, unknown>, hooks: HostHooks): Promise<{ socket: Socket; code: string }> {
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => socket.emit(ClientEvents.CREATE_ROOM, create));
    socket.on(ServerEvents.SOCRATES_SHOW, (payload: any) => {
      hooks.onSocrates?.(payload);
      socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: payload?.beatId });
    });
    if (hooks.onStageAnnounce) socket.on(ServerEvents.STAGE_ANNOUNCE, hooks.onStageAnnounce);
    if (hooks.onGameOver) socket.on(ServerEvents.GAME_OVER, hooks.onGameOver);
    socket.once(ServerEvents.ROOM_CREATED, (payload: any) => resolve({ socket, code: payload.code }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('host never got room:created')), 20000);
  });
}

async function run(): Promise<void> {
  const stageCards: { stage: number; title: string; at: number }[] = [];
  const beatKinds: string[] = [];
  let gameOver: any = null;
  const t0 = Date.now();
  const rel = () => ((Date.now() - t0) / 1000).toFixed(1);

  const { code } = await connectHost(
    { botCount: BOT_COUNT, mode: 'full' },
    {
      onStageAnnounce: (p) => {
        stageCards.push({ stage: p.stage, title: p.title, at: Date.now() });
        console.log(`[${rel()}s] STAGE_ANNOUNCE stage=${p.stage}/${p.totalStages} "${p.title}"`);
      },
      // `kind` is additive (Task 239): 'REVEAL' for the ordinary post-question
      // beat, else the pending beat's own kind. That split is exactly the
      // structural-vs-random distinction the INVERSE check needs.
      onSocrates: (p) => beatKinds.push(String(p?.kind ?? 'UNKNOWN')),
      onGameOver: (p) => {
        gameOver = p;
        console.log(`[${rel()}s] GAME_OVER`);
      },
    },
  );
  console.log(`room ${code} created (${BOT_COUNT} bots, mode=full) — Task 217 auto-start, no VIP\n`);

  const deadline = Date.now() + 40 * 60 * 1000;
  while (!gameOver && Date.now() < deadline) await delay(500);
  if (!gameOver) throw new Error('game never reached GAME_OVER');

  console.log('\n================ stage cards ================');
  for (const card of stageCards) console.log(`  stage ${card.stage}  "${card.title}"`);

  console.log('\n================ Socrates beat kinds (INVERSE baseline) ================');
  const tally = new Map<string, number>();
  for (const kind of beatKinds) tally.set(kind, (tally.get(kind) ?? 0) + 1);
  for (const [kind, count] of [...tally.entries()].sort()) console.log(`  ${kind}: ${count}`);
  console.log(`  TOTAL beats: ${beatKinds.length}`);
  console.log(`  order: ${beatKinds.join(',')}`);

  console.log('\n================ GAME_OVER standings ================');
  for (const row of gameOver.standings ?? []) {
    console.log(`  ${String(row.name).padEnd(10)} score=${row.score ?? 'n/a'} rank=${row.rank ?? 'n/a'}`);
  }
  console.log('\n================ stage durations ================');
  for (const d of gameOver.stageDurations ?? []) {
    console.log(`  stage ${d.stage}  ${String(d.title).padEnd(22)} ${(d.durationMs / 1000).toFixed(1)}s`);
  }
  console.log(`\n[${LABEL}] DONE`);
}

async function main(): Promise<void> {
  await import('../server/src/index.js'); // the REAL server, in-process
  await delay(1200);
  await run();
}

main()
  .catch((error) => {
    console.error(`[${LABEL}] FAILED:`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    process.exit(process.exitCode ?? 0);
  });
