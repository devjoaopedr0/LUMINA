import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateStudyScheduleDto, SubjectTimeLogDto, UpdateStudyTaskDto } from './dto/create-study-schedule.dto';
import { SchedulesService } from './schedules.service';
import { SchedulesRepository } from './schedules.repository';

describe('Cronograma: regressões funcionais', () => {
  let service: SchedulesService;
  let repo: any;
  let db: any;

  beforeEach(() => {
    db = {
      studyTask: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      studySession: { findMany: vi.fn().mockResolvedValue([]) },
      studyTimeLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    };
    db.$transaction = vi.fn((callback: (tx: unknown) => unknown) => callback(db));
    repo = {
      prisma: db,
      findScheduleByUserId: vi.fn().mockResolvedValue({ id: 'schedule' }),
      findTaskById: vi.fn(),
      findSessionById: vi.fn(),
      findSessionByDate: vi.fn(),
      findScheduleSubjectById: vi.fn(),
      createTask: vi.fn(),
      createTimeLog: vi.fn(),
      deleteTask: vi.fn(),
      updateTask: vi.fn(),
      upsertProgress: vi.fn((_tx, _id, data) => data),
    };
    // O serviço deixa de filtrar logs direto no Prisma e passa a delegar ao
    // repositório, que também considera os registros ligados só à matéria.
    repo.timeLogsForSchedule = vi.fn((_id, _period, _client) => db.studyTimeLog.findMany());
    service = new SchedulesService(repo as SchedulesRepository);
  });

  afterEach(() => vi.useRealTimers());

  it('não informa tarefas reagendadas quando não há sessões futuras', async () => {
    db.studyTask.findMany.mockResolvedValue([{ id: 'task' }]);
    expect(await service.rescheduleMissed('user', new Date('2026-09-13')))
      .toEqual({ rescheduled: 0 });
    expect(db.studyTask.update).not.toHaveBeenCalled();
  });

  it('distribui tarefas entre sessões futuras', async () => {
    db.studyTask.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    db.studySession.findMany.mockResolvedValue([{ id: 'next' }, { id: 'last' }]);
    expect(await service.rescheduleMissed('user', new Date('2026-09-13')))
      .toEqual({ rescheduled: 3 });
    expect(db.studyTask.update.mock.calls.map(([arg]: any[]) => arg.data.sessionId))
      .toEqual(['next', 'last', 'next']);
  });

  it('conta dias consecutivos do mais recente para o mais antigo em UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T23:00:00Z'));
    db.studyTask.findMany.mockResolvedValue([11, 12, 13].map(day => ({
      status: 'DONE', completedAt: new Date(`2026-09-${day}T12:00:00Z`),
    })));
    expect(await service.recalculateProgress('user')).toMatchObject({ streakDays: 3 });
  });

  it('interrompe a sequência em um dia sem conclusão', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T23:00:00Z'));
    db.studyTask.findMany.mockResolvedValue([11, 13].map(day => ({
      status: 'DONE', completedAt: new Date(`2026-09-${day}T12:00:00Z`),
    })));
    expect(await service.recalculateProgress('user')).toMatchObject({ streakDays: 1 });
  });

  it('consultar progresso atualiza a sequência após a mudança de dia', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    db.studyTask.findMany.mockResolvedValue([{ status: 'DONE', completedAt: new Date('2026-09-13T12:00:00Z') }]);
    expect(await service.getProgress('user')).toMatchObject({ streakDays: 0 });
  });

  it('reabrir tarefa limpa a conclusão e recalcula o progresso', async () => {
    repo.findTaskById.mockResolvedValue({ status: 'DONE', scheduleId: 'schedule', schedule: { userId: 'user' } });
    await service.updateTask('user', 'task', { status: 'PENDING' });
    expect(repo.updateTask).toHaveBeenCalledWith('task', { status: 'PENDING', completedAt: null }, db);
    expect(repo.upsertProgress).toHaveBeenCalled();
  });

  it('concluir novamente preserva a data original', async () => {
    const completedAt = new Date('2026-09-10T12:00:00Z');
    repo.findTaskById.mockResolvedValue({ status: 'DONE', completedAt, scheduleId: 'schedule', schedule: { userId: 'user' } });
    await service.completeTask('user', 'task');
    expect(repo.updateTask).toHaveBeenCalledWith('task', { status: 'DONE', completedAt }, db);
  });

  it('criar e excluir tarefas atualiza os totais dentro da transação', async () => {
    repo.findSessionById.mockResolvedValue({ scheduleId: 'schedule', schedule: { userId: 'user' } });
    repo.createTask.mockResolvedValue({ id: 'task' });
    repo.findTaskById.mockResolvedValue({ id: 'task', subject: { name: 'Matemática' } });
    await service.createTask('user', { sessionId: 'session', title: 'Revisão', scheduledMinutes: 20 });
    expect(repo.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revisão' }), db);
    expect(repo.upsertProgress).toHaveBeenCalledTimes(1);
    repo.findTaskById.mockResolvedValue({ scheduleId: 'schedule', schedule: { userId: 'user' } });
    await service.deleteTask('user', 'task');
    expect(repo.deleteTask).toHaveBeenCalledWith('task', db);
    expect(repo.upsertProgress).toHaveBeenCalledTimes(2);
  });

  it('devolve a matéria junto da tarefa em toda resposta de escrita', async () => {
    // Sem o `subjectName` o front identificava a tarefa pelo título, que é o
    // subtópico — foi assim que o cronograma passou a parecer por subtópico.
    repo.findSessionById.mockResolvedValue({ scheduleId: 'schedule', schedule: { userId: 'user' } });
    repo.createTask.mockResolvedValue({ id: 'task' });
    repo.findTaskById.mockResolvedValue({ id: 'task', subject: { name: 'Matemática' } });
    expect(await service.createTask('user', { sessionId: 'session', title: 'Revisão', scheduledMinutes: 20 }))
      .toMatchObject({ subjectName: 'Matemática' });

    repo.findTaskById.mockResolvedValue({ id: 'task', subject: { name: 'Física' }, scheduleId: 'schedule', schedule: { userId: 'user' } });
    expect(await service.completeTask('user', 'task')).toMatchObject({ subjectName: 'Física' });
    expect(await service.updateTask('user', 'task', { status: 'PENDING' })).toMatchObject({ subjectName: 'Física' });
  });

  it('a listagem de tarefas também traz a matéria', async () => {
    repo.findTasks = vi.fn().mockResolvedValue({
      items: [{ id: 'a', subject: { name: 'História' } }, { id: 'b', subject: null }],
      total: 2, page: 1, limit: 20, totalPages: 1,
    });
    const page = await service.getTasks('user', { page: 1, limit: 20 });
    expect(page?.items.map((t) => t.subjectName)).toEqual(['História', null]);
  });

  it('evolução inclui exatamente 30 dias e usa tempo registrado e data de conclusão', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T23:00:00Z'));
    db.studyTimeLog.findMany.mockResolvedValue([
      { endTime: new Date('2026-09-13T12:00:00Z'), durationMinutes: 25 },
      { endTime: new Date('2026-09-13T13:00:00Z'), durationMinutes: 10 },
    ]);
    db.studyTask.findMany.mockResolvedValue([{ status: 'DONE', completedAt: new Date('2026-09-13T12:00:00Z') }]);
    const evolution = await service.getProgressEvolution('user', 30);
    expect(evolution).toHaveLength(30);
    expect(evolution?.[0]).toEqual({ date: '2026-08-15', studyMinutes: 0, completedTasks: 0 });
    expect(evolution?.[29]).toEqual({ date: '2026-09-13', studyMinutes: 35, completedTasks: 1 });
  });

  it.each([1, 2, 10, 100])('conserva o orçamento de %i minutos por dia', (minutes) => {
    const allocations = service['buildSessions'](
      new Date('2026-09-13'), new Date('2026-09-13'), minutes, [0],
      [{ subjectId: 'a', targetHours: 1 }, { subjectId: 'b', targetHours: 1 }, { subjectId: 'c', targetHours: 1 }],
    );
    expect(allocations[0].subjectAllocations.reduce((sum, item) => sum + item.estimatedMinutes, 0)).toBe(minutes);
    expect(allocations[0].subjectAllocations.every(item => item.estimatedMinutes >= 0)).toBe(true);
  });

  const validSchedule = {
    startDate: '2026-09-13', endDate: '2026-09-20', studyDays: [0], dailyMinutes: 60,
    subjects: [{ subjectId: 'a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01', targetHours: 1 }],
  };

  it.each([
    { endDate: '2026-09-12' },
    { subjects: [{ ...validSchedule.subjects[0], targetHours: 0 }] },
    { endDate: '2026-09-13', studyDays: [1] },
  ])('rejeita cronograma impossível antes de gravar: %j', async (override) => {
    await expect(service.createSchedule('user', { ...validSchedule, ...override })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { subjects: [{ subjectId: 'invalid', targetHours: -1 }] },
    { subjects: [validSchedule.subjects[0], validSchedule.subjects[0]] },
    { subjects: [] },
    { studyDays: [] },
    { studyDays: [0, 0] },
  ])('valida disciplinas e dias: %j', async (override) => {
    expect(await validate(plainToInstance(CreateStudyScheduleDto, { ...validSchedule, ...override }))).not.toHaveLength(0);
  });

  it('aceita um cronograma válido e rejeita status desconhecido', async () => {
    expect(await validate(plainToInstance(CreateStudyScheduleDto, validSchedule))).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateStudyTaskDto, { status: 'INVALID' }))).not.toHaveLength(0);
  });
});

describe('Cronograma: o cronômetro é por matéria, não por subtópico', () => {
  let service: SchedulesService;
  let repo: any;
  let db: any;

  const MATEMATICA = 'a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01';

  beforeEach(() => {
    db = {
      studyTask: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      studySession: { findMany: vi.fn().mockResolvedValue([]) },
      studyTimeLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    };
    db.$transaction = vi.fn((callback: (tx: unknown) => unknown) => callback(db));
    repo = {
      prisma: db,
      findScheduleByUserId: vi.fn().mockResolvedValue({ id: 'schedule' }),
      findTaskById: vi.fn(),
      findSessionByDate: vi.fn().mockResolvedValue(null),
      findScheduleSubjectById: vi.fn().mockResolvedValue({ subjectId: MATEMATICA }),
      createTimeLog: vi.fn(),
      updateTask: vi.fn(),
      upsertProgress: vi.fn((_tx, _id, data) => data),
    };
    repo.timeLogsForSchedule = vi.fn((_id, _period, _client) => db.studyTimeLog.findMany());
    service = new SchedulesService(repo as SchedulesRepository);
  });

  it('registra o tempo pela matéria, sem amarrar a uma tarefa', async () => {
    await service.logSubjectTime('user', MATEMATICA, 45);
    expect(repo.createTimeLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ subjectId: MATEMATICA, userId: 'user', durationMinutes: 45 }),
    );
    const payload = repo.createTimeLog.mock.calls[0][1];
    expect(payload.taskId).toBeUndefined();
  });

  it('leva a tarefa da matéria do dia de pendente para em andamento', async () => {
    db.studyTask.findMany.mockResolvedValue([{ id: 'task-mat' }]);
    await service.logSubjectTime('user', MATEMATICA, 30);
    expect(db.studyTask.update).toHaveBeenCalledWith({
      where: { id: 'task-mat' },
      data: { status: 'IN_PROGRESS' },
    });
  });

  it('recusa matéria que não faz parte do cronograma', async () => {
    repo.findScheduleSubjectById.mockResolvedValue(null);
    expect(await service.logSubjectTime('user', MATEMATICA, 30)).toBeNull();
    expect(repo.createTimeLog).not.toHaveBeenCalled();
  });

  it('recusa registro quando o aluno não tem cronograma', async () => {
    repo.findScheduleByUserId.mockResolvedValue(null);
    expect(await service.logSubjectTime('user', MATEMATICA, 30)).toBeNull();
    expect(repo.createTimeLog).not.toHaveBeenCalled();
  });

  it('o registro antigo por tarefa também guarda a matéria da tarefa', async () => {
    repo.findTaskById.mockResolvedValue({
      status: 'DONE', scheduleId: 'schedule', subjectId: MATEMATICA, schedule: { userId: 'user' },
    });
    await service.stopTimer('user', 'task', 20);
    expect(repo.createTimeLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ taskId: 'task', subjectId: MATEMATICA }),
    );
  });

  it('soma no progresso o tempo registrado só pela matéria', async () => {
    db.studyTimeLog.findMany.mockResolvedValue([{ durationMinutes: 25 }]);
    expect(await service.recalculateProgress('user')).toMatchObject({ completedMinutes: 25 });
    expect(repo.timeLogsForSchedule).toHaveBeenCalledWith('schedule', undefined, db);
  });

  it('lê os logs pelo mesmo cliente da transação, para o registro recém-gravado entrar na soma', async () => {
    await service.logSubjectTime('user', MATEMATICA, 45);
    const [, , client] = repo.timeLogsForSchedule.mock.calls.at(-1);
    expect(client).toBe(db);
  });

  it('a visão diária junta o tempo por tarefa e o tempo só por matéria', async () => {
    repo.findSessionByDate.mockResolvedValue({
      id: 'session',
      tasks: [{ id: 'task-mat', subjectId: MATEMATICA }],
    });
    db.studyTimeLog.findMany.mockResolvedValue([
      { taskId: 'task-mat', subjectId: MATEMATICA, durationMinutes: 20 },
      { taskId: null, subjectId: MATEMATICA, durationMinutes: 15 },
    ]);
    const daily = await service.getDailySession('user', new Date('2026-09-13T12:00:00Z'));
    expect(daily?.session?.tasks[0].loggedMinutes).toBe(20);
    expect(daily?.loggedMinutesBySubject).toEqual({ [MATEMATICA]: 35 });
  });

  it('valida a matéria e os minutos do registro do cronômetro', async () => {
    expect(await validate(plainToInstance(SubjectTimeLogDto, { subjectId: MATEMATICA, durationMinutes: 45 })))
      .toHaveLength(0);
    expect(await validate(plainToInstance(SubjectTimeLogDto, { subjectId: 'nao-e-uuid', durationMinutes: 45 })))
      .not.toHaveLength(0);
    // Zero minuto não é estudo: deixaria um registro vazio na evolução.
    expect(await validate(plainToInstance(SubjectTimeLogDto, { subjectId: MATEMATICA, durationMinutes: 0 })))
      .not.toHaveLength(0);
  });
});
