import { createHash, randomInt } from 'node:crypto';

export const OPERATIONS = ['+', '-', '×', '÷'] as const;
export const ROUND_SIZE = 10;
export const TIME_LIMIT = 15_000;
export type Operation = typeof OPERATIONS[number];
export type Question = { left: number; right: number; operation: Operation; answer: number };
export type Attempt = Question & { submitted: number | null; correct: boolean; elapsedMs: number; level: number };
export type State = { level: number; streak: number; bestStreak: number; question: Question; startedAt: number; attempts: Attempt[] };

export function generateQuestion(level: number, seed?: string): Question {
  let index = 0;
  const integer = (max: number) => seed === undefined ? randomInt(max) :
    createHash('sha256').update(`${seed}:${index++}`).digest().readUInt32BE(0) % max;
  const operation = OPERATIONS[integer(OPERATIONS.length)];
  const range = [10, 20, 50, 100, 200][Math.max(0, Math.min(4, level - 1))];
  let left = integer(range) + 1;
  let right = integer(operation === '×' || operation === '÷' ? Math.min(range, 12) : range) + 1;
  if (operation === '-' && right > left) [left, right] = [right, left];
  if (operation === '÷') left *= right;
  const answer = operation === '+' ? left + right : operation === '-' ? left - right : operation === '×' ? left * right : left / right;
  return { left, right, operation, answer };
}

export function recordAnswer(state: State, submitted: number | null, now: number): State {
  const elapsedMs = Math.max(0, Math.min(TIME_LIMIT, now - state.startedAt));
  const correct = submitted !== null && now - state.startedAt < TIME_LIMIT && submitted === state.question.answer;
  const streak = correct ? state.streak + 1 : 0;
  const level = correct ? Math.min(5, state.level + (streak % 3 === 0 ? 1 : 0)) : Math.max(1, state.level - 1);
  return { ...state, level, streak, bestStreak: Math.max(state.bestStreak, streak),
    attempts: [...state.attempts, { ...state.question, submitted, correct, elapsedMs, level: state.level }] };
}

export function summarize(attempts: Attempt[]) {
  const correct = attempts.filter(a => a.correct).length;
  return { total: attempts.length, correct, accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : 0,
    averageMs: attempts.length ? Math.round(attempts.reduce((sum, a) => sum + a.elapsedMs, 0) / attempts.length) : 0 };
}
