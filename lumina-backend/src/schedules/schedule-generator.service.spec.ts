import { TopicMasteryStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleGeneratorService } from './schedule-generator.service';

const userId = 'user-1';
const session = { id: 'session-1', scheduleId: 'schedule-1', date: new Date('2026-09-30'), scheduledMinutes: 60 };

function mathStudySubject(overrides: Partial<{ subjectId: string; targetHours: number }> = {}) {
  return {
    subjectId: 'study-subject-math',
    targetHours: 10,
    subject: { name: 'Matemática', code: 'MATH' },
    ...overrides,
  };
}

describe('ScheduleGeneratorService.buildTasksForSession', () => {
  it('sem matérias no cronograma não gera nada', async () => {
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [], {} as never);
    expect(tasks).toEqual([]);
  });

  it('sessão sem minutos não gera nada', async () => {
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession({ ...session, scheduledMinutes: 0 }, userId, [mathStudySubject()], {} as never);
    expect(tasks).toEqual([]);
  });

  it('matéria sem catálogo de tópicos (ex.: Inglês) recebe uma tarefa genérica proporcional', async () => {
    const db: any = { subject: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new ScheduleGeneratorService({} as never);
    const englishSubject = { subjectId: 'study-subject-english', targetHours: 10, subject: { name: 'Inglês', code: 'ENGLISH' } };
    const tasks = await service.buildTasksForSession(session, userId, [englishSubject], db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      subjectId: 'study-subject-english',
      topicId: null,
      activityType: 'QUESTOES',
      title: 'Inglês: estudo programado',
      scheduledMinutes: 60,
    });
  });

  it('tópico nunca estudado vira tarefa de Teoria', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([{ id: 'topic-funcoes', subjectId: 'qb-math', name: 'Funções' }]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      subjectId: 'study-subject-math',
      topicId: 'topic-funcoes',
      activityType: 'TEORIA',
      title: 'Teoria — Funções',
      scheduledMinutes: 40,
    });
  });

  it('tópico dominado sem revisão vencida não entra na fila', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([{ id: 'topic-funcoes', subjectId: 'qb-math', name: 'Funções' }]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([
        { topicId: 'topic-funcoes', masteryScore: 90, status: TopicMasteryStatus.DOMINADO, lastStudiedAt: new Date('2026-09-29'), nextReviewAt: new Date('2026-10-05') },
      ]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks).toEqual([]);
  });

  it('revisão vencida entra antes da fila normal e consome o orçamento primeiro', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([
        { id: 'topic-funcoes', subjectId: 'qb-math', name: 'Funções' },
        { id: 'topic-geometria', subjectId: 'qb-math', name: 'Geometria' },
      ]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([
        { topicId: 'topic-funcoes', masteryScore: 90, status: TopicMasteryStatus.DOMINADO, lastStudiedAt: new Date('2026-09-20'), nextReviewAt: new Date('2026-09-29') },
      ]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks[0]).toMatchObject({ topicId: 'topic-funcoes', activityType: 'REVISAO', scheduledMinutes: 20 });
    expect(tasks[1]).toMatchObject({ topicId: 'topic-geometria', activityType: 'TEORIA' });
  });

  it('tópico com mais questões no banco (maior incidência) vem antes na fila', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([
        { id: 'topic-raro', subjectId: 'qb-math', name: 'Assunto raro' },
        { id: 'topic-comum', subjectId: 'qb-math', name: 'Assunto muito cobrado' },
      ]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([
        { subjectId: 'qb-math', topicId: 'topic-comum' },
        { subjectId: 'qb-math', topicId: 'topic-comum' },
        { subjectId: 'qb-math', topicId: 'topic-comum' },
      ]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks[0].topicId).toBe('topic-comum');
    expect(tasks[1].topicId).toBe('topic-raro');
  });

  it('não estoura o orçamento de minutos da sessão', async () => {
    const topics = Array.from({ length: 10 }, (_, i) => ({ id: `topic-${i}`, subjectId: 'qb-math', name: `Tópico ${i}` }));
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue(topics) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    const total = tasks.reduce((sum, t) => sum + (t.scheduledMinutes as number), 0);
    expect(total).toBeLessThanOrEqual(session.scheduledMinutes);
  });
});
