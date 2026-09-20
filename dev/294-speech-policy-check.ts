// Task 294 - the v2 speech policy, observed in a real full show.
//
// The REAL server runs IN-PROCESS on a throwaway port (dev/293-ledger-check.ts's
// own pattern, which is 253-blitz-rounds-check.ts's: process.env.PORT is set
// before the server is imported, and the import is dynamic because ESM hoists
// every static one above it). That matters three times over here: the slot
// engine's `[slot]` decisions and the ledger's `[ledger]` dumps are server-side
// console.logs, so running the server in this process is what puts them in this
// harness's own stdout beside the beat list; and collectVoiceLineEntries can be
// called directly at the end, against the same module instance the game used.
//
// A `?bot=N` mode=full room self-starts (Task 217) the instant enough bots join,
// so there is no VIP to press anything and no browser at all - this is a
// socket-level run. That self-start is ALSO why the speech policy travels on
// CREATE_ROOM rather than through vip:update_settings: no bot is ever VIP, so
// the VIP path is unreachable in exactly the room this harness needs (the same
// reason Task 222 put `mode` on that payload).
//
// SCENARIO=V2 (default) plays a v2 show; SCENARIO=V1 plays the v1 control.
process.env.PORT = process.env.SERVER_PORT ?? '3972';

import { setTimeout as delay } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3972);
const BOT_COUNT = Number(process.env.BOT_COUNT ?? 4);
const SCENARIO = (process.env.SCENARIO ?? 'V2').toUpperCase();
const SPEECH_POLICY = SCENARIO === 'V1' ? 'v1' : 'v2';
const LABEL = process.env.LABEL ?? `speech-${SPEECH_POLICY}`;

const sockets: Socket[] = [];

async function cleanup(): Promise<void> {
  for (const socket of sockets) socket.disconnect();
}

interface Beat {
  kind: string;
  line: string;
  atMs: number;
}

interface HostHooks {
  onStageAnnounce?: (payload: any) => void;
  onSocrates?: (payload: any) => void;
  onGameOver?: (payload: any) => void;
}

// The host socket MUST ack every Socrates beat: without the ack every beat
// rides its full audio backstop and the show takes several times longer
// (intro-lines-check.ts's own finding). It matters even more here - none of
// the 36 new v2 lines has an mp3 yet, so their backstop is the flat
// SOCRATES_BACKSTOP_UNKNOWN_MS rather than a measured clip.
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
  const stageCards: { stage: number; title: string }[] = [];
  const beats: Beat[] = [];
  let gameOver: any = null;
  const t0 = Date.now();
  const rel = () => ((Date.now() - t0) / 1000).toFixed(1);

  const { code } = await connectHost(
    { botCount: BOT_COUNT, mode: 'full', speechPolicy: SPEECH_POLICY },
    {
      onStageAnnounce: (p) => {
        stageCards.push({ stage: p.stage, title: p.title });
        console.log(`[${rel()}s] STAGE_ANNOUNCE stage=${p.stage}/${p.totalStages} "${p.title}"`);
      },
      // `kind` is additive (Task 239): 'REVEAL' for the ordinary post-question
      // beat, else the pending beat's own kind - which is exactly the
      // per-reveal-vs-structural split this task is about. 'SPEECH_SLOT' is
      // Task 294's own new value.
      onSocrates: (p) => {
        beats.push({ kind: String(p?.kind ?? 'UNKNOWN'), line: String(p?.line ?? ''), atMs: Date.now() - t0 });
        console.log(`[${rel()}s] BEAT ${String(p?.kind)} — "${String(p?.line).slice(0, 70)}"`);
      },
      onGameOver: (p) => {
        gameOver = p;
        console.log(`[${rel()}s] GAME_OVER`);
      },
    },
  );
  console.log(`room ${code} created (${BOT_COUNT} bots, mode=full, speechPolicy=${SPEECH_POLICY}) — Task 217 auto-start\n`);

  const deadline = Date.now() + 40 * 60 * 1000;
  while (!gameOver && Date.now() < deadline) await delay(500);
  if (!gameOver) throw new Error('game never reached GAME_OVER');

  console.log('\n================ stage cards ================');
  for (const card of stageCards) console.log(`  stage ${card.stage}  "${card.title}"`);

  console.log('\n================ Socrates beat kinds ================');
  const tally = new Map<string, number>();
  for (const beat of beats) tally.set(beat.kind, (tally.get(beat.kind) ?? 0) + 1);
  for (const [kind, count] of [...tally.entries()].sort()) console.log(`  ${kind}: ${count}`);
  console.log(`  TOTAL beats: ${beats.length}`);
  console.log(`  order: ${beats.map((b) => b.kind).join(',')}`);

  // THE v2 claim, stated as a number rather than inferred from the absence of
  // something: these four kinds are the per-reveal beats the policy retires.
  const perReveal = ['REVEAL', 'DRAW_MOMENT', 'NUMERIC_MOMENT', 'AGORA_MOMENT'];
  const perRevealCount = beats.filter((beat) => perReveal.includes(beat.kind)).length;
  console.log(`\n  per-reveal beats (REVEAL/DRAW_MOMENT/NUMERIC_MOMENT/AGORA_MOMENT): ${perRevealCount}`);
  console.log(`  SPEECH_SLOT beats: ${beats.filter((beat) => beat.kind === 'SPEECH_SLOT').length}`);

  console.log('\n================ registered voice lines ================');
  const { collectVoiceLineEntries } = await import('../server/src/socrates.js');
  const entries = collectVoiceLineEntries();
  const slotEntries = entries.filter((entry) => entry.moment.startsWith('SLOT ('));
  console.log(`  collectVoiceLineEntries(): ${entries.length} total, ${slotEntries.length} from the v2 slot pools`);

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
