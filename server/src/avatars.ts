import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVATAR_CATALOGUE } from '@game/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

// Same static-assets directory Express itself serves in each environment
// (see index.ts's clientDistPath) - in dev, Vite serves client/public
// directly and client/dist may not exist yet; in production only
// client/dist is actually deployed/served.
const avatarsDir = path.join(__dirname, isProduction ? '../../client/dist/avatars' : '../../client/public/avatars');

// Cross-references the full design catalogue against whatever PNG files
// actually exist on disk RIGHT NOW - computed once at server startup, not
// per-request. Only 7 of 24 creatures have art today; as more filenames
// land in that directory, this set grows to include them automatically on
// the next server start - no code change here, ever.
function computeAvailableAvatarIds(): ReadonlySet<string> {
  let filesOnDisk: Set<string>;
  try {
    filesOnDisk = new Set(fs.readdirSync(avatarsDir));
  } catch {
    filesOnDisk = new Set(); // directory doesn't exist yet - nothing is available
  }
  return new Set(AVATAR_CATALOGUE.filter((avatar) => filesOnDisk.has(avatar.filename)).map((avatar) => avatar.id));
}

export const AVAILABLE_AVATAR_IDS: ReadonlySet<string> = computeAvailableAvatarIds();

export function isValidAvatarId(avatarId: string): boolean {
  return AVAILABLE_AVATAR_IDS.has(avatarId);
}
