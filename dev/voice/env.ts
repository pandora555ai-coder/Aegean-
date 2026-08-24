// Tiny dependency-free .env loader - just enough to keep
// ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID out of the repo without adding a
// dotenv dependency. Never overrides a variable already set in the shell.
import { readFileSync } from 'node:fs';

export function loadDotEnvIfPresent(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // no .env file - fine, vars may already be exported in the shell
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
