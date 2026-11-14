import { reviewDay } from './review-day';
import { describe, expect, it, vi } from 'vitest';
import { TopicMasteryService, masteryHistoryDay } from './topic-mastery.service';

const userId = 'user-1';
const subjectId = 'subject-1';
const topicId = 'topic-1';

function setup(initial: any = null) {
  const store = new Map<string, any>();
  if (initial) store.set(`${initial.userId}:${initial.topicId}`, initial);

  const prisma: any = {
    topicMastery: {
      findUnique: vi.fn(async ({ where }: any) => {
        const { userId: u, topicId: t } = where.userId_topicId;
        return store.get(`${u}:${t}`) ?? null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const { userId: u, topicId: t } = where.userId_topicId;
        const key = `${u}:${t}`;
        const existing = store.get(key);
        const row = existing ? { ...existing, ...update } : { id: 'row-1', ...create };
        store.set(key, row);
        return row;
      }),
      findMany: vi.fn(async () => [...store.values()]),
    },
    topicMasteryHistory: { upsert: vi.fn() },
  };
  const service = new TopicMasteryService(prisma as never);
  return { service, prisma, store };
}

describe('TopicMasteryService.registerAttempt', () => {
  it('não faz nada quando a questão não tem classificação estruturada', async () => {
    const { service, prisma } = setup();
    await service.registerAttempt(userId, null, null, true);
    expect(prisma.topicMastery.findUnique).not.toHaveBeenCalled();
    expect(prisma.topicMastery.upsert).not.toHaveBeenCalled();
  });

  it('primeira tentativa correta cria o registro com streak 1', async () => {
    const { service, store } = setup();
    await service.registerAttempt(userId, subjectId, topicId, true);
    const row = store.get(`${userId}:${topicId}`);
    expect(row).toMatchObject({
      attempts: 1,
      correctAttempts: 1,
      correctStreak: 1,
      masteryScore: 80,
      status: 'PRATICANDO',
      reviewIntervalDays: 3,
    });
    expect(row.nextReviewAt).toBeInstanceOf(Date);
    expect(row.lastStudiedAt).toBeInstanceOf(Date);
  });

  it('duas tentativas corretas seguidas dominam o tópico e dobram o intervalo de revisão', async () => {
    const { service, store } = setup();
    await service.registerAttempt(userId, subjectId, topicId, true);
    await service.registerAttempt(userId, subjectId, topicId, true);
    const row = store.get(`${userId}:${topicId}`);
    expect(row).toMatchObject({
      attempts: 2,
      correctAttempts: 2,
      correctStreak: 2,
      masteryScore: 90,
      status: 'DOMINADO',
      reviewIntervalDays: 6,
    });
  });

  it('errar depois de dominado volta para PRECISA_REFORCO e reseta a revisão espaçada', async () => {
    const { service, store } = setup();
    await service.registerAttempt(userId, subjectId, topicId, true);
    await service.registerAttempt(userId, subjectId, topicId, true);
    await service.registerAttempt(userId, subjectId, topicId, false);
    const row = store.get(`${userId}:${topicId}`);
    expect(row).toMatchObject({
      attempts: 3,
      correctAttempts: 2,
      correctStreak: 0,
      status: 'PRECISA_REFORCO',
      reviewIntervalDays: 1,
    });
  });

  it('tópico nunca estudado que erra fica em APRENDENDO (score baixo)', async () => {
    const { service, store } = setup();
    await service.registerAttempt(userId, subjectId, topicId, false);
    const row = store.get(`${userId}:${topicId}`);
    expect(row).toMatchObject({ attempts: 1, correctAttempts: 0, correctStreak: 0, masteryScore: 0, status: 'APRENDENDO' });
  });

  it('intervalo de revisão nunca passa do teto de 30 dias', async () => {
    const { service, store } = setup();
    for (let i = 0; i < 8; i++) {
      await service.registerAttempt(userId, subjectId, topicId, true);
    }
    const row = store.get(`${userId}:${topicId}`);
    expect(row.reviewIntervalDays).toBeLessThanOrEqual(30);
  });
});

describe('TopicMasteryService.listForUser', () => {
  it('marca due=true quando a próxima revisão já passou', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const { service } = setup({
      id: 'row-1', userId, subjectId, topicId,
      subject: { name: 'Matemática' }, topic: { name: 'Funções' },
      masteryScore: 60, attempts: 3, correctAttempts: 2, correctStreak: 1,
      status: 'PRATICANDO', lastStudiedAt: past, nextReviewAt: past, reviewIntervalDays: 3,
    });
    const rows = await service.listForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subject: 'Matemática', topic: 'Funções', due: true });
  });
});

describe('TopicMasteryService.registerStudy', () => {
  function setupWithTopic(initial: any = null) {
    const ctx = setup(initial);
    ctx.prisma.topic = { findUnique: vi.fn(async () => ({ id: topicId, subjectId })) };
    return ctx;
  }

  it('primeiro estudo tira o tópico de NAO_ESTUDADO sem inventar acerto', async () => {
    const { service, store } = setupWithTopic();
    await service.registerStudy(userId, topicId);
    const row = store.get(`${userId}:${topicId}`);
    expect(row).toMatchObject({ subjectId, status: 'APRENDENDO', reviewIntervalDays: 3 });
    expect(row.attempts).toBeUndefined();
    expect(row.lastStudiedAt).toBeInstanceOf(Date);
    expect(row.nextReviewAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('revisão vencida é empurrada pelo intervalo atual; score e status ficam como estavam', async () => {
    const { service, store } = setupWithTopic({
      userId, topicId, subjectId, masteryScore: 90, status: 'DOMINADO', reviewIntervalDays: 6,
      nextReviewAt: new Date('2020-01-01'),
    });
    await service.registerStudy(userId, topicId);
    const row = store.get(`${userId}:${topicId}`);
    expect(row).toMatchObject({ masteryScore: 90, status: 'DOMINADO', reviewIntervalDays: 6 });
    // Dia de Brasília + 6, à meia-noite UTC (a distância em horas varia com a hora do teste).
    expect(row.nextReviewAt).toEqual(reviewDay(new Date(), 6));
  });

  it('revisão ainda não vencida não é adiada', async () => {
    const future = new Date(Date.now() + 10 * 86_400_000);
    const { service, store } = setupWithTopic({
      userId, topicId, subjectId, masteryScore: 50, status: 'PRATICANDO', reviewIntervalDays: 3, nextReviewAt: future,
    });
    await service.registerStudy(userId, topicId);
    expect(store.get(`${userId}:${topicId}`).nextReviewAt).toBe(future);
  });
});

describe('histórico do domínio', () => {
  it('o dia do histórico é a data em Brasília', () => {
    // 01:30 UTC do dia 13 ainda é dia 12 em Brasília (22:30).
    expect(masteryHistoryDay(new Date('2026-10-13T01:30:00Z'))).toEqual(new Date('2026-10-12T00:00:00Z'));
    expect(masteryHistoryDay(new Date('2026-10-13T03:00:00Z'))).toEqual(new Date('2026-10-13T00:00:00Z'));
  });

  it('cada resposta grava o domínio do dia; no mesmo dia, a linha é atualizada', async () => {
    const { service, prisma } = setup();
    await service.registerAttempt(userId, subjectId, topicId, true);
    await service.registerAttempt(userId, subjectId, topicId, false);

    expect(prisma.topicMasteryHistory.upsert).toHaveBeenCalledTimes(2);
    const [first, second] = prisma.topicMasteryHistory.upsert.mock.calls.map((call: any[]) => call[0]);
    expect(first.where.userId_topicId_day).toMatchObject({ userId, topicId, day: masteryHistoryDay(new Date()) });
    expect(first.create).toMatchObject({ attempts: 1, correctAttempts: 1 });
    // A segunda resposta do dia cai na mesma chave e leva o valor mais recente.
    expect(second.where).toEqual(first.where);
    expect(second.update).toMatchObject({ attempts: 2, correctAttempts: 1 });
    expect(second.update.masteryScore).toBeLessThan(first.create.masteryScore);
  });

  it('questão sem tópico não grava histórico', async () => {
    const { service, prisma } = setup();
    await service.registerAttempt(userId, subjectId, null, true);
    expect(prisma.topicMasteryHistory.upsert).not.toHaveBeenCalled();
  });
});

describe('várias tentativas de uma vez (simulado)', () => {
  it('dá o mesmo domínio que registrar uma a uma, com uma leitura e uma gravação', async () => {
    const results = [true, true, false, true, true, true, false, true];
    const oneByOne = setup();
    for (const isCorrect of results) await oneByOne.service.registerAttempt(userId, subjectId, topicId, isCorrect);
    const batch = setup();
    await batch.service.registerAttempts(userId, subjectId, topicId, results);

    const pick = ({ attempts, correctAttempts, correctStreak, masteryScore, status, reviewIntervalDays }: any) =>
      ({ attempts, correctAttempts, correctStreak, masteryScore, status, reviewIntervalDays });
    const key = `${userId}:${topicId}`;
    expect(pick(batch.store.get(key))).toEqual(pick(oneByOne.store.get(key)));
    expect(batch.prisma.topicMastery.findUnique).toHaveBeenCalledTimes(1);
    expect(batch.prisma.topicMastery.upsert).toHaveBeenCalledTimes(1);
    expect(batch.prisma.topicMasteryHistory.upsert).toHaveBeenCalledTimes(1);
  });

  it('lista vazia não grava nada', async () => {
    const { service, prisma } = setup();
    await service.registerAttempts(userId, subjectId, topicId, []);
    expect(prisma.topicMastery.upsert).not.toHaveBeenCalled();
  });
});
