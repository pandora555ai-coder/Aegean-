// Task 295 - full mode's stage 1 (Η Αγορά) now runs its OWN question count
// (FULL_QUIZ_STAGE1_QUESTION_COUNTS), split off stage 6's (Η Συκοφαντία,
// FULL_QUIZ_QUESTION_COUNTS, unchanged). This harness plays a real full show
// (default settings -> gameLength 'long') far enough to observe:
//   - stage 1's STAGE_ANNOUNCE carries questionCount=10
//   - exactly 10 QUESTION_SHOW events land inside stage 1's index range
//   - (v2 only) QUIZ_MID fires once, right after the 5th reveal (half of 10)
//     and QUIZ_CLOSE fires once, right after the 10th
//   - (v1 only) the per-reveal engine still fires across all 10 stage-1
//     questions, unchanged
//   - stage 6's STAGE_ANNOUNCE still carries questionCount=5, untouched
//
// It EXITS as soon as stage 7 (the finale row) is announced, rather than
// riding the climb out to GAME_OVER (highly variable, up to 24 rounds) -
// everything this task needs to verify has already happened by then.
//
// Same in-process-server / socket-level-bots shape as
// dev/294-speech-policy-check.ts. SCENARIO=V2 (default) or SCENARIO=V1.
process.env.PORT = process.env.SERVER_PORT ?? '3973';

import { setTimeout as delay } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3973);
const BOT_COUNT = Number(process.env.BOT_COUNT ?? 4);
const SCENARIO = (process.env.SCENARIO ?? 'V2').toUpperCase();
const SPEECH_POLICY = SCENARIO === 'V1' ? 'v1' : 'v2';

const sockets: Socket[] = [];
async function cleanup(): Promise<void> {
  for (const socket of sockets) socket.disconnect();
}

interface StageCard {
  stage: number;
  title: string;
  questionCount: number;
  firstQuestionIndex: number;
  totalQuestions: number;
}

async function run(): Promise<void> {
  const stageCards: StageCard[] = [];
  const questionIndices: number[] = [];
  const beats: { kind: string; line: string }[] = [];
  let stage7Announced = false;
  const t0 = Date.now();
  const rel = () => ((Date.now() - t0) / 1000).toFixed(1);

  await new Promise<void>((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    sockets.push(socket);
    socket.on('connect', () =>
      socket.emit(ClientEvents.CREATE_ROOM, { botCount: BOT_COUNT, mode: 'full', speechPolicy: SPEECH_POLICY }),
    );
    socket.on(ServerEvents.STAGE_ANNOUNCE, (p: any) => {
      stageCards.push({
        stage: p.stage,
        title: p.title,
        questionCount: p.questionCount,
        firstQuestionIndex: p.firstQuestionIndex,
        totalQuestions: p.totalQuestions,
      });
      console.log(
        `[${rel()}s] STAGE_ANNOUNCE stage=${p.stage}/${p.totalStages} "${p.title}" questionCount=${p.questionCount} firstQuestionIndex=${p.firstQuestionIndex} totalQuestions=${p.totalQuestions}`,
      );
      if (p.stage === 7) {
        stage7Announced = true;
        resolve();
      }
    });
    socket.on(ServerEvents.QUESTION_SHOW, (p: any) => {
      if (typeof p.questionIndex === 'number') {
        questionIndices.push(p.questionIndex);
        console.log(`[${rel()}s] QUESTION_SHOW index=${p.questionIndex}/${p.totalQuestions}`);
      }
    });
    socket.on(ServerEvents.SOCRATES_SHOW, (p: any) => {
      beats.push({ kind: String(p?.kind ?? 'UNKNOWN'), line: String(p?.line ?? '') });
      console.log(`[${rel()}s] BEAT ${String(p?.kind)} — "${String(p?.line).slice(0, 60)}"`);
      socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: p?.beatId });
    });
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('timed out before stage 7 was announced')), 30 * 60 * 1000);
  });

  console.log(`\nstage7Announced=${stage7Announced}`);
  console.log('\n================ stage cards ================');
  for (const card of stageCards) {
    console.log(
      `  stage ${card.stage}  "${card.title}"  questionCount=${card.questionCount}  firstQuestionIndex=${card.firstQuestionIndex}  totalQuestions=${card.totalQuestions}`,
    );
  }

  const stage1 = stageCards.find((c) => c.stage === 1)!;
  const stage6 = stageCards.find((c) => c.stage === 6)!;
  const stage1Indices = questionIndices.filter(
    (i) => i >= stage1.firstQuestionIndex && i < stage1.firstQuestionIndex + stage1.questionCount,
  );
  const stage6Indices = questionIndices.filter(
    (i) => i >= stage6.firstQuestionIndex && i < stage6.firstQuestionIndex + stage6.questionCount,
  );
  console.log(`\nstage 1: questionCount=${stage1.questionCount}, observed QUESTION_SHOW count=${stage1Indices.length}`);
  console.log(`stage 6: questionCount=${stage6.questionCount}, observed QUESTION_SHOW count=${stage6Indices.length}`);
  console.log(`totalQuestions (whole game)=${stage1.totalQuestions}`);

  console.log('\n================ Socrates beat kinds ================');
  const tally = new Map<string, number>();
  for (const beat of beats) tally.set(beat.kind, (tally.get(beat.kind) ?? 0) + 1);
  for (const [kind, count] of [...tally.entries()].sort()) console.log(`  ${kind}: ${count}`);
  console.log(`  order: ${beats.map((b) => b.kind).join(',')}`);

  console.log(`\n[stage1-question-count-check ${SPEECH_POLICY}] DONE`);
}

async function main(): Promise<void> {
  await import('../server/src/index.js'); // the REAL server, in-process
  await delay(1200);
  await run();
}

main()
  .catch((error) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    process.exit(process.exitCode ?? 0);
  });
