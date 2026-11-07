import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotebookRepository } from './error-notebook.repository';

/**
 * O repositório é quem conversa com o banco; aqui o Prisma é um dublê. O que
 * se prova é que o agendamento automático não fica só na função pura: ele
 * realmente entra no create/update da tentativa.
 */
describe('ErrorNotebookRepository — agendamento automático', () => {
  let repository: ErrorNotebookRepository;
  let db: any;

  const entry = (overrides: Record<string, unknown> = {}) => ({
    id: 'entry-1',
    userId: 'user-1',
    questionId: 'question-1',
    reason: null,
    notes: null,
    status: 'ABERTA',
    wrongAttempts: 1,
    correctStreak: 0,
    evolution: '',
    reviewScheduledAt: null,
    firstWrongAt: new Date('2026-11-06T12:00:00.000Z'),
    lastWrongAt: new Date('2026-11-06T12:00:00.000Z'),
    resolvedAt: null,
    createdAt: new Date('2026-11-06T12:00:00.000Z'),
    updatedAt: new Date('2026-11-06T12:00:00.000Z'),
    question: {
      id: 'question-1',
      subject: 'Matemática',
      topic: 'Funções',
      difficulty: 'MEDIA',
      exam: 'ENEM',
      year: 2023,
      examNumber: 1,
      stem: 'Questão',
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T18:42:13.000Z'));
    db = {
      errorNotebookEntry: {
        upsert: vi.fn().mockResolvedValue(entry()),
        findUnique: vi.fn().mockResolvedValue(entry()),
        update: vi.fn().mockResolvedValue(entry({ evolution: 'E' })),
      },
    };
    repository = new ErrorNotebookRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('grava a revisão de amanhã ao errar', async () => {
    await repository.registerWrongAttempt('user-1', 'question-1');

    const data = db.errorNotebookEntry.upsert.mock.calls[0][0];
    expect(data.create.reviewScheduledAt.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(data.update.reviewScheduledAt.toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });

  it('recalcula a revisão para três dias no primeiro acerto', async () => {
    db.errorNotebookEntry.findUnique.mockResolvedValue(entry({ correctStreak: 0 }));

    await repository.registerCorrectAttempt('user-1', 'question-1');

    const data = db.errorNotebookEntry.update.mock.calls[0][0].data;
    expect(data.correctStreak).toBe(1);
    expect(data.reviewScheduledAt.toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(data.status).toBeUndefined();
  });

  it('remove a revisão quando a questão é dominada', async () => {
    db.errorNotebookEntry.findUnique.mockResolvedValue(entry({ correctStreak: 1 }));

    await repository.registerCorrectAttempt('user-1', 'question-1');

    const data = db.errorNotebookEntry.update.mock.calls[0][0].data;
    expect(data.correctStreak).toBe(2);
    expect(data.reviewScheduledAt).toBeNull();
    expect(data.status).toBe('DOMINADA');
  });
});
