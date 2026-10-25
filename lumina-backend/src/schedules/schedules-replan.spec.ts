import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateStudyScheduleDto, ReplanTaskDto, UpdateStudyScheduleDto } from './dto/create-study-schedule.dto';
import { SchedulesService } from './schedules.service';
import { SchedulesRepository } from './schedules.repository';

/**
 * Fases 4 e 5 do cronograma adaptativo: replanejamento com escolha (§12),
 * disponibilidade por dia da semana (§11), rotina de redação (§9) e a
 * atualização dos cronogramas criados antes do gerador adaptativo.
 */
describe('Cronograma: replanejamento, onboarding e cronogramas antigos', () => {
  let service: SchedulesService;
  let repo: any;
  let db: any;
  let generator: { buildTasksForSession: ReturnType<typeof vi.fn> };

  const schedule = {
    id: 'schedule', userId: 'user', priorityAreas: [], excludedTopicIds: [], essayFrequency: null,
    startDate: new Date('2026-09-21'), endDate: new Date('2026-11-27'),
    studyDays: [1, 2, 3, 4, 5], dailyMinutes: 120, dayMinutes: [],
    scheduleSubjects: [
      { subjectId: 'math', targetHours: 40, subject: { name: 'Matemática', code: 'MATH' } },
    ],
  };
  const pendingTask = (overrides: Record<string, unknown> = {}) => ({
    id: 'task', status: 'PENDING', topicId: 'topic', scheduleId: 'schedule', completedAt: null,
    scheduledMinutes: 40, session: { date: new Date('2026-09-29') }, schedule: { userId: 'user' },
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T15:00:00Z'));
    db = {
      studyTask: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      studySession: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      studySchedule: { update: vi.fn() },
      studyTimeLog: { findMany: vi.fn().mockResolvedValue([]) },
    };
    db.$transaction = vi.fn((callback: (tx: unknown) => unknown) => callback(db));
    repo = {
      prisma: db,
      findScheduleByUserId: vi.fn().mockResolvedValue(schedule),
      findScheduleById: vi.fn().mockResolvedValue(schedule),
      findUserVestibular: vi.fn().mockResolvedValue(null),
      findTaskById: vi.fn().mockResolvedValue(pendingTask()),
      findSessionByDate: vi.fn(),
      findSessionsWithTasks: vi.fn(),
      updateTask: vi.fn(),
      createTasks: vi.fn(),
      createSchedule: vi.fn().mockResolvedValue({ id: 'schedule' }),
      createScheduleSubjects: vi.fn(),
      deleteScheduleSubjects: vi.fn(),
      replaceDayMinutes: vi.fn(),
      createSessions: vi.fn(),
      upsertProgress: vi.fn((_tx, _id, data) => data),
      timeLogsForSchedule: vi.fn().mockResolvedValue([]),
      findMeasuredTasks: vi.fn().mockResolvedValue([]),
    };
    generator = { buildTasksForSession: vi.fn().mockResolvedValue([]) };
    service = new SchedulesService(repo as SchedulesRepository, generator as never, {} as never);
  });

  afterEach(() => vi.useRealTimers());

  describe('replanejar uma tarefa não feita (§12)', () => {
    it('SKIP marca a tarefa como pulada, sem mover', async () => {
      const result = await service.replanTask('user', 'task', { strategy: 'SKIP' });
      expect(result).toEqual({ strategy: 'SKIP', applied: true, movedTo: null });
      expect(repo.updateTask).toHaveBeenCalledWith('task', { status: 'SKIPPED', completedAt: null }, db);
    });

    it('TOMORROW leva para o próximo dia de estudo depois de HOJE, não depois do dia perdido', async () => {
      db.studySession.findFirst.mockResolvedValue({ id: 'next', date: new Date('2026-10-01'), scheduledMinutes: 120 });
      const result = await service.replanTask('user', 'task', { strategy: 'TOMORROW', date: '2026-09-30' });
      // A tarefa era de 29/09; hoje é 30/09 → procura a partir de 30/09.
      expect(db.studySession.findFirst.mock.calls[0][0].where.date).toEqual({ gt: new Date('2026-09-30') });
      expect(repo.updateTask).toHaveBeenCalledWith('task', { sessionId: 'next' }, db);
      expect(result).toEqual({ strategy: 'TOMORROW', applied: true, movedTo: '2026-10-01' });
    });

    it('o dia de destino ganha o próprio plano antes de receber a tarefa', async () => {
      db.studySession.findFirst.mockResolvedValue({ id: 'next', date: new Date('2026-10-01'), scheduledMinutes: 120 });
      generator.buildTasksForSession.mockResolvedValue([{ title: 'Teoria — Funções' }]);
      await service.replanTask('user', 'task', { strategy: 'TOMORROW', date: '2026-09-30' });
      expect(repo.createTasks).toHaveBeenCalledWith(db, [{ title: 'Teoria — Funções' }]);
      expect(repo.createTasks.mock.invocationCallOrder[0]).toBeLessThan(repo.updateTask.mock.invocationCallOrder[0]);
    });

    it('SATURDAY cria o sábado quando o aluno não estuda nesse dia', async () => {
      db.studySession.findUnique.mockResolvedValue(null);
      db.studySession.create.mockResolvedValue({ id: 'saturday' });
      const result = await service.replanTask('user', 'task', { strategy: 'SATURDAY', date: '2026-09-30' });
      expect(db.studySession.create).toHaveBeenCalledWith({
        data: { scheduleId: 'schedule', date: new Date('2026-10-03'), scheduledMinutes: 0 },
      });
      expect(repo.updateTask).toHaveBeenCalledWith('task', { sessionId: 'saturday' }, db);
      expect(result?.movedTo).toBe('2026-10-03');
    });

    it('SATURDAY recusa quando o sábado já fica depois do fim do cronograma', async () => {
      repo.findScheduleById.mockResolvedValue({ ...schedule, endDate: new Date('2026-10-01') });
      await expect(service.replanTask('user', 'task', { strategy: 'SATURDAY', date: '2026-09-30' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('sem próximo dia de estudo, avisa em vez de sumir com a tarefa', async () => {
      db.studySession.findFirst.mockResolvedValue(null);
      await expect(service.replanTask('user', 'task', { strategy: 'TOMORROW' }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateTask).not.toHaveBeenCalled();
    });

    it('tarefa concluída ou já pulada não pode ser reagendada', async () => {
      repo.findTaskById.mockResolvedValue(pendingTask({ status: 'DONE' }));
      await expect(service.replanTask('user', 'task', { strategy: 'SKIP' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tarefa de outro aluno não é encontrada', async () => {
      repo.findTaskById.mockResolvedValue(pendingTask({ schedule: { userId: 'outro' } }));
      expect(await service.replanTask('user', 'task', { strategy: 'SKIP' })).toBeNull();
    });

    describe('AUTO', () => {
      const target = { id: 'next', date: new Date('2026-10-01'), scheduledMinutes: 120 };
      const task = (subject: string, scheduledMinutes: number) => ({ subject: { name: subject }, scheduledMinutes });

      beforeEach(() => {
        db.studySession.findFirst.mockResolvedValue(target);
        // planSession (kept) → antes → planSession com replace (kept) → depois
        db.studyTask.findMany
          .mockResolvedValueOnce([{ id: 'existing', scheduledMinutes: 120, topicId: 'x', activityType: 'TEORIA' }])
          .mockResolvedValueOnce([task('Matemática', 40), task('Português', 40), task('Física', 40)])
          .mockResolvedValueOnce([{ id: 'task', scheduledMinutes: 40, topicId: 'topic', activityType: 'TEORIA' }])
          .mockResolvedValueOnce([task('Matemática', 80), task('Português', 20), task('Física', 20)]);
      });

      it('sem confirmar devolve só a prévia e avisa quem perde tempo', async () => {
        const result = await service.replanTask('user', 'task', { strategy: 'AUTO', date: '2026-09-30' });
        expect(result).toMatchObject({ strategy: 'AUTO', applied: false, movedTo: '2026-10-01' });
        expect(result?.preview?.subjects).toEqual([
          { subjectName: 'Física', beforeMinutes: 40, afterMinutes: 20 },
          { subjectName: 'Matemática', beforeMinutes: 40, afterMinutes: 80 },
          { subjectName: 'Português', beforeMinutes: 40, afterMinutes: 20 },
        ]);
        expect(result?.preview?.warnings).toEqual([
          'Física cai de 40min para 20min nesse dia.',
          'Português cai de 40min para 20min nesse dia.',
        ]);
        // A prévia não chega a recalcular o progresso: a transação é desfeita.
        expect(repo.upsertProgress).not.toHaveBeenCalled();
      });

      it('refaz o dia em volta da tarefa movida, sem apagá-la', async () => {
        await service.replanTask('user', 'task', { strategy: 'AUTO', date: '2026-09-30', confirm: true });
        const deleteWhere = db.studyTask.deleteMany.mock.calls[0][0].where;
        expect(deleteWhere).toMatchObject({ sessionId: 'next', id: { notIn: ['task'] }, status: 'PENDING' });
        // O gerador recebe o tempo já ocupado pela tarefa movida e o tópico dela.
        expect(generator.buildTasksForSession.mock.lastCall?.[0]).toMatchObject({
          occupiedMinutes: 40,
          excludeTopicIds: ['topic'],
        });
        expect(repo.upsertProgress).toHaveBeenCalled();
      });

      it('só olha dia com tempo planejado (pula o sábado extra de 0 minuto)', async () => {
        await service.replanTask('user', 'task', { strategy: 'AUTO', date: '2026-09-30' });
        expect(db.studySession.findFirst.mock.calls[0][0].where.scheduledMinutes).toEqual({ gt: 0 });
      });
    });

    it('AUTO em tarefa sem tópico só leva para o próximo dia (não há o que redistribuir)', async () => {
      repo.findTaskById.mockResolvedValue(pendingTask({ topicId: null }));
      db.studySession.findFirst.mockResolvedValue({ id: 'next', date: new Date('2026-10-01'), scheduledMinutes: 120 });
      const result = await service.replanTask('user', 'task', { strategy: 'AUTO', date: '2026-09-30' });
      expect(result).toEqual({ strategy: 'AUTO', applied: true, movedTo: '2026-10-01' });
      expect(db.studyTask.deleteMany).not.toHaveBeenCalled();
    });

    it('valida a estratégia', async () => {
      expect(await validate(plainToInstance(ReplanTaskDto, { strategy: 'AUTO', confirm: true, date: '2026-09-30' }))).toHaveLength(0);
      expect(await validate(plainToInstance(ReplanTaskDto, { strategy: 'DEPOIS' }))).not.toHaveLength(0);
    });
  });

  it('tarefa pulada não conta como pendência no progresso', async () => {
    db.studyTask.findMany.mockResolvedValue([
      { status: 'DONE', completedAt: new Date('2026-09-30T12:00:00Z') },
      { status: 'PENDING', completedAt: null },
      { status: 'SKIPPED', completedAt: null },
    ]);
    expect(await service.recalculateProgress('user')).toMatchObject({ completedTasks: 1, totalTasks: 2 });
  });

  describe('disponibilidade por dia da semana (§11)', () => {
    const dto = {
      startDate: '2026-09-28', endDate: '2026-10-04', studyDays: [1, 3, 6], dailyMinutes: 120,
      subjects: [{ subjectId: 'a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01', targetHours: 10 }],
    };

    it('cada dia nasce com o tempo que o aluno informou; sem informar, vale o tempo diário', async () => {
      await service.createSchedule('user', { ...dto, dayMinutes: [{ weekday: 1, minutes: 90 }, { weekday: 6, minutes: 240 }] });
      expect(repo.createSessions).toHaveBeenCalledWith(db, 'schedule', [
        { date: new Date('2026-09-28'), scheduledMinutes: 90 },
        { date: new Date('2026-09-30'), scheduledMinutes: 120 },
        { date: new Date('2026-10-03'), scheduledMinutes: 240 },
      ]);
      expect(repo.upsertProgress).toHaveBeenCalledWith(db, 'schedule', expect.objectContaining({ totalScheduledMinutes: 450 }));
      expect(repo.replaceDayMinutes).toHaveBeenCalled();
    });

    it('dia com zero minuto deixa de ser dia de estudo', async () => {
      await service.createSchedule('user', { ...dto, dayMinutes: [{ weekday: 3, minutes: 0 }] });
      expect(repo.createSessions.mock.calls[0][2].map((s: any) => s.date)).toEqual([
        new Date('2026-09-28'), new Date('2026-10-03'),
      ]);
    });

    it('recusa cronograma em que todo dia ficou com zero minuto', async () => {
      const dayMinutes = [1, 3, 6].map((weekday) => ({ weekday, minutes: 0 }));
      await expect(service.createSchedule('user', { ...dto, dayMinutes })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('valida dia da semana repetido e fora da faixa, e aceita os campos do onboarding', async () => {
      const ok = { ...dto, dayMinutes: [{ weekday: 1, minutes: 90 }], targetCourse: 'Medicina', priorityAreas: ['NATUREZA', 'HUMANAS', 'MATEMATICA'], essayFrequency: 'BIWEEKLY' };
      expect(await validate(plainToInstance(CreateStudyScheduleDto, ok))).toHaveLength(0);
      expect(await validate(plainToInstance(CreateStudyScheduleDto, { ...dto, dayMinutes: [{ weekday: 7, minutes: 30 }] }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(CreateStudyScheduleDto, { ...dto, dayMinutes: [{ weekday: 1, minutes: 30 }, { weekday: 1, minutes: 60 }] }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(CreateStudyScheduleDto, { ...dto, priorityAreas: ['EXATAS'] }))).not.toHaveLength(0);
      // No máximo três áreas, sem repetir.
      const four = ['NATUREZA', 'HUMANAS', 'MATEMATICA', 'LINGUAGENS'];
      expect(await validate(plainToInstance(CreateStudyScheduleDto, { ...dto, priorityAreas: four }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(CreateStudyScheduleDto, { ...dto, priorityAreas: ['NATUREZA', 'NATUREZA'] }))).not.toHaveLength(0);
    });
  });

  describe('editar o cronograma', () => {
    it('aceita trocar as disciplinas (o formulário de edição manda a lista inteira)', async () => {
      const subjects = [{ subjectId: 'a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01', targetHours: 30 }];
      expect(await validate(plainToInstance(UpdateStudyScheduleDto, { subjects, dailyMinutes: 90 }))).toHaveLength(0);
      await service.updateSchedule('user', 'schedule', { subjects });
      expect(repo.deleteScheduleSubjects).toHaveBeenCalledWith(db, 'schedule');
      expect(repo.createScheduleSubjects).toHaveBeenCalledWith(db, 'schedule', subjects);
    });

    it('refaz os dias a partir de hoje: muda o tempo, cria o que falta e tira o que saiu', async () => {
      db.studySession.findMany.mockImplementation(({ include }: any) =>
        include?._count
          ? Promise.resolve([
              // Segunda continua, com tempo novo; terça saiu do plano e está
              // vazia; quarta saiu mas tem tarefa do aluno e fica.
              { id: 'mon', date: new Date('2026-10-05'), scheduledMinutes: 120, _count: { tasks: 0 } },
              { id: 'tue', date: new Date('2026-10-06'), scheduledMinutes: 120, _count: { tasks: 0 } },
              { id: 'wed', date: new Date('2026-10-07'), scheduledMinutes: 120, _count: { tasks: 2 } },
            ])
          : Promise.resolve([]),
      );
      await service.updateSchedule('user', 'schedule', {
        startDate: '2026-10-05', endDate: '2026-10-11', studyDays: [1, 5], dailyMinutes: 60,
      });

      expect(db.studySession.update).toHaveBeenCalledWith({ where: { id: 'mon' }, data: { scheduledMinutes: 60 } });
      expect(db.studySession.delete).toHaveBeenCalledTimes(1);
      expect(db.studySession.delete).toHaveBeenCalledWith({ where: { id: 'tue' } });
      expect(repo.createSessions).toHaveBeenCalledWith(db, 'schedule', [
        { date: new Date('2026-10-09'), scheduledMinutes: 60 },
      ]);
      // Só as tarefas geradas e intocadas são apagadas para nascerem de novo.
      expect(db.studyTask.deleteMany.mock.calls[0][0].where).toMatchObject({
        scheduleId: 'schedule', status: 'PENDING', timeLogs: { none: {} },
      });
    });

    it('não mexe em nada antes de ontem (o passado do aluno não muda)', async () => {
      await service.updateSchedule('user', 'schedule', { dailyMinutes: 60 });
      expect(db.studyTask.deleteMany.mock.calls[0][0].where.session).toEqual({ date: { gte: new Date('2026-09-29') } });
    });

    it('cronograma de outro aluno não é editado', async () => {
      repo.findScheduleById.mockResolvedValue({ ...schedule, userId: 'outro' });
      expect(await service.updateSchedule('user', 'schedule', { dailyMinutes: 60 })).toBeNull();
      expect(db.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cronograma criado antes do gerador adaptativo', () => {
    const staticTask = (name: string, code: string, overrides: Record<string, unknown> = {}) => ({
      id: name, topicId: null, status: 'PENDING', title: `${name}: estudo programado`, subject: { name, code }, ...overrides,
    });
    const session = (tasks: unknown[]) => ({ id: 'session', date: new Date('2026-09-30'), scheduledMinutes: 120, tasks });

    it('dia intocado é refeito pelo gerador novo', async () => {
      repo.findSessionByDate.mockResolvedValue(session([staticTask('Matemática', 'MATH'), staticTask('Redação', 'ESSAY')]));
      await service.getDailySession('user', new Date('2026-09-30'));
      expect(db.studyTask.deleteMany).toHaveBeenCalledTimes(1);
      expect(generator.buildTasksForSession).toHaveBeenCalledTimes(1);
    });

    it('dia em que o aluno já fez alguma coisa fica como está', async () => {
      repo.findSessionByDate.mockResolvedValue(
        session([staticTask('Matemática', 'MATH', { status: 'DONE' }), staticTask('Física', 'PHYSICS')]),
      );
      await service.getDailySession('user', new Date('2026-09-30'));
      expect(db.studyTask.deleteMany).not.toHaveBeenCalled();
      expect(generator.buildTasksForSession).not.toHaveBeenCalled();
    });

    it('dia só com matéria sem catálogo não é "antigo": o gerador novo também o planeja assim', async () => {
      repo.findSessionByDate.mockResolvedValue(session([staticTask('Libras', 'LIBRAS')]));
      await service.getDailySession('user', new Date('2026-09-30'));
      expect(db.studyTask.deleteMany).not.toHaveBeenCalled();
    });

    it('dia passado não é refeito', async () => {
      repo.findSessionByDate.mockResolvedValue({ ...session([staticTask('Matemática', 'MATH')]), date: new Date('2026-09-25') });
      await service.getDailySession('user', new Date('2026-09-25'));
      expect(db.studyTask.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('redação da semana (§9)', () => {
    const withEssay = {
      ...schedule,
      scheduleSubjects: [...schedule.scheduleSubjects, { subjectId: 'essay', targetHours: 20, subject: { name: 'Redação', code: 'ESSAY' } }],
    };
    const emptySession = (id: string, date: string) => ({ id, date: new Date(date), scheduledMinutes: 120, tasks: [] });
    const essayOf = () => generator.buildTasksForSession.mock.lastCall?.[0].essay;

    beforeEach(() => repo.findScheduleByUserId.mockResolvedValue(withEssay));

    it('entra no último dia de estudo da semana que ainda dá para planejar', async () => {
      // Semana 1 do cronograma (28/09 a 04/10) → etapa "Estrutura e produção".
      db.studySession.findMany.mockResolvedValue([
        emptySession('wed', '2026-09-30'), emptySession('thu', '2026-10-01'), emptySession('fri', '2026-10-02'),
      ]);
      repo.findSessionByDate.mockResolvedValue(emptySession('fri', '2026-10-02'));
      await service.getDailySession('user', new Date('2026-10-02'));
      expect(essayOf()).toMatchObject({ title: 'Redação — Estrutura e produção' });

      repo.findSessionByDate.mockResolvedValue(emptySession('wed', '2026-09-30'));
      await service.getDailySession('user', new Date('2026-09-30'));
      expect(essayOf()).toBeNull();
    });

    it('semana que já tem redação não ganha outra', async () => {
      db.studySession.findMany.mockResolvedValue([
        { ...emptySession('thu', '2026-10-01'), tasks: [{ id: 'redacao' }] }, emptySession('fri', '2026-10-02'),
      ]);
      repo.findSessionByDate.mockResolvedValue(emptySession('fri', '2026-10-02'));
      await service.getDailySession('user', new Date('2026-10-02'));
      expect(essayOf()).toBeNull();
    });

    it('rotina quinzenal pula a semana ímpar', async () => {
      repo.findScheduleByUserId.mockResolvedValue({ ...withEssay, essayFrequency: 'BIWEEKLY' });
      db.studySession.findMany.mockResolvedValue([emptySession('fri', '2026-10-02')]);
      repo.findSessionByDate.mockResolvedValue(emptySession('fri', '2026-10-02'));
      await service.getDailySession('user', new Date('2026-10-02'));
      expect(essayOf()).toBeNull();
    });
  });

  it('atualizar o plano do dia troca só o que o aluno não tocou e devolve o dia novo', async () => {
    repo.findSessionByDate.mockResolvedValue({ id: 'session', date: new Date('2026-09-30'), scheduledMinutes: 120, tasks: [{ id: 'kept', topicId: 'x', status: 'DONE', title: 'Teoria — X', subject: null }] });
    db.studyTask.findMany.mockResolvedValue([{ id: 'kept', scheduledMinutes: 40, topicId: 'x', activityType: 'TEORIA', status: 'DONE' }]);
    const daily = await service.refreshDay('user', new Date('2026-09-30'));
    expect(db.studyTask.deleteMany.mock.calls[0][0].where).toMatchObject({ sessionId: 'session', status: 'PENDING' });
    expect(generator.buildTasksForSession.mock.lastCall?.[0]).toMatchObject({ occupiedMinutes: 40, excludeTopicIds: ['x'] });
    expect(daily?.session?.id).toBe('session');
  });

  describe('o aluno escolhe os tópicos', () => {
    beforeEach(() => {
      db.topic = { findUnique: vi.fn().mockResolvedValue({ id: 'topic' }) };
    });

    it('tirar um tópico guarda a escolha e refaz os dias em que ele estava agendado', async () => {
      db.studyTask.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.topicId === 'topic' ? [{ sessionId: 's1' }, { sessionId: 's1' }, { sessionId: 's2' }] : []),
      );
      db.studySession.findMany.mockResolvedValue([
        { id: 's1', date: new Date('2026-10-01'), scheduledMinutes: 120 },
        { id: 's2', date: new Date('2026-10-02'), scheduledMinutes: 120 },
      ]);
      const result = await service.setTopicIncluded('user', 'topic', false);

      expect(result).toEqual({ topicId: 'topic', included: false });
      expect(db.studySchedule.update).toHaveBeenCalledWith({ where: { id: 'schedule' }, data: { excludedTopicIds: ['topic'] } });
      // Só de ontem em diante, e só tarefa gerada que o aluno não tocou.
      const lookup = db.studyTask.findMany.mock.calls.find(([arg]: any[]) => arg.where?.topicId === 'topic')[0];
      expect(lookup.where).toMatchObject({ session: { date: { gte: new Date('2026-09-29') } }, status: 'PENDING' });
      expect(generator.buildTasksForSession).toHaveBeenCalledTimes(2);
      expect(generator.buildTasksForSession.mock.lastCall?.[0].excludeTopicIds).toContain('topic');
    });

    it('devolver um tópico só o tira da lista; ele volta nos próximos dias gerados', async () => {
      repo.findScheduleByUserId.mockResolvedValue({ ...schedule, excludedTopicIds: ['topic', 'outro'] });
      await service.setTopicIncluded('user', 'topic', true);
      expect(db.studySchedule.update).toHaveBeenCalledWith({ where: { id: 'schedule' }, data: { excludedTopicIds: ['outro'] } });
      expect(generator.buildTasksForSession).not.toHaveBeenCalled();
    });

    it('tópico tirado nunca entra num dia novo', async () => {
      repo.findScheduleByUserId.mockResolvedValue({ ...schedule, excludedTopicIds: ['fora'] });
      repo.findSessionByDate.mockResolvedValue({ id: 'session', date: new Date('2026-09-30'), scheduledMinutes: 120, tasks: [] });
      await service.getDailySession('user', new Date('2026-09-30'));
      expect(generator.buildTasksForSession.mock.lastCall?.[0].excludeTopicIds).toEqual(['fora']);
    });

    it('tópico inexistente não é aceito', async () => {
      db.topic.findUnique.mockResolvedValue(null);
      expect(await service.setTopicIncluded('user', 'nada', false)).toBeNull();
    });
  });

  it('visão semanal: resume cada dia sem gerar tarefa', async () => {
    repo.findSessionsWithTasks.mockResolvedValue([
      { date: new Date('2026-09-28'), scheduledMinutes: 120, tasks: [{ status: 'DONE' }, { status: 'PENDING' }, { status: 'SKIPPED' }] },
      { date: new Date('2026-09-29'), scheduledMinutes: 90, tasks: [] },
    ]);
    expect(await service.getWeek('user', new Date('2026-09-27'))).toEqual([
      { date: '2026-09-28', scheduledMinutes: 120, totalTasks: 2, doneTasks: 1 },
      { date: '2026-09-29', scheduledMinutes: 90, totalTasks: 0, doneTasks: 0 },
    ]);
    expect(repo.findSessionsWithTasks).toHaveBeenCalledWith('schedule', new Date('2026-09-27'), new Date('2026-10-03'));
    expect(generator.buildTasksForSession).not.toHaveBeenCalled();
  });
});
