import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Difficulty, DifficultyMix, Question } from '@game/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = path.join(__dirname, 'data/questions.json');

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

// Maps the player-facing mix to which authored difficulties it draws from.
const DIFFICULTY_MIX_TO_ALLOWED: Record<DifficultyMix, readonly Difficulty[]> = {
  easy: ['easy', 'medium'],
  normal: ['easy', 'medium', 'hard'],
  hard: ['medium', 'hard'],
};

// Above this fraction of failed entries, the data is considered too broken
// to run on rather than silently serving a truncated bank.
const MAX_INVALID_FRACTION = 0.05;

function describeInvalidReason(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) {
    return 'not an object';
  }
  const entry = raw as Record<string, unknown>;

  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    return 'missing/invalid id';
  }
  if (typeof entry.category !== 'string' || entry.category.length === 0) {
    return 'missing/invalid category';
  }
  if (typeof entry.difficulty !== 'string' || !DIFFICULTIES.includes(entry.difficulty as Difficulty)) {
    return `invalid difficulty ${JSON.stringify(entry.difficulty)}`;
  }
  if (typeof entry.question !== 'string' || entry.question.length === 0) {
    return 'missing/invalid question text';
  }
  if (!Array.isArray(entry.options) || entry.options.length !== 4) {
    return `options array must have exactly 4 entries (got ${Array.isArray(entry.options) ? entry.options.length : typeof entry.options})`;
  }
  if (!entry.options.every((option) => typeof option === 'string' && option.length > 0)) {
    return 'options must all be non-empty strings';
  }
  if (new Set(entry.options as string[]).size !== 4) {
    return 'options are not all distinct';
  }
  if (
    typeof entry.correctIndex !== 'number' ||
    !Number.isInteger(entry.correctIndex) ||
    entry.correctIndex < 0 ||
    entry.correctIndex > 3
  ) {
    return `correctIndex must be an integer 0-3 (got ${JSON.stringify(entry.correctIndex)})`;
  }

  return null;
}

function loadQuestions(): Question[] {
  const raw = readFileSync(QUESTIONS_PATH, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`questions.json must contain a JSON array, got ${typeof parsed}`);
  }

  const valid: Question[] = [];
  const seenIds = new Set<string>();
  let invalidCount = 0;

  for (const [index, entry] of parsed.entries()) {
    const reason = describeInvalidReason(entry);
    if (reason) {
      invalidCount += 1;
      const id = typeof (entry as Record<string, unknown>)?.id === 'string' ? (entry as { id: string }).id : `#${index}`;
      console.error(`[questions] excluding invalid entry ${id}: ${reason}`);
      continue;
    }

    const question = entry as Question;
    if (seenIds.has(question.id)) {
      invalidCount += 1;
      console.error(`[questions] excluding entry ${question.id}: duplicate id`);
      continue;
    }
    seenIds.add(question.id);
    valid.push(question);
  }

  const invalidFraction = parsed.length === 0 ? 0 : invalidCount / parsed.length;
  if (invalidFraction > MAX_INVALID_FRACTION) {
    throw new Error(
      `questions.json has too many invalid entries: ${invalidCount}/${parsed.length} (${(invalidFraction * 100).toFixed(1)}%) exceeds the ${(MAX_INVALID_FRACTION * 100).toFixed(0)}% threshold`,
    );
  }

  logLoadSummary(valid, invalidCount);
  return valid;
}

function logLoadSummary(questions: Question[], invalidCount: number): void {
  const byDifficulty: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const question of questions) {
    byDifficulty[question.difficulty] = (byDifficulty[question.difficulty] ?? 0) + 1;
    byCategory[question.category] = (byCategory[question.category] ?? 0) + 1;
  }

  console.log(`[questions] loaded ${questions.length} questions (${invalidCount} excluded as invalid)`);
  console.log(`[questions] by difficulty: ${JSON.stringify(byDifficulty)}`);
  console.log(`[questions] by category: ${JSON.stringify(byCategory)}`);
}

// Loaded and validated exactly once at module load (server startup) - never
// re-read per room.
const QUESTIONS: Question[] = loadQuestions();

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getQuestionSet(mix: DifficultyMix, count: number): Question[] {
  const allowedDifficulties = DIFFICULTY_MIX_TO_ALLOWED[mix];
  const pool = QUESTIONS.filter((question) => allowedDifficulties.includes(question.difficulty));
  const shuffled = shuffle(pool);

  if (shuffled.length < count) {
    console.warn(
      `[questions] requested ${count} questions for mix "${mix}" but only ${shuffled.length} are available - returning all of them`,
    );
    return shuffled;
  }

  return shuffled.slice(0, count);
}

export interface QuestionStats {
  total: number;
  byDifficulty: Record<string, number>;
  byCategory: Record<string, number>;
}

export function getStats(): QuestionStats {
  const byDifficulty: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const question of QUESTIONS) {
    byDifficulty[question.difficulty] = (byDifficulty[question.difficulty] ?? 0) + 1;
    byCategory[question.category] = (byCategory[question.category] ?? 0) + 1;
  }
  return { total: QUESTIONS.length, byDifficulty, byCategory };
}
