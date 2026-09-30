import { BadRequestException, Injectable } from "@nestjs/common";
import { StudyTaskStatus, type Prisma } from "@prisma/client";
import { SchedulesRepository } from "./schedules.repository";
import { ScheduleGeneratorService } from "./schedule-generator.service";
import { Db } from "./domain/types";
import type { CreateStudyScheduleDto } from "./dto/create-study-schedule.dto";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = startOfDay(start);
  const last = endOfDay(end);
  while (current <= last) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

/**
 * O app identifica a tarefa pela MATÉRIA (`subjectName`). O Prisma devolve a
 * disciplina aninhada em `subject`, então sem este achatamento o front recebia
 * `subjectName` indefinido e caía no título da tarefa — que é o subtópico.
 * É a razão de o cronograma parecer organizado por subtópico.
 */
function withSubjectName<T extends object>(task: T): T & { subjectName: string | null } {
  const subject = (task as { subject?: { name: string } | null }).subject;
  return { ...task, subjectName: subject?.name ?? null };
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly repo: SchedulesRepository,
    private readonly generator: ScheduleGeneratorService,
  ) {}

  async findStudySubjects() {
    return this.repo.findStudySubjects();
  }

  async getUserVestibular(userId: string) {
    return this.repo.findUserVestibular(userId);
  }

  async setVestibular(
    userId: string,
    data: { examId?: string | null; customName?: string | null; targetDate?: Date | null },
  ) {
    return this.repo.upsertUserVestibular(userId, data);
  }

  async getSchedule(userId: string) {
    return this.repo.findScheduleByUserId(userId);
  }

  async updateSchedule(
    userId: string,
    scheduleId: string,
    data: {
      startDate?: Date;
      endDate?: Date;
      studyDays?: number[];
      dailyMinutes?: number;
      objective?: string | null;
    },
  ) {
    const schedule = await this.repo.findScheduleById(scheduleId);
    if (!schedule || schedule.userId !== userId) return null;

    const update: Prisma.StudyScheduleUpdateInput = {};
    if (data.startDate) update.startDate = data.startDate;
    if (data.endDate) update.endDate = data.endDate;
    if (data.studyDays) update.studyDays = data.studyDays;
    if (data.dailyMinutes) update.dailyMinutes = data.dailyMinutes;
    if (data.objective !== undefined) update.objective = data.objective;

    return this.repo.prisma.studySchedule.update({
      where: { id: scheduleId },
      data: update,
    });
  }

  async getScheduleTasks(
    userId: string,
    params: { status?: string; subjectId?: string; page: number; limit: number },
  ) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const result = await this.repo.findTasks({
      scheduleId: schedule.id,
      status: params.status,
      subjectId: params.subjectId,
      page: params.page,
      limit: params.limit,
    });
    return { ...result, items: result.items.map(withSubjectName) };
  }

  async getTasks(
    userId: string,
    params: { status?: string; subjectId?: string; page: number; limit: number },
  ) {
    return this.getScheduleTasks(userId, params);
  }

  async createSchedule(
    userId: string,
    dto: CreateStudyScheduleDto,
  ): Promise<void> {
    const startDate = startOfDay(new Date(dto.startDate));
    const endDate = startOfDay(new Date(dto.endDate));
    if (endDate < startDate) {
      throw new BadRequestException("A data final deve ser igual ou posterior à inicial.");
    }
    if (!dto.subjects.some((subject) => subject.targetHours > 0)) {
      throw new BadRequestException("Informe horas de estudo para pelo menos uma disciplina.");
    }
    if (this.countStudyDays(startDate, endDate, dto.studyDays) === 0) {
      throw new BadRequestException("O período deve incluir pelo menos um dia de estudo selecionado.");
    }

    // As tarefas de cada dia não são mais geradas aqui: ficam pra quando o
    // dia for de fato consultado (getDailySession), com a prioridade calculada
    // na hora — é o que torna o cronograma adaptativo (fase 2, ver
    // docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §5). Gerar tudo de uma vez na
    // criação, pra meses no futuro, é exatamente o comportamento estático que
    // essa fase substitui.
    const studyDays = new Set(dto.studyDays);
    const sessionDates = eachDayOfInterval(startDate, endDate).filter((d) =>
      studyDays.has(d.getUTCDay()),
    );

    await this.repo.prisma.$transaction(async (tx: Db) => {
      const scheduleRecord = await this.repo.createSchedule(tx, {
        userId,
        startDate,
        endDate,
        studyDays: dto.studyDays,
        dailyMinutes: dto.dailyMinutes,
        objective: dto.objective ?? null,
      });

      await this.repo.createScheduleSubjects(tx, scheduleRecord.id, dto.subjects);
      await this.repo.createSessions(
        tx,
        scheduleRecord.id,
        sessionDates.map((date) => ({ date, scheduledMinutes: dto.dailyMinutes })),
      );

      await this.repo.upsertProgress(tx, scheduleRecord.id, {
        completedMinutes: 0,
        totalScheduledMinutes: sessionDates.length * dto.dailyMinutes,
        streakDays: 0,
        lastStudyDate: null,
        completedTasks: 0,
        totalTasks: 0,
      });
    });
  }

  async deleteSchedule(userId: string, scheduleId: string): Promise<void> {
    const schedule = await this.repo.findScheduleById(scheduleId);
    if (!schedule || schedule.userId !== userId) return;

    await this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.deleteScheduleSubjects(tx, scheduleId);
      await this.repo.deleteSchedule(tx, scheduleId);
    });
  }

  async getSessionForDate(scheduleId: string, date: Date) {
    return this.repo.findSessionByDate(scheduleId, startOfDay(date));
  }

  async getDailySession(userId: string, date: Date) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const day = startOfDay(date);
    let session = await this.repo.findSessionByDate(schedule.id, day);

    // Gera as tarefas na hora, só quando faltam e o dia é hoje ou no futuro —
    // dia passado nunca visitado fica mesmo vazio (não tem o que "planejar"
    // retroativamente). É isso que torna o cronograma adaptativo: a
    // prioridade usada é a de agora, não a de quando o cronograma foi criado.
    if (session && session.tasks.length === 0 && day.getTime() >= startOfDay(new Date()).getTime()) {
      await this.generateTasksForSession(schedule, session);
      session = await this.repo.findSessionByDate(schedule.id, day);
    }

    // O cronômetro registra por matéria, então o tempo do dia vive em dois
    // lugares: nas tarefas (registro antigo) e por disciplina (registro novo).
    // Sem somar os dois, a linha "Estudado" da visão diária ficaria zerada
    // justamente depois de o aluno usar o cronômetro.
    const logs = await this.repo.timeLogsForSchedule(schedule.id, {
      from: day,
      to: endOfDay(date),
    });

    const minutesByTask = new Map<string, number>();
    const minutesBySubject = new Map<string, number>();
    for (const log of logs) {
      if (log.taskId) {
        minutesByTask.set(
          log.taskId,
          (minutesByTask.get(log.taskId) ?? 0) + log.durationMinutes,
        );
      }
      if (log.subjectId) {
        minutesBySubject.set(
          log.subjectId,
          (minutesBySubject.get(log.subjectId) ?? 0) + log.durationMinutes,
        );
      }
    }

    const tasksWithMinutes = (session?.tasks ?? []).map((task: { id: string }) =>
      withSubjectName({ ...task, loggedMinutes: minutesByTask.get(task.id) ?? 0 }),
    );

    return {
      schedule,
      // A visão diária do app lê `session.tasks`, então o tempo por tarefa
      // precisa vir nos dois lugares — `tasks` continua sendo o atalho.
      session: session ? { ...session, tasks: tasksWithMinutes } : null,
      tasks: tasksWithMinutes,
      loggedMinutesBySubject: Object.fromEntries(minutesBySubject),
    };
  }

  private async generateTasksForSession(
    schedule: NonNullable<Awaited<ReturnType<SchedulesRepository["findScheduleByUserId"]>>>,
    session: { id: string; date: Date; scheduledMinutes: number },
  ): Promise<void> {
    await this.repo.prisma.$transaction(async (tx: Db) => {
      const tasks = await this.generator.buildTasksForSession(
        { id: session.id, scheduleId: schedule.id, date: session.date, scheduledMinutes: session.scheduledMinutes },
        schedule.userId,
        schedule.scheduleSubjects.map((ss) => ({
          subjectId: ss.subjectId,
          targetHours: ss.targetHours,
          subject: { name: ss.subject.name, code: ss.subject.code },
        })),
        tx,
      );
      if (tasks.length === 0) return;
      await this.repo.createTasks(tx, tasks);
      await this.updateProgress(tx, schedule.id);
    });
  }

  async createTask(
    userId: string,
    data: {
      sessionId: string;
      subjectId?: string;
      title: string;
      description?: string;
      scheduledMinutes: number;
    },
  ) {
    const session = await this.repo.findSessionById(data.sessionId);
    if (!session || session.schedule.userId !== userId) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      const created = await this.repo.createTask({
        scheduleId: session.scheduleId,
        sessionId: data.sessionId,
        subjectId: data.subjectId ?? null,
        title: data.title,
        description: data.description ?? null,
        scheduledMinutes: data.scheduledMinutes,
      }, tx);
      await this.updateProgress(tx, session.scheduleId);
      const withSubject = await this.repo.findTaskById(created.id);
      return withSubject ? withSubjectName(withSubject) : null;
    });
  }

  async updateTask(
    userId: string,
    taskId: string,
    data: Partial<Prisma.StudyTaskUncheckedUpdateInput>,
  ) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    const update: Prisma.StudyTaskUncheckedUpdateInput = { ...data };
    if (
      data.status === StudyTaskStatus.DONE &&
      task.status !== StudyTaskStatus.DONE
    ) {
      update.completedAt = new Date();
    } else if (data.status && data.status !== StudyTaskStatus.DONE) {
      update.completedAt = null;
    }

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.updateTask(taskId, update, tx);
      await this.updateProgress(tx, task.scheduleId);
      const refreshed = await this.repo.findTaskById(taskId);
      return refreshed ? withSubjectName(refreshed) : null;
    });
  }

  async deleteTask(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;
    await this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.deleteTask(taskId, tx);
      await this.updateProgress(tx, task.scheduleId);
    });
  }

  async rescheduleTask(userId: string, taskId: string, sessionId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    const newSession = await this.repo.findSessionById(sessionId);
    if (!newSession || newSession.scheduleId !== task.scheduleId) return null;

    return this.repo.updateTask(taskId, { sessionId: newSession.id });
  }

  async completeTask(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.updateTask(taskId, {
        status: StudyTaskStatus.DONE,
        completedAt: task.completedAt ?? new Date(),
      }, tx);
      await this.updateProgress(tx, task.scheduleId);
      const refreshed = await this.repo.findTaskById(taskId);
      return refreshed ? withSubjectName(refreshed) : null;
    });
  }

  async startTimer(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;
    return { ok: true, taskId };
  }

  async stopTimer(userId: string, taskId: string, durationMinutes: number) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.createTimeLog(tx, {
        taskId,
        // A disciplina da tarefa vai junto: assim o registro entra no
        // histórico por matéria mesmo depois de a tarefa ser excluída.
        subjectId: task.subjectId,
        userId,
        startTime: new Date(Date.now() - durationMinutes * 60_000),
        endTime: new Date(),
        durationMinutes,
      });

      if (task.status === StudyTaskStatus.PENDING) {
        await this.repo.updateTask(taskId, {
          status: StudyTaskStatus.IN_PROGRESS,
        }, tx);
      }

      return this.updateProgress(tx, task.scheduleId);
    });
  }

  /**
   * Registra tempo de estudo por MATÉRIA. É o endpoint que o cronômetro usa:
   * o aluno escolhe a disciplina, não o subtópico, e o tempo entra no
   * progresso do cronograma. A tarefa daquela matéria no dia de hoje, se
   * existir e estiver pendente, também passa para "em andamento" — é o que o
   * aluno esperaria ver na visão diária depois de estudar.
   */
  async logSubjectTime(
    userId: string,
    subjectId: string,
    durationMinutes: number,
  ) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    const plan = await this.repo.findScheduleSubjectById(schedule.id, subjectId);
    if (!plan) return null;

    const endTime = new Date();

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.createTimeLog(tx, {
        subjectId,
        userId,
        startTime: new Date(endTime.getTime() - durationMinutes * 60_000),
        endTime,
        durationMinutes,
      });

      const todayTasks = await tx.studyTask.findMany({
        where: {
          scheduleId: schedule.id,
          subjectId,
          status: StudyTaskStatus.PENDING,
          session: { date: startOfDay(endTime) },
        },
      });
      for (const task of todayTasks) {
        await tx.studyTask.update({
          where: { id: task.id },
          data: { status: StudyTaskStatus.IN_PROGRESS },
        });
      }

      return this.updateProgress(tx, schedule.id);
    });
  }

  async rescheduleMissed(userId: string, date: Date) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      const missedTasks = await tx.studyTask.findMany({
        where: {
          scheduleId: schedule.id,
          status: { in: [StudyTaskStatus.PENDING, StudyTaskStatus.IN_PROGRESS] },
          session: { date: startOfDay(date) },
        },
      });

      if (missedTasks.length === 0) return { rescheduled: 0 };

      const futureSessions = await tx.studySession.findMany({
        where: {
          scheduleId: schedule.id,
          date: { gte: addDays(startOfDay(date), 1) },
        },
        orderBy: { date: "asc" },
      });
      if (futureSessions.length === 0) return { rescheduled: 0 };

      let idx = 0;
      for (const t of missedTasks) {
        const targetSession = futureSessions[idx % futureSessions.length];
        if (targetSession) {
          await tx.studyTask.update({
              where: { id: t.id },
              data: { sessionId: targetSession.id } as Prisma.StudyTaskUncheckedUpdateInput,
            });
        }
        idx++;
      }

      return { rescheduled: missedTasks.length };
    });
  }

  async getProgress(userId: string) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    // A sequência depende da data atual, mesmo sem novas gravações de tarefas.
    return this.updateProgress(this.repo.prisma, schedule.id);
  }

  async getProgressEvolution(userId: string, days = 30) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    const endDate = endOfDay(new Date());
    const startDate = addDays(startOfDay(new Date()), -(days - 1));

    const [logs, tasksByDate] = await Promise.all([
      this.repo.timeLogsForSchedule(schedule.id, { from: startDate, to: endDate }),
      this.repo.prisma.studyTask.findMany({
        where: { scheduleId: schedule.id, status: StudyTaskStatus.DONE, completedAt: { gte: startDate, lte: endDate } },
      }),
    ]);

    const dayKeys = eachDayOfInterval(startDate, endDate);

    const evolution = dayKeys.map((day) => {
      const dayKey = formatDate(day);
      const tasks = tasksByDate.filter(
        (t) => t.completedAt && formatDate(t.completedAt) === dayKey,
      );
      return {
        date: dayKey,
        studyMinutes: logs.filter((log) => formatDate(log.endTime) === dayKey)
          .reduce((sum, log) => sum + log.durationMinutes, 0),
        completedTasks: tasks.length,
      };
    });

    return evolution;
  }

  async recalculateProgress(userId: string) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    return this.updateProgress(this.repo.prisma, schedule.id);
  }

  private async updateProgress(tx: Db, scheduleId: string) {
    const [tasks, logs, sessions] = await Promise.all([
      tx.studyTask.findMany({ where: { scheduleId } }),
      // Pelo mesmo `tx`: a soma tem de enxergar o log que acabou de ser
      // gravado, senão o primeiro registro do dia não entra no progresso.
      this.repo.timeLogsForSchedule(scheduleId, undefined, tx),
      tx.studySession.findMany({ where: { scheduleId } }),
    ]);

    const completedTasks = tasks.filter(
      (t: { status: StudyTaskStatus }) => t.status === StudyTaskStatus.DONE,
    ).length;
    const totalTasks = tasks.length;
    const completedMinutes = logs.reduce(
      (sum: number, l: { durationMinutes: number }) => sum + l.durationMinutes,
      0,
    );
    const totalScheduledMinutes = sessions.reduce(
      (sum: number, s: { scheduledMinutes: number }) => sum + s.scheduledMinutes,
      0,
    );

    const datesWithCompletedTasks = [
      ...new Set(
        tasks
          .filter(
            (t: { status: StudyTaskStatus; completedAt: Date | null }) =>
              t.status === StudyTaskStatus.DONE && t.completedAt,
          )
          .map((t) => formatDate(t.completedAt!)),
      ),
    ].sort();

    let streakDays = 0;
    const today = new Date();
    for (let i = datesWithCompletedTasks.length - 1; i >= 0; i--) {
      const d = new Date(datesWithCompletedTasks[i]);
      const todayStart = startOfDay(today);
      const diff = Math.round(
        (todayStart.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diff !== streakDays) break;
      streakDays++;
    }

    const lastStudyDate =
      datesWithCompletedTasks.length > 0
        ? new Date(datesWithCompletedTasks[datesWithCompletedTasks.length - 1])
        : null;

    return this.repo.upsertProgress(tx, scheduleId, {
      completedMinutes,
      totalScheduledMinutes,
      streakDays,
      lastStudyDate,
      completedTasks,
      totalTasks,
    });
  }

  private countStudyDays(
    start: Date,
    end: Date,
    studyDays: number[],
  ): number {
    if (studyDays.length === 0) return 0;
    let count = 0;
    const current = startOfDay(start);
    while (current <= endOfDay(end)) {
      if (studyDays.includes(current.getUTCDay())) count++;
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return count;
  }
}
