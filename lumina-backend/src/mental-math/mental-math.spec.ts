import { describe, expect, it, vi, afterEach } from 'vitest';
import { validate } from 'class-validator';
import { generateQuestion, recordAnswer, summarize, type State } from './mental-math.domain';
import { MentalMathService } from './mental-math.service';
import { AnswerMathDto } from './mental-math.module';
import { PrismaService } from '../database/prisma.service';

const initial = (): State => ({ level: 1, streak: 0, bestStreak: 0, startedAt: 1000, attempts: [], question: { left: 3, right: 2, operation: '+', answer: 5 } });
afterEach(() => vi.restoreAllMocks());

describe('Cálculo mental', () => {
  it('gera cálculos exatos, positivos e reproduzíveis em todos os níveis', () => {
    const operations = new Set();
    for (let level = 1; level <= 5; level++) for (let i = 0; i < 100; i++) {
      const q = generateQuestion(level, String(i));
      expect(q).toEqual(generateQuestion(level, String(i)));
      expect(Number.isInteger(q.answer)).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.right).toBeGreaterThan(0);
      expect(q.answer).toBe(q.operation === '+' ? q.left + q.right : q.operation === '-' ? q.left - q.right : q.operation === '×' ? q.left * q.right : q.left / q.right);
      operations.add(q.operation);
    }
    expect(operations.size).toBe(4);
  });
  it('aumenta o nível após três acertos e reduz após erro', () => {
    let state = initial();
    for (let i = 0; i < 3; i++) state = recordAnswer(state, 5, 2000);
    expect(state.level).toBe(2);
    state = recordAnswer(state, 4, 2000);
    expect(state.level).toBe(1);
    expect(state.streak).toBe(0);
    expect(state.bestStreak).toBe(3);
  });
  it('rejeita resposta correta no prazo expirado e limita o tempo registrado', () => {
    expect(recordAnswer(initial(), 5, 15999).attempts[0].correct).toBe(true);
    expect(recordAnswer(initial(), 5, 16000).attempts[0].correct).toBe(false);
    expect(recordAnswer(initial(), 5, 999999).attempts[0].elapsedMs).toBe(15000);
    expect(recordAnswer(initial(), null, 2000).attempts[0].correct).toBe(false);
  });
  it('calcula métricas sem dividir por zero', () => {
    expect(summarize([])).toEqual({ total: 0, correct: 0, accuracy: 0, averageMs: 0 });
    expect(summarize(recordAnswer(initial(), 5, 2500).attempts)).toEqual({ total: 1, correct: 1, accuracy: 100, averageMs: 1500 });
  });
  it('exige resposta explícita, permitindo null para pular', async () => {
    for (const answer of [undefined, '5', 1.5, Infinity, 100001]) {
      expect((await validate(Object.assign(new AnswerMathDto(), { version: 0, answer }))).length).toBeGreaterThan(0);
    }
    expect(await validate(Object.assign(new AnswerMathDto(), { version: 0, answer: null }))).toHaveLength(0);
  });
});

function setup() {
  const row = { id: 'session', userId: 'owner', mode: 'free', dailyKey: null, version: 0, completed: false, createdAt: new Date(), state: initial() };
  const db = { mentalMathSession: { findFirst: vi.fn().mockResolvedValue(row), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue(row), create: vi.fn().mockResolvedValue(row) } };
  return { row, db, service: new MentalMathService(db as unknown as PrismaService) };
}
describe('Persistência do treino', () => {
  it('oculta gabarito atual e restringe acesso ao dono', async () => {
    const { service, db } = setup();
    const view = await service.get('owner', 'session');
    expect(view.question).not.toHaveProperty('answer');
    expect(db.mentalMathSession.findFirst).toHaveBeenCalledWith({ where: { id: 'session', userId: 'owner' } });
    db.mentalMathSession.findFirst.mockResolvedValue(null);
    await expect(service.answer('other', 'session', 0, 5)).rejects.toThrow('Treino não encontrado');
    expect(db.mentalMathSession.updateMany).not.toHaveBeenCalled();
  });
  it('repetição de requisição não duplica tentativa', async () => {
    const { service, row, db } = setup();
    row.version = 1;
    await service.answer('owner', 'session', 0, 5);
    expect(db.mentalMathSession.updateMany).not.toHaveBeenCalled();
  });
  it('grava usando versão para impedir duas respostas simultâneas', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    const { service, db } = setup();
    const result = await service.answer('owner', 'session', 0, 5);
    expect(result.summary.correct).toBe(1);
    expect(db.mentalMathSession.updateMany.mock.calls[0][0].where).toEqual({ id: 'session', userId: 'owner', version: 0 });
    expect(result.question).not.toHaveProperty('answer');
  });
  it('encerra na décima resposta e impede novas gravações', async () => {
    const { service, row, db } = setup();
    row.state.attempts = Array.from({ length: 9 }, () => recordAnswer(initial(), 5, 2000).attempts[0]);
    row.version = 9;
    const result = await service.answer('owner', 'session', 9, null);
    expect(result.completed).toBe(true);
    expect(result.question).toBeNull();
    row.completed = true;
    db.mentalMathSession.updateMany.mockClear();
    await service.answer('owner', 'session', 9, 5);
    expect(db.mentalMathSession.updateMany).not.toHaveBeenCalled();
  });
  it('retoma desafio diário sem substituir estado e usa data de Brasília', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    const { service, db } = setup();
    await service.start('owner', 'daily');
    const query = db.mentalMathSession.upsert.mock.calls[0][0];
    expect(query.update).toEqual({});
    expect(query.where.userId_dailyKey.userId).toBe('owner');
    expect(query.where.userId_dailyKey.dailyKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('limita histórico a trinta rodadas concluídas do usuário', async () => {
    const { service, db } = setup();
    expect((await service.history('owner')).sessions).toEqual([]);
    expect(db.mentalMathSession.findMany).toHaveBeenCalledWith({ where: { userId: 'owner', completed: true }, orderBy: { createdAt: 'desc' }, take: 30 });
  });
});
