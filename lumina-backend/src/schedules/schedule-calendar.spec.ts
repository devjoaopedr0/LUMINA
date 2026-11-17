import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withReadCache } from './calendar-cache';
import { SchedulesRepository } from './schedules.repository';
import { SchedulesService } from './schedules.service';

describe('calendário do cronograma', () => {
  let service: SchedulesService;
  let repo: any;
  let generator: { buildTasksForSession: ReturnType<typeof vi.fn> };

  const schedule = {
    id: 'schedule', userId: 'user', priorityAreas: [], excludedTopicIds: ['tirado-pelo-aluno'], essayFrequency: null,
    startDate: new Date('2026-11-01'), endDate: new Date('2027-06-30'),
    studyDays: [1, 2, 3, 4, 5], dailyMinutes: 120, dayMinutes: [],
    scheduleSubjects: [{ subjectId: 'math', targetHours: 40, subject: { name: 'Matemática', code: 'MATH' } }],
  };
  const session = (date: string, tasks: unknown[] = []) => ({ id: `s-${date}`, date: new Date(`${date}T00:00:00Z`), scheduledMinutes: 120, tasks });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T15:00:00Z'));
    const db: any = {
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
      studySession: { findMany: vi.fn().mockResolvedValue([]) },
    };
    repo = {
      prisma: db,
      findScheduleByUserId: vi.fn().mockResolvedValue(schedule),
      findUserVestibular: vi.fn().mockResolvedValue({ targetDate: new Date('2027-11-07') }),
      findMeasuredTasks: vi.fn().mockResolvedValue([]),
      findSessionsWithTasks: vi.fn().mockResolvedValue([
        // Dia passado e dia de hoje com tarefas reais.
        session('2026-11-17', [{ id: 't1', topicId: 'fracoes', subjectId: 'math', subject: { name: 'Matemática' }, title: 'Matemática: Teoria — Frações', activityType: 'TEORIA', scheduledMinutes: 40, status: 'DONE' }]),
        session('2026-11-18', [{ id: 't2', topicId: 'conjuntos', subjectId: 'math', subject: { name: 'Matemática' }, title: 'Matemática: Questões — Conjuntos', activityType: 'QUESTOES', scheduledMinutes: 40, status: 'PENDING' }]),
        // Dias futuros ainda sem tarefas: previsão.
        session('2026-11-19'),
        session('2026-11-20'),
      ]),
    };
    let n = 0;
    generator = {
      buildTasksForSession: vi.fn(async () => {
        n += 1;
        return [{ subjectId: 'math', topicId: `topico-${n}`, title: `Matemática: Teoria — Tópico ${n}`, activityType: 'TEORIA', scheduledMinutes: 40 }];
      }),
    };
    service = new SchedulesService(repo as SchedulesRepository, generator as never, {} as never);
  });
  afterEach(() => vi.useRealTimers());

  it('dias com tarefas mostram as reais; dias futuros vazios vêm como previsão', async () => {
    const cal = await service.getCalendar('user', new Date('2026-11-16'), new Date('2026-11-22'));
    expect(cal!.days.map((d) => [d.date, d.projected])).toEqual([
      ['2026-11-17', false],
      ['2026-11-18', false],
      ['2026-11-19', true],
      ['2026-11-20', true],
    ]);
    expect(cal!.days[0].tasks[0]).toMatchObject({ subject: 'Matemática', title: 'Matemática: Teoria — Frações', status: 'DONE' });
    expect(cal!.days[2].tasks[0]).toMatchObject({ id: null, subject: 'Matemática', title: 'Matemática: Teoria — Tópico 1', status: 'PENDING' });
    expect(cal!.examDate).toBe('2027-11-07');
  });

  it('a previsão não repete assunto: exclui os já agendados, os previstos antes e os tirados pelo aluno', async () => {
    await service.getCalendar('user', new Date('2026-11-16'), new Date('2026-11-22'));
    const excludes = generator.buildTasksForSession.mock.calls.map((c: any[]) => c[0].excludeTopicIds);
    expect(excludes[0]).toEqual(expect.arrayContaining(['tirado-pelo-aluno', 'fracoes', 'conjuntos']));
    expect(excludes[1]).toEqual(expect.arrayContaining(['topico-1']));
  });

  it('nada é gravado ao montar a previsão', async () => {
    repo.createTasks = vi.fn();
    await service.getCalendar('user', new Date('2026-11-16'), new Date('2026-11-22'));
    expect(repo.createTasks).not.toHaveBeenCalled();
  });

  it('no máximo 42 dias por consulta e fim depois do início', async () => {
    await expect(service.getCalendar('user', new Date('2026-11-01'), new Date('2026-12-31'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getCalendar('user', new Date('2026-11-20'), new Date('2026-11-10'))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('cache de leitura da previsão', () => {
  it('memoriza tópicos e matérias pelos argumentos; tarefas passam direto', async () => {
    const db = {
      topic: { findMany: vi.fn().mockResolvedValue([{ id: 't' }]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const cached = withReadCache(db);
    await cached.topic.findMany({ where: { subjectId: 'a' } });
    await cached.topic.findMany({ where: { subjectId: 'a' } });
    await cached.topic.findMany({ where: { subjectId: 'b' } });
    await cached.studyTask.findMany({ where: {} });
    await cached.studyTask.findMany({ where: {} });
    expect(db.topic.findMany).toHaveBeenCalledTimes(2);
    expect(db.studyTask.findMany).toHaveBeenCalledTimes(2);
  });
});
