// Task 70 - blitz round upload sink. ONE POST route, no GET: the client
// fire-and-forgets a finished round as JSON and this appends it as a single
// line to /var/lib/aegean-blitz/rounds.jsonl. The data is read back over
// ssh, never served. The route path is BLITZ_LOG_PATH from @game/shared -
// the single definition both sides import, so they cannot drift.
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { BLITZ_LOG_PATH } from '@game/shared';

const DIR = '/var/lib/aegean-blitz';
const FILE = path.join(DIR, 'rounds.jsonl');
const MAX_BODY_BYTES = 32 * 1024; // reject anything larger
const MAX_FILE_BYTES = 50 * 1024 * 1024; // stop appending past this, answer 507

export function registerBlitzLog(app: Express): void {
  // Created once on boot; recursive so a missing parent is fine too.
  fs.mkdirSync(DIR, { recursive: true });

  app.post(BLITZ_LOG_PATH, express.json({ limit: MAX_BODY_BYTES }), (req: Request, res: Response) => {
    let size = 0;
    try {
      size = fs.statSync(FILE).size;
    } catch {
      size = 0; // no file yet
    }
    if (size > MAX_FILE_BYTES) {
      res.status(507).end();
      return;
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).end();
      return;
    }
    // ONE line, appended atomically enough for a single low-rate writer.
    fs.appendFileSync(FILE, JSON.stringify(req.body) + '\n');
    res.status(204).end();
  });

  // express.json throws on an oversize or malformed body. Turn that into the
  // 4xx the client treats as "leave it sent:false and retry later", never a
  // 500. Scoped to this path so it cannot catch anything else.
  app.use(BLITZ_LOG_PATH, (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (!err) {
      next();
      return;
    }
    const tooLarge = typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).end();
  });
}
