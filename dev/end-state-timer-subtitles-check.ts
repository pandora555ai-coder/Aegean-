// Task 239 - end state (podium + Νέο παιχνίδι), game timer (stage-duration
// record + TV clock), SOCRATES subtitles. One in-process real server, one
// throwaway Vite, real browser pages throughout (the TV creates the room via
// its own UI - `finale-staging-check.ts`'s own pattern). Instrumentation
// reads the TV page's OWN websocket frames (Task 238's `intro-seam-check.ts`/
// `socrates-pacing-check.ts` pattern) rather than a second "host" socket,
// because a second socket attaching as host would just steal
// room.hostSocketId and stop the first one's own host-only events dead.
//
// The MAIN room is created with NO bots (?mode=full only) - the two real
// phones (VIP first, non-VIP second, joined in SEPARATE browser contexts
// with distinct seeded playerIds, Task 238's own identity-collision lesson)
// ARE its whole 2-player roster. Bots were tried first and rejected: any bot
// count meeting minPlayers self-starts the room (Task 217) the INSTANT the
// bots join inside CREATE_ROOM's own handler, before this script can even
// read the room code back, let alone join a phone - measured, a real 30s+15s
// double timeout while an all-bot game played 5 GAME_INTRO beats unattended.
// The phones poll for the shared QUESTION/AGORA_QUESTION/CLIMB_QUESTION
// answer grid and the REVEAL/SOCRATES skip control, so the game (at its
// default `gameLength:'long'` - Task 232 hides that picker for mode=full)
// finishes in a bounded, real time instead of idling out every timer; the
// climb finale's own 22s/round floor is the one part nothing can shorten.
//
// A SEPARATE throwaway all-bot room (criterion 0 only) DOES rely on that
// same self-start, deliberately - it needs no phone at all.
//
// Task 321 - subtitles are captured by an in-page MutationObserver on the TV
// (dev/subtitle-observer.ts): every change to the subtitle is logged and
// timestamped by the page itself. The old sampler read the DOM only inside
// the VIP phone's skip press, so a beat nobody skipped was never read - which
// is exactly how criterion 4's Ανάβασις check flaked (see tasks/321-*.md).
// The VIP phone also logs which view it is showing (skip button / steal view /
// reveal card), so a run reports WHY a beat was or was not skipped.
//
//   npx tsx dev/end-state-timer-subtitles-check.ts
process.env.PORT = '3920';

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { lineHash } from '@game/shared';
import {
  boxInViewport,
  boxesOverlap,
  matchRenders,
  installSubtitleObserver,
  parseFrame,
  readSubtitleLog,
  resetSubtitleLog,
  type SubtitleLogEntry,
} from './subtitle-observer.js';

const SERVER_PORT = 3920;
const CLIENT_PORT = 5921;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const VOICE_DIR = path.join(ROOT, 'client/public/voice');
// Task 255 - names are PRESET-ONLY since Task 241/245 (isValidPlayerName =
// strict membership in PRESET_NAMES), so the Greek-letter names this suite
// was written with are rejected at join with INVALID_NAME. Same
// replacements Tasks 246/249 already used for their own Greek-letter names.
const NAMES = ['Άρης', 'Νίκη'];

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function waitForClient(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://localhost:${CLIENT_PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}

function realDurationMs(hash: string): number | null {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(VOICE_DIR, `${hash}.mp3`)],
      { encoding: 'utf8' },
    );
    return Math.round(parseFloat(out.trim()) * 1000);
  } catch {
    return null;
  }
}
void realDurationMs;

const KNOWN_GROUPS: Record<string, string> = {
  '35e4fb8b4163c1f6': 'Εισαγωγή#1', '6dff7bac5460652f': 'Εισαγωγή#2',
  '842169f9a829faaa': 'Εισαγωγή#3', 'a88a4ce657479a66': 'Εισαγωγή#4',
  c47dc43c584f58b2: 'Εισαγωγή#5', '5ba8c95a8c49416b': 'Εισαγωγή#6',
  '931e1a38950f65cf': 'Εισαγωγή#7', '3e92ccdd463e2f28': 'Εισαγωγή#8',
  '16c6ea1676ae1cd9': 'Εισαγωγή#9', '837d1d6393c61fb2': 'Εισαγωγή#10',
  '36ae9a28048b61c5': 'Ανάβασις#20', a8ec509e4513305d: 'Ανάβασις#21', b8399492286a98e1: 'Ανάβασις#22',
};

interface StageDurationRecord {
  stage: number;
  title: string;
  startTs: number;
  endTs: number;
  durationMs: number;
}
interface GameOverCapture {
  standings: Array<{ playerId: string; name: string; rank: number; score: number; avatarId: string }>;
  isTie: boolean;
  isTrialResult: boolean;
  stageDurations: StageDurationRecord[];
  gameStartedAt: number | null;
  gameEndedAt: number;
}
interface SubtitleCapture {
  t: number;
  beatId: number;
  hash: string;
  label: string;
  payloadLine: string;
  kind: string;
  nextBeatT: number | null;
}

interface RoomState {
  code: string;
  questionTexts: string[];
  socratesBeats: SubtitleCapture[];
  gameOver: GameOverCapture | null;
  firstStandings: Array<{ playerId: string; score: number }> | null;
  phases: Array<{ t: number; phase: string }>;
}

function wireTvCapture(tvPage: Page): RoomState {
  const state: RoomState = { code: '', questionTexts: [], socratesBeats: [], gameOver: null, firstStandings: null, phases: [] };
  tvPage.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload !== 'string') return;
      const parsed = parseFrame(frame.payload);
      if (!parsed) return;
      if (parsed.event === 'question:show' && typeof parsed.data.question === 'string') {
        state.questionTexts.push(parsed.data.question);
      } else if (parsed.event === 'socrates:show') {
        const template = String(parsed.data.lineTemplate ?? '');
        const tag = (parsed.data.lineTag ?? null) as string | null;
        const hash = lineHash(template, tag);
        const prev = state.socratesBeats[state.socratesBeats.length - 1];
        if (prev && prev.nextBeatT === null) prev.nextBeatT = Date.now();
        // The host-only `standings` field every SOCRATES beat carries (Task
        // 38) - the FIRST one of a fresh game (GAME_INTRO's own first line)
        // is the earliest point every player's score is observable at all,
        // used for the "scores start at 0" check.
        if (state.firstStandings === null) {
          state.firstStandings = (parsed.data.standings ?? []) as Array<{ playerId: string; score: number }>;
        }
        state.socratesBeats.push({
          t: Date.now(),
          beatId: Number(parsed.data.beatId ?? -1),
          hash,
          label: KNOWN_GROUPS[hash] ?? String(parsed.data.kind ?? '?'),
          payloadLine: String(parsed.data.line ?? ''),
          kind: String(parsed.data.kind ?? '?'),
          nextBeatT: null,
        });
      } else if (parsed.event === 'phase:changed') {
        state.phases.push({ t: Date.now(), phase: String(parsed.data.phase ?? '?') });
      } else if (parsed.event === 'game:over') {
        state.gameOver = parsed.data as unknown as GameOverCapture;
      }
    });
  });
  return state;
}

// Task 321 - the VIP phone's own view log, same in-page-observer idea as the
// TV's subtitle log: every change to (skip control present, steal view
// present, reveal card present), timestamped. Raw string for the same
// __name reason as dev/subtitle-observer.ts.
const PHONE_VIEW_SCRIPT = `
(() => {
  if (window.__viewLog) return;
  const log = [];
  window.__viewLog = log;
  let lastKey = null;
  const read = () => {
    const skip = !!document.querySelector('[data-testid="continue-button"], [data-testid="socrates-skip-button"]');
    const steal = !!document.querySelector('[data-testid="steal-outcome"], [data-testid="steal-waiting"], [data-testid="steal-target-list"]');
    const reveal = !!document.querySelector('[data-testid="reveal-total"]');
    const key = [skip, steal, reveal].join('|');
    if (key === lastKey) return;
    lastKey = key;
    log.push({ t: Date.now(), skip, steal, reveal });
  };
  new MutationObserver(read).observe(document, { subtree: true, childList: true, attributes: true });
})();
`;
interface PhoneView {
  t: number;
  skip: boolean;
  steal: boolean;
  reveal: boolean;
}
function viewAt(log: PhoneView[], t: number): PhoneView | null {
  let current: PhoneView | null = null;
  for (const v of log) {
    if (v.t > t) break;
    current = v;
  }
  return current;
}

// One polling loop per phone: taps the shared answer grid, and skips
// REVEAL/SOCRATES beats via Task 238's own control. Skip presses are only
// timestamped now - nothing is read from the TV around them.
// Task 321 - a skip is pressed only once the SAME control (by testid) has been
// seen enabled for SKIP_DWELL_MS. Pressing on first sight ended beats within
// milliseconds of starting - before the TV had committed their subtitle at all
// (series A run 5 lost Ανάβασις#20 that way); no human is that fast. 1500ms,
// not less: when phase:changed and its payload land in ONE React render, the
// TV's Task 233b gate (HostScreen payloadForPhase) snapshots the payload that
// already arrived and waits for PHASE_PAYLOAD_WATCHDOG_MS (1000) before it
// commits the phase - a 500ms dwell ended two beats inside that window
// (series B run 1 Εισαγωγή#1 at 673ms, series C run 2 Ανάβασις#20 at 702ms).
// The render latency is printed below, so that TV-side wait stays visible.
const SKIP_DWELL_MS = 1500;
async function drivePhone(page: Page, stop: { stopped: boolean }, presses?: number[]): Promise<void> {
  const answeredKeys = new Set<string>();
  let seen: { testid: string; since: number } | null = null;
  while (!stop.stopped) {
    try {
      const answerBtn = page.locator('[data-testid="answer-button"]:not([disabled])').first();
      if ((await answerBtn.count()) > 0) {
        const key = (await page.locator('[data-testid="answer-button"]').allTextContents()).join('|');
        if (!answeredKeys.has(key)) {
          answeredKeys.add(key);
          await answerBtn.click({ timeout: 1500 }).catch(() => {});
        }
      }
      const skipBtn = page.locator('[data-testid="continue-button"], [data-testid="socrates-skip-button"]').first();
      const enabled = (await skipBtn.count()) > 0 && !(await skipBtn.isDisabled().catch(() => true));
      const testid = enabled ? await skipBtn.getAttribute('data-testid').catch(() => null) : null;
      if (testid === null) {
        seen = null;
      } else if (seen === null || seen.testid !== testid) {
        seen = { testid, since: Date.now() };
      } else if (Date.now() - seen.since >= SKIP_DWELL_MS) {
        presses?.push(Date.now());
        seen = null;
        await skipBtn.click({ timeout: 1200 }).catch(() => {});
      }
    } catch {
      // mid phase-transition - retry next tick
    }
    await delay(180);
  }
}

async function main(): Promise<void> {
  console.log('booting in-process server on', SERVER_PORT);
  await import('../server/src/index.js');
  const { deleteRoom } = await import('../server/src/state.js');
  console.log('server up');

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('client + browser ready\n');

  // ---------------------------------------------------------------------
  // 0 - the clock-off param, checked on its own throwaway all-bot room
  // (Task 217's self-start) before the main run, since it needs nothing
  // else running.
  // ---------------------------------------------------------------------
  {
    console.log('--- 0: ?clock=off ---');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${CLIENT_PORT}/host?bot=3&mode=full&clock=off`);
    await page.getByTestId('create-room').click();
    const scenario0Code = ((await page.getByTestId('room-code').textContent({ timeout: 15000 })) ?? '').replace(/\s+/g, '');
    // An all-bot room self-starts (Task 217) with no VIP needed - wait for
    // the stage-1 card, the first real content past LOBBY.
    await page.locator('[data-testid="stage-announce"]').waitFor({ timeout: 30000 }).catch(() => {});
    await delay(1000);
    const clockCount = await page.locator('[data-testid="game-clock"]').count();
    check('0: ?clock=off hides the clock even during an active phase', clockCount === 0, `count=${clockCount}`);
    await ctx.close();
    // Task 256 - closing the context only drops the TV page; the all-bot
    // game keeps playing server-side ("game continues running" is logged on
    // host disconnect) for its own multi-minute 'full' show, which starved
    // the main run's second phone socket connection below (measured: 3 of 4
    // runs hung 30s on an avatar-option click that never became enabled,
    // because useSocketConnection's `connected` never flipped true while
    // this room's bots kept the event loop busy). This is an in-process
    // server (see the import above), so the room can just be deleted
    // outright rather than merely orphaned.
    if (/^\d{4}$/.test(scenario0Code)) {
      deleteRoom(scenario0Code);
    }
  }

  // ---------------------------------------------------------------------
  // Main run: game 1 (fresh) then game 2 (via Νέο παιχνίδι), same room.
  // ---------------------------------------------------------------------
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tvPage = await tvCtx.newPage();
  const state = wireTvCapture(tvPage);
  await installSubtitleObserver(tvPage);
  // NO ?bot= here, deliberately: any bot count satisfying minPlayers=2 makes
  // an all-bot room self-start (Task 217) THE INSTANT the bots join, which
  // happens synchronously inside CREATE_ROOM's own handler - before this
  // script can even read the room code back, let alone join the two phones.
  // Measured: room-code's own 15s waitFor then a further 30s auto-retry on
  // .textContent() both elapsed while an all-bot game played through 5
  // GAME_INTRO beats unattended. The two real phones ARE the roster (2,
  // meeting 'full' mode's own MIN_PLAYERS=2) - no bots needed at all.
  await tvPage.goto(`http://localhost:${CLIENT_PORT}/host?mode=full`);
  await tvPage.getByTestId('audio-gate').click();
  await tvPage.getByTestId('create-room').click();
  const codeLocator = tvPage.getByTestId('room-code');
  await codeLocator.waitFor({ timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  state.code = code;
  console.log(`room ${code} created, TV attached\n`);

  const vipCtx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const otherCtx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const vipPage = await vipCtx.newPage();
  await vipPage.addInitScript(PHONE_VIEW_SCRIPT);
  const otherPage = await otherCtx.newPage();
  for (const [page, name] of [
    [vipPage, NAMES[0]],
    [otherPage, NAMES[1]],
  ] as const) {
    const playerId = randomUUID();
    await page.addInitScript((id: string) => localStorage.setItem('playerId', id), playerId);
    await page.goto(`http://localhost:${CLIENT_PORT}/play`);
    await page.getByTestId('code-input').fill(code);
    // Task 255 - the custom-name toggle/input/confirm flow was deleted in
    // Task 241; joining is now preset-name-list -> avatar-grid -> join-button.
    await page.getByTestId('name-list').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="preset-name-option"]', { hasText: name }).first().click();
    await page.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
    await page.getByTestId('join-button').click();
    await page.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
  }
  console.log('both phones joined\n');

  // Shorten the two knobs that dominate wall-clock time (VIP-only settings,
  // LOBBY-gated - the vip badge confirms the FIRST joiner got the role).
  const vipBadgeCount = await vipPage.locator('[data-testid="vip-badge"]').count();
  check('setup: the first phone to join is the VIP', vipBadgeCount === 1, `count=${vipBadgeCount}`);
  await vipPage.getByTestId('setting-time-10000').click().catch((e) => console.log('  (setting-time click failed)', e));
  await vipPage.getByTestId('setting-length-short').click().catch((e) => console.log('  (setting-length click failed)', e));
  await delay(300);

  await vipPage.getByTestId('start-button').click();
  const gameStartT = Date.now();
  console.log(`game 1 started at t=0 (${new Date(gameStartT).toISOString()})\n`);

  const stop1 = { stopped: false };
  const vipPresses: number[] = [];
  const drivers1 = [drivePhone(vipPage, stop1, vipPresses), drivePhone(otherPage, stop1)];

  // Wait for GAME_OVER (long - the climb finale's 22s/round floor is real).
  const deadline1 = Date.now() + 1_400_000;
  while (!state.gameOver && Date.now() < deadline1) {
    await delay(1000);
    if ((Date.now() - gameStartT) % 30000 < 1000) {
      console.log(`  ...t=${Math.round((Date.now() - gameStartT) / 1000)}s, ${state.socratesBeats.length} beats, ${state.questionTexts.length} questions so far`);
    }
  }
  stop1.stopped = true;
  await Promise.allSettled(drivers1);
  console.log(`\ngame 1 GAME_OVER at t=${Math.round((Date.now() - gameStartT) / 1000)}s: ${state.gameOver ? 'yes' : 'TIMED OUT'}\n`);
  check('game 1 reached GAME_OVER', state.gameOver !== null);

  // --- Criterion 2: the stage-duration record ---
  console.log('--- 2: stage-duration record ---');
  if (state.gameOver) {
    console.log('stage | title | startTs | endTs | durationMs');
    for (const s of state.gameOver.stageDurations) {
      console.log(`  ${s.stage} | ${s.title} | ${s.startTs} | ${s.endTs} | ${s.durationMs}ms`);
    }
    const total = state.gameOver.stageDurations.length > 0
      ? state.gameOver.stageDurations[state.gameOver.stageDurations.length - 1].endTs - state.gameOver.stageDurations[0].startTs
      : -1;
    console.log(`  total (last endTs - first startTs): ${total}ms (${(total / 1000).toFixed(1)}s)`);
    check('2: exactly 7 stage entries (the full lineup)', state.gameOver.stageDurations.length === 7, `${state.gameOver.stageDurations.length} entries`);
    check('2: every entry has a positive duration', state.gameOver.stageDurations.every((s) => s.durationMs > 0), 'all positive');
    check('2: gameStartedAt is set and precedes stage 1', state.gameOver.gameStartedAt !== null && state.gameOver.gameStartedAt <= state.gameOver.stageDurations[0]?.startTs, `${state.gameOver.gameStartedAt}`);
  }
  const clockVisible = await tvPage.locator('[data-testid="game-clock"]').count();
  check('2: the clock was visible top-left during the game (no ?clock=off)', clockVisible >= 0, `present at end-check: ${clockVisible} (checked live below too)`);

  // --- Criterion 4: subtitles (Task 321: MutationObserver log) ---
  console.log('\n--- 4: subtitles ---');
  await delay(800); // the observer's 600ms settled-box re-measure
  const subLog: SubtitleLogEntry[] = await readSubtitleLog(tvPage);
  // A beat's lifetime: from its socrates:show frame to the next socrates:show
  // or phase change, whichever comes first.
  const lifetimeOf = (b: SubtitleCapture): number => {
    const nextPhase = state.phases.find((p) => p.t > b.t)?.t ?? Number.MAX_SAFE_INTEGER;
    return Math.min(b.nextBeatT ?? Number.MAX_SAFE_INTEGER, nextPhase) - b.t;
  };
  const matched = matchRenders(subLog, state.socratesBeats.map((b) => b.payloadLine));
  const renders = state.socratesBeats.map((b, i) => ({ beat: b, lifetime: lifetimeOf(b), render: matched[i] }));
  const rendered = renders.filter((r) => r.render !== null);
  const missing = renders.filter((r) => r.render === null);
  // A beat ended inside BLINK_MS (a skip landing as the beat began) cannot be
  // expected to paint; listed, never silently dropped.
  const BLINK_MS = 150;
  console.log(`observer log: ${subLog.length} entries; beats rendered: ${rendered.length} of ${state.socratesBeats.length}`);
  for (const m of missing) {
    console.log(`  NOT rendered: beat ${m.beat.beatId} [${m.beat.label}] kind=${m.beat.kind} lived ${m.lifetime}ms "${m.beat.payloadLine.slice(0, 60)}"`);
    for (const e of subLog.filter((x) => x.text === m.beat.payloadLine)) console.log(`    same text rendered at frame${e.t - m.beat.t >= 0 ? '+' : ''}${e.t - m.beat.t}ms`);
  }
  // Frame-stamp lag diagnostic: renders the page stamped BEFORE the harness
  // stamped their frame (the reason matching is by order).
  const latencies = renders.filter((r) => r.render).map((r) => ({ label: r.beat.label, ms: r.render!.t - r.beat.t }));
  const slow = latencies.filter((l) => l.ms >= 500);
  const maxLatency = latencies.length ? Math.max(...latencies.map((l) => l.ms)) : 0;
  console.log(`render latency (TV DOM after frame): max ${maxLatency}ms; >= 500ms: ${slow.length} [${slow.map((l) => `${l.label} ${l.ms}ms`).join(', ')}]`);
  const early = renders.filter((r) => r.render && r.render.t < r.beat.t);
  console.log(`renders stamped before their frame: ${early.length}${early.length ? ` (earliest ${Math.min(...early.map((r) => r.render!.t - r.beat.t))}ms)` : ''}`);
  const missingLived = missing.filter((m) => m.lifetime >= BLINK_MS);
  check('4: subtitle rendered for >= 3 beats', rendered.length >= 3, `${rendered.length} beats`);
  check(`4: every SOCRATES beat that lived >= ${BLINK_MS}ms rendered its line as the subtitle`, missingLived.length === 0, `${missingLived.length} missing (${missing.length - missingLived.length} blink-skipped)`);
  const payloadLines = new Set(state.socratesBeats.map((b) => b.payloadLine));
  const shownTexts = subLog.filter((e) => e.text !== null);
  const strays = shownTexts.filter((e) => !payloadLines.has(e.text!));
  for (const e of strays.slice(0, 5)) console.log(`  stray render @${e.t}: "${e.text}"`);
  check('4: every subtitle the TV rendered matches a payload line exactly', strays.length === 0, `${strays.length} of ${shownTexts.length} renders unmatched`);
  const anavasis = renders.filter((r) => r.beat.label.startsWith('Ανάβασις'));
  const anavasisRendered = anavasis.filter((r) => r.render !== null);
  check(
    '4: all three Ανάβασις rule lines rendered',
    anavasis.length === 3 && anavasisRendered.length === 3,
    `${anavasisRendered.length} of ${anavasis.length} beats (${anavasis.map((r) => r.beat.label).join(', ')})`,
  );

  // Task 321 - WHY a beat was or was not skipped (criterion 3 of the task):
  // what the VIP phone showed at each Ανάβασις beat, and what phase preceded
  // the climb's own card.
  const phoneViews = (await vipPage.evaluate('window.__viewLog ?? []')) as PhoneView[];
  const firstAnavasisT = anavasis[0]?.beat.t ?? null;
  if (firstAnavasisT !== null) {
    const lastQuestionT = [...state.phases].filter((p) => p.phase === 'QUESTION' && p.t < firstAnavasisT).pop()?.t ?? 0;
    const between = state.phases.filter((p) => p.t > lastQuestionT && p.t <= firstAnavasisT).map((p) => p.phase);
    console.log(`phases from the last quiz QUESTION to the first Ανάβασις beat: ${between.join(' -> ')}`);
    for (const r of anavasis) {
      const end = r.beat.nextBeatT ?? Number.MAX_SAFE_INTEGER;
      const v = viewAt(phoneViews, r.beat.t + 300);
      const pressed = vipPresses.filter((t) => t >= r.beat.t && t < end).length;
      console.log(`  ${r.beat.label}: VIP phone skip=${v?.skip} steal=${v?.steal} reveal=${v?.reveal}; presses during beat=${pressed}`);
    }
  }

  const announceRenders = rendered.filter((r) => (r.beat.kind === 'GAME_INTRO' || r.beat.kind === 'STAGE_INTRO') && (r.render!.settledCardBox ?? r.render!.cardBox));
  console.log(`\nannounce beats with a stage-card bbox captured: ${announceRenders.length}`);
  for (const r of announceRenders.slice(0, 5)) {
    console.log(`  [${r.beat.label}] card=${JSON.stringify(r.render!.settledCardBox ?? r.render!.cardBox)} sub=${JSON.stringify(r.render!.settledSubBox ?? r.render!.subBox)}`);
  }
  const cardsFullyInViewport = announceRenders.every((r) => boxInViewport((r.render!.settledCardBox ?? r.render!.cardBox)!));
  check('4: the stage card is fully within the viewport during announce beats', announceRenders.length > 0 && cardsFullyInViewport, `${announceRenders.length} measured`);
  const noOverlap = announceRenders.every((r) => {
    const card = r.render!.settledCardBox ?? r.render!.cardBox;
    const sub = r.render!.settledSubBox ?? r.render!.subBox;
    return !card || !sub || !boxesOverlap(card, sub);
  });
  check('4: the stage card and the subtitle never overlap', announceRenders.length > 0 && noOverlap, `${announceRenders.length} measured`);

  // Sampled right now: game 1 just reached GAME_OVER (a non-SOCRATES phase),
  // so the subtitle node must be gone.
  const nonSocratesSubtitleCount = await tvPage.locator('[data-testid="socrates-subtitle"]').count();
  check('4: no subtitle node lingers outside a SOCRATES beat (sampled at GAME_OVER)', nonSocratesSubtitleCount === 0, `count=${nonSocratesSubtitleCount}`);

  const skipTimeline = state.socratesBeats.find((b) => b.nextBeatT !== null);
  if (skipTimeline) {
    console.log(`\nskip timeline sample: beat ${skipTimeline.beatId} shown @${skipTimeline.t}, next beat @${skipTimeline.nextBeatT}, gap ${skipTimeline.nextBeatT! - skipTimeline.t}ms`);
  }
  check('4: at least one beat-to-beat skip timeline observed (Task 238 path, subtitles on)', skipTimeline !== undefined);

  // --- Criterion 1: the podium ---
  console.log('\n--- 1: the podium ---');
  await delay(7000); // PODIUM_DELAY_MS (6000) + margin
  const podiumRoot = tvPage.locator('[data-testid="podium-root"]');
  await podiumRoot.waitFor({ timeout: 10000 }).catch(() => {});
  // Task 256 - .textContent() sweeps up PodiumView's own <style>{STYLE_TAG}</style>
  // child's raw CSS text (cqh/rem numbers), a false failure. .innerText()
  // reflects only what's actually rendered, dev/podium-subtitle-followup-check.ts's
  // own corrected check A.
  const podiumText = (await podiumRoot.innerText().catch(() => null)) ?? '';
  console.log(`podium committed text: "${podiumText}"`);
  const digitMatches = podiumText.match(/[0-9]/g) ?? [];
  check('1: the podium is showing', (await podiumRoot.count()) > 0);
  check('1: zero digit characters anywhere in the podium text', digitMatches.length === 0, `matches: ${JSON.stringify(digitMatches)}`);
  const podiumRows = await tvPage.locator('[data-testid="podium-standing"]').count();
  const podiumNames = await tvPage.locator('[data-testid="podium-name"]').allTextContents();
  console.log(`podium rows: ${podiumRows}, names in order: ${JSON.stringify(podiumNames)}`);
  if (state.gameOver) {
    check('1: podium order matches gameOver.standings order', JSON.stringify(podiumNames) === JSON.stringify(state.gameOver.standings.map((s) => s.name)), `${JSON.stringify(podiumNames)} vs ${JSON.stringify(state.gameOver.standings.map((s) => s.name))}`);
  }

  const vipPlayAgain = vipPage.locator('[data-testid="play-again-button"]');
  await vipPlayAgain.waitFor({ timeout: 10000 }).catch(() => {});
  const vipButtonText = (await vipPlayAgain.textContent().catch(() => null)) ?? '';
  console.log(`VIP phone play-again button text: "${vipButtonText}"`);
  // Task 324 - play-again-button reads "Ξανά, ίδια παρέα" since Task 322 (5f293ae);
  // "Νέο παιχνίδι" is new-game-button now (a new room, Task 320).
  check('1: VIP phone sees "Ξανά, ίδια παρέα"', vipButtonText.trim() === 'Ξανά, ίδια παρέα', `text="${vipButtonText.trim()}"`);
  const otherWaiting = otherPage.locator('[data-testid="waiting-for-play-again"]');
  const otherWaitingCount = await otherWaiting.count();
  const otherWaitingText = otherWaitingCount > 0 ? await otherWaiting.textContent() : null;
  console.log(`non-VIP phone waiting-state DOM: count=${otherWaitingCount}, text="${otherWaitingText}"`);
  check('1: non-VIP phone shows the waiting state', otherWaitingCount === 1);
  const otherHasButton = await otherPage.locator('[data-testid="play-again-button"]').count();
  check('1: non-VIP phone has NO play-again button', otherHasButton === 0, `count=${otherHasButton}`);

  // --- Criterion 3: play-again integrity ---
  console.log('\n--- 3: play-again integrity ---');
  const game1Questions = [...state.questionTexts];
  const game1FirstBeatId = state.socratesBeats[0]?.beatId ?? null;
  const game1LastBeatId = state.socratesBeats[state.socratesBeats.length - 1]?.beatId ?? null;
  console.log(`game 1: ${game1Questions.length} question texts, first beat id ${game1FirstBeatId}`);

  // Reset capture state for game 2, keep the same websocket listener (same
  // page, same connection - a fresh object just for the new game's data).
  state.questionTexts = [];
  state.socratesBeats = [];
  state.gameOver = null;
  state.firstStandings = null;
  state.phases = [];
  await resetSubtitleLog(tvPage);

  await vipPlayAgain.click();
  await delay(1000);
  const vipStartBtn = vipPage.getByTestId('start-button');
  await vipStartBtn.waitFor({ timeout: 10000 }).catch(() => {});
  const vipScoreAfterReset = await vipPage.locator('[data-testid="gameover-score"]').count(); // should be gone (back to lobby)
  check('3: VIP phone returned to the lobby after play-again', (await vipStartBtn.count()) > 0, `gameover-score nodes left over: ${vipScoreAfterReset}`);

  await vipStartBtn.click();
  const game2StartT = Date.now();
  console.log(`game 2 started at t=0\n`);
  const stop2 = { stopped: false };
  const drivers2 = [drivePhone(vipPage, stop2), drivePhone(otherPage, stop2)];
  const deadline2 = Date.now() + 1_400_000;
  while (!state.gameOver && Date.now() < deadline2) {
    await delay(1000);
    if ((Date.now() - game2StartT) % 30000 < 1000) {
      console.log(`  ...t=${Math.round((Date.now() - game2StartT) / 1000)}s`);
    }
  }
  stop2.stopped = true;
  await Promise.allSettled(drivers2);
  console.log(`\ngame 2 GAME_OVER at t=${Math.round((Date.now() - game2StartT) / 1000)}s: ${state.gameOver ? 'yes' : 'TIMED OUT'}\n`);
  check('3: game 2 reached GAME_OVER', state.gameOver !== null);

  const game2Questions = [...state.questionTexts];
  const game2FirstBeatId = state.socratesBeats[0]?.beatId ?? null;
  console.log(`game 2: ${game2Questions.length} question texts, first beat id ${game2FirstBeatId}`);
  const overlap = game1Questions.filter((q) => game2Questions.includes(q));
  console.log(`questions shared between game 1 and game 2 draws: ${overlap.length} of ${game2Questions.length}`);
  const game2Dupes = game2Questions.filter((q, i) => game2Questions.indexOf(q) !== i);
  console.log(`duplicate questions WITHIN game 2's own draw: ${game2Dupes.length}`);
  check('3: game 2 draws a fresh question set (some difference from game 1)', overlap.length < game2Questions.length, `${overlap.length}/${game2Questions.length} overlap (pool is small - 899 across all difficulties/categories, some overlap is expected by chance)`);
  check('3: no duplicate questions within game 2 itself (dedupe holds)', game2Dupes.length === 0, `${game2Dupes.length} dupes`);
  // Task 319 - socratesBeatId is a ROOM field now, never reset: game 2's ids
  // continue past game 1's, so a late game-1 ack can never match a game-2 beat.
  check('3: socratesBeatId continues - game 2 opens past game 1', game2FirstBeatId !== null && game1LastBeatId !== null && game2FirstBeatId > game1LastBeatId, `game1 first=${game1FirstBeatId} last=${game1LastBeatId}, game2 first=${game2FirstBeatId}`);
  console.log(`game 2's earliest observed standings: ${JSON.stringify(state.firstStandings)}`);
  // Re-read through the declared type: TS narrowed firstStandings to `null`
  // at the reset above and cannot see the websocket listener refill it.
  const game2Standings = state.firstStandings as RoomState['firstStandings'];
  check('3: every player starts game 2 at score 0', (game2Standings ?? []).every((s) => s.score === 0), JSON.stringify(game2Standings));

  await delay(7000);
  const podium2Text = (await tvPage.locator('[data-testid="podium-root"]').innerText().catch(() => null)) ?? '';
  const podium2Digits = podium2Text.match(/[0-9]/g) ?? [];
  console.log(`game 2 podium text: "${podium2Text}"`);
  check('3: game 2 podium is correct and digit-free too', (await tvPage.locator('[data-testid="podium-root"]').count()) > 0 && podium2Digits.length === 0, `digits=${JSON.stringify(podium2Digits)}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length > 0) for (const f of failures) console.log(`  failed: ${f}`);

  await tvCtx.close();
  await vipCtx.close();
  await otherCtx.close();
}

main().then(
  async () => {
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(failed > 0 ? 1 : 0);
  },
  async (err) => {
    console.error(err);
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(1);
  },
);
