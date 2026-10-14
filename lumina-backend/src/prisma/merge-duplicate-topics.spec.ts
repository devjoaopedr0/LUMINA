import { describe, expect, it, vi } from 'vitest';
import { STUDY_SUBJECT_TOPICS } from '../../prisma/seed-data/study-subject-topics';
import { TOPIC_MERGES } from '../../prisma/seed-data/topic-merges';
import { mergeDuplicateTopics } from './merge-duplicate-topics';

function setup(options: { fromExists?: boolean; masteries?: any[]; existingTarget?: any } = {}) {
  const tx: any = {
    topic: {
      upsert: vi.fn().mockResolvedValue({ id: 'into', name: 'Ecologia' }),
      delete: vi.fn(),
    },
    question: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    studyTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    topicMastery: {
      findMany: vi.fn().mockResolvedValue(options.masteries ?? []),
      findUnique: vi.fn().mockResolvedValue(options.existingTarget ?? null),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const prisma: any = {
    subject: { findUnique: vi.fn().mockResolvedValue({ id: 'bio' }) },
    topic: { findUnique: vi.fn().mockResolvedValue(options.fromExists === false ? null : { id: 'from' }) },
    $transaction: vi.fn((callback: (client: unknown) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

const merge = [{ subject: 'Biologia', from: 'Ecologia (muito cobrada)', into: 'Ecologia' }];

describe('mergeDuplicateTopics', () => {
  it('passa questões e tarefas para o tópico de destino e apaga o duplicado', async () => {
    const { prisma, tx } = setup();
    const report = await mergeDuplicateTopics(prisma, merge);
    expect(tx.question.updateMany).toHaveBeenCalledWith({ where: { topicId: 'from' }, data: { topicId: 'into', topic: 'Ecologia' } });
    expect(tx.studyTask.updateMany).toHaveBeenCalledWith({ where: { topicId: 'from' }, data: { topicId: 'into' } });
    expect(tx.topic.delete).toHaveBeenCalledWith({ where: { id: 'from' } });
    expect(report).toEqual({ merged: 1, questionsMoved: 3, masteriesMoved: 0, tasksMoved: 1 });
  });

  it('domínio só no tópico antigo é movido; nos dois, as tentativas são somadas', async () => {
    const moved = setup({ masteries: [{ id: 'm1', userId: 'u1', attempts: 2, correctAttempts: 1 }] });
    await mergeDuplicateTopics(moved.prisma, merge);
    expect(moved.tx.topicMastery.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { topicId: 'into' } });

    const summed = setup({
      masteries: [{ id: 'm1', userId: 'u1', attempts: 2, correctAttempts: 1 }],
      existingTarget: { id: 'm2', attempts: 5, correctAttempts: 4 },
    });
    await mergeDuplicateTopics(summed.prisma, merge);
    expect(summed.tx.topicMastery.update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { attempts: 7, correctAttempts: 5 } });
    expect(summed.tx.topicMastery.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  it('é idempotente: par já fundido não faz nada', async () => {
    const { prisma } = setup({ fromExists: false });
    expect(await mergeDuplicateTopics(prisma, merge)).toEqual({ merged: 0, questionsMoved: 0, masteriesMoved: 0, tasksMoved: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('o currículo não recria nenhum tópico que a fusão apaga', () => {
    const curriculum = new Set(STUDY_SUBJECT_TOPICS.flatMap((s) => s.groups.flatMap((g) => g.topics)));
    expect(TOPIC_MERGES.filter((m) => curriculum.has(m.from))).toEqual([]);
  });
});
