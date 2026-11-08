import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewQueueService } from './review-queue.service';

/**
 * A fila unificada é uma leitura, mas a decisão do que entra nela é regra de
 * produto: tópico vencido + erro vencido formam "hoje"; a fila manual é outra
 * dívida e não pode inflar o contador do dia. O Prisma é dublê.
 */
describe('ReviewQueueService', () => {
  let service: ReviewQueueService;
  let prisma: any;

  const now = new Date('2026-11-06T12:00:00.000Z');
  const future = new Date('2026-11-10T00:00:00.000Z');

  const question = {
    id: 'question-1',
    subject: 'Matemática',
    topic: 'Funções',
    difficulty: 'MEDIA',
    exam: 'ENEM',
    year: 2023,
    stem: 'Considere a função f(x) = 2^x.',
  };

  const topicRow = {
    id: 'mastery-1',
    subjectId: 'subject-1',
    topicId: 'topic-1',
    masteryScore: 62,
    attempts: 5,
    correctAttempts: 3,
    status: 'PRATICANDO',
    nextReviewAt: new Date('2026-11-04T00:00:00.000Z'),
    subject: { name: 'Matemática' },
    topic: { name: 'Funções' },
  };

  const errorRow = {
    questionId: 'question-1',
    wrongAttempts: 2,
    correctStreak: 0,
    reviewScheduledAt: new Date('2026-11-05T00:00:00.000Z'),
    question,
  };

  const markedRow = (questionId: string, attempts = 2) => ({
    questionId,
    attempts,
    correctAttempts: attempts > 0 ? 1 : 0,
    lastAttemptAt: new Date('2026-11-03T12:00:00.000Z'),
    question: { ...question, id: questionId },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma = {
      topicMastery: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      errorNotebookEntry: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userQuestionProgress: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    service = new ReviewQueueService(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('junta tópico e erro vencidos, ordenados pela data, e mantém a fila manual separada', async () => {
    prisma.topicMastery.findMany.mockResolvedValue([topicRow]);
    prisma.topicMastery.count.mockResolvedValue(1);
    prisma.topicMastery.findFirst.mockResolvedValue({ nextReviewAt: future });
    prisma.errorNotebookEntry.findMany.mockResolvedValue([errorRow]);
    prisma.errorNotebookEntry.count.mockResolvedValue(1);
    prisma.userQuestionProgress.findMany.mockResolvedValue([markedRow('marked-1')]);
    prisma.userQuestionProgress.count.mockResolvedValue(1);

    const result = await service.getQueue('user-1');

    expect(result.due.total).toBe(2);
    expect(result.due.topics).toBe(1);
    expect(result.due.errorNotebook).toBe(1);
    expect(result.due.items.map((item) => item.kind)).toEqual([
      'TOPIC',
      'ERROR_NOTEBOOK',
    ]);
    expect(result.due.items[0].dueAt).toBe('2026-11-04T00:00:00.000Z');
    expect(result.manual.items.map((item) => item.id)).toEqual(['marked-1']);
    expect(result.manual.items[0].accuracy).toBe(50);
  });

  it('não repete na fila manual uma questão que já está aberta no caderno', async () => {
    prisma.topicMastery.findFirst.mockResolvedValue({ nextReviewAt: future });
    prisma.errorNotebookEntry.findFirst.mockResolvedValue({
      reviewScheduledAt: new Date('2026-11-07T00:00:00.000Z'),
    });
    prisma.userQuestionProgress.findMany.mockResolvedValue([markedRow('marked-2')]);
    prisma.userQuestionProgress.count.mockResolvedValue(1);

    const result = await service.getQueue('user-1');

    // A exclusão é feita pela relação no banco, sem carregar todos os erros
    // abertos do aluno a cada leitura da fila.
    expect(prisma.userQuestionProgress.findMany.mock.calls[0][0].where).toMatchObject({
      markedForReview: true,
      question: {
        errorNotebook: {
          none: { userId: 'user-1', status: 'ABERTA' },
        },
      },
    });
    expect(result.manual.items.map((item) => item.id)).toEqual(['marked-2']);
    expect(result.manual.total).toBe(1);
    expect(result.manual.truncated).toBe(false);
    expect(result.nextReviewAt).toBe('2026-11-07T00:00:00.000Z');
  });

  it('inclui entrada aberta sem data em vez de escondê-la da central', async () => {
    prisma.errorNotebookEntry.findMany.mockResolvedValue([
      { ...errorRow, reviewScheduledAt: null },
    ]);
    prisma.errorNotebookEntry.count.mockResolvedValue(1);

    const result = await service.getQueue('user-1');

    expect(prisma.errorNotebookEntry.findMany.mock.calls[0][0].where.OR).toEqual([
      { reviewScheduledAt: null },
      { reviewScheduledAt: { not: null, lte: expect.any(Date) } },
    ]);
    expect(result.due.total).toBe(1);
    expect(result.due.items[0]).toMatchObject({
      kind: 'ERROR_NOTEBOOK',
      dueAt: null,
    });
  });

  it('trunca o enunciado que vai para a fila', async () => {
    prisma.errorNotebookEntry.findMany.mockResolvedValue([
      { ...errorRow, question: { ...question, stem: 'x'.repeat(400) } },
    ]);
    prisma.errorNotebookEntry.count.mockResolvedValue(1);

    const result = await service.getQueue('user-1');

    expect(result.due.items[0].stem).toHaveLength(221);
    expect(result.due.items[0].stem?.endsWith('…')).toBe(true);
  });

  it('conta o total real da fila manual mesmo quando a lista vem truncada', async () => {
    prisma.userQuestionProgress.findMany.mockResolvedValue([markedRow('marked-1')]);
    prisma.userQuestionProgress.count.mockResolvedValue(5);

    const result = await service.getQueue('user-1', { limit: 1 });

    expect(result.manual.items).toHaveLength(1);
    expect(result.manual.total).toBe(5);
    expect(result.manual.truncated).toBe(true);
  });

  it('ignora limite inválido em vez de deixar o Prisma receber NaN', async () => {
    await service.getQueue('user-1', { limit: Number.NaN });

    expect(prisma.topicMastery.findMany.mock.calls[0][0].take).toBe(20);
    expect(prisma.errorNotebookEntry.findMany.mock.calls[0][0].take).toBe(20);
  });

  it('corta a lista no limite e informa que há mais itens vencidos', async () => {
    prisma.topicMastery.findMany.mockResolvedValue([topicRow]);
    prisma.topicMastery.count.mockResolvedValue(3);
    prisma.errorNotebookEntry.findMany.mockResolvedValue([errorRow]);
    prisma.errorNotebookEntry.count.mockResolvedValue(2);

    const result = await service.getQueue('user-1', { limit: 1 });

    expect(result.due.items).toHaveLength(1);
    expect(result.due.truncated).toBe(true);
  });
});
