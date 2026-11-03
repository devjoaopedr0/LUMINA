import { Injectable } from "@nestjs/common";
import { Prisma, StudyArea, StudyEssayFrequency, StudyTaskStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { Db } from "./domain/types";

@Injectable()
export class SchedulesRepository {
  constructor(public readonly prisma: PrismaService) {}

  async findStudySubjects() {
    return this.prisma.studySubject.findMany({
      orderBy: { displayOrder: "asc" },
    });
  }

  async findScheduleByUserId(userId: string) {
    return this.prisma.studySchedule.findUnique({
      where: { userId },
      include: {
        scheduleSubjects: { include: { subject: true } },
        dayMinutes: true,
      },
    });
  }

  async findScheduleById(id: string) {
    return this.prisma.studySchedule.findUnique({
      where: { id },
      include: {
        scheduleSubjects: { include: { subject: true } },
        dayMinutes: true,
      },
    });
  }

  async createSchedule(
    tx: Db,
    data: {
      userId: string;
      startDate: Date;
      endDate: Date;
      studyDays: number[];
      dailyMinutes: number;
      objective?: string | null;
      targetCourse?: string | null;
      priorityAreas?: StudyArea[];
      essayFrequency?: StudyEssayFrequency | null;
    },
  ) {
    return tx.studySchedule.create({
      data: {
        userId: data.userId,
        startDate: data.startDate,
        endDate: data.endDate,
        studyDays: data.studyDays,
        dailyMinutes: data.dailyMinutes,
        objective: data.objective ?? null,
        targetCourse: data.targetCourse ?? null,
        priorityAreas: data.priorityAreas ?? [],
        essayFrequency: data.essayFrequency ?? null,
      },
    });
  }

  /** Troca o tempo por dia da semana do cronograma (lista vazia = volta a
   *  valer `dailyMinutes` para todos os dias). */
  async replaceDayMinutes(
    tx: Db,
    scheduleId: string,
    rows: { weekday: number; minutes: number }[],
  ) {
    await tx.studyScheduleDayMinutes.deleteMany({ where: { scheduleId } });
    if (rows.length === 0) return;
    await tx.studyScheduleDayMinutes.createMany({
      data: rows.map((row) => ({ scheduleId, weekday: row.weekday, minutes: row.minutes })),
    });
  }

  async createScheduleSubjects(
    tx: Db,
    scheduleId: string,
    subjects: { subjectId: string; targetHours: number }[],
  ) {
    return tx.studyScheduleSubject.createMany({
      data: subjects.map((s) => ({
        scheduleId,
        subjectId: s.subjectId,
        targetHours: s.targetHours,
      })),
    });
  }

  async deleteSchedule(tx: Db, scheduleId: string) {
    return tx.studySchedule.delete({ where: { id: scheduleId } });
  }

  async deleteScheduleSubjects(tx: Db, scheduleId: string) {
    return tx.studyScheduleSubject.deleteMany({ where: { scheduleId } });
  }

  async createSessions(
    tx: Db,
    scheduleId: string,
    sessions: { date: Date; scheduledMinutes: number }[],
  ) {
    return tx.studySession.createMany({
      data: sessions.map((s) => ({
        scheduleId,
        date: s.date,
        scheduledMinutes: s.scheduledMinutes,
      })),
    });
  }

  async createSessionSubjects(
    tx: Db,
    sessionSubjectAllocations: {
      sessionId: string;
      subjectId: string;
      estimatedMinutes: number;
    }[],
  ) {
    return tx.studySessionSubject.createMany({
      data: sessionSubjectAllocations,
    });
  }

  async createTasks(tx: Db, tasks: Prisma.StudyTaskCreateManyInput[]) {
    return tx.studyTask.createMany({ data: tasks });
  }

  async findSessionByDate(scheduleId: string, date: Date, tx: Db = this.prisma) {
    return tx.studySession.findUnique({
      where: { scheduleId_date: { scheduleId, date } },
      include: {
        sessionSubjects: { include: { subject: true } },
        // `topic` vai junto: é dele que a tela tira o link para as questões
        // do tópico no banco de questões.
        tasks: { include: { subject: true, topic: true }, orderBy: { createdAt: "desc" } },
      },
    });
  }

  /** Sessões de um intervalo com as tarefas (e a matéria de cada uma) — base
   *  da visão semanal e do replanejamento. */
  async findSessionsWithTasks(scheduleId: string, from: Date, to: Date, tx: Db = this.prisma) {
    return tx.studySession.findMany({
      where: { scheduleId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      include: { tasks: { include: { subject: true } } },
    });
  }

  async findSessionById(id: string) {
    return this.prisma.studySession.findUnique({
      where: { id },
      include: {
        schedule: true,
        sessionSubjects: { include: { subject: true } },
        tasks: { include: { subject: true } },
      },
    });
  }

  async findTasks(params: {
    scheduleId: string;
    status?: string;
    subjectId?: string;
    page: number;
    limit: number;
  }) {
    const { scheduleId, status, subjectId, page, limit } = params;
    const where: Prisma.StudyTaskWhereInput = { scheduleId };
    if (status) where.status = status as StudyTaskStatus;
    if (subjectId) where.subjectId = subjectId;

    const [items, total] = await Promise.all([
      this.prisma.studyTask.findMany({
        where,
        include: { subject: true, topic: true, session: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.studyTask.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findTaskById(id: string, tx: Db = this.prisma) {
    return tx.studyTask.findUnique({
      where: { id },
      include: { subject: true, topic: true, session: true, schedule: true },
    });
  }

  async updateTask(id: string, data: Prisma.StudyTaskUncheckedUpdateInput, tx?: Db) {
    const prisma = tx ?? this.prisma;
    return prisma.studyTask.update({ where: { id }, data });
  }

  async createTask(data: Prisma.StudyTaskUncheckedCreateInput, tx: Db = this.prisma) {
    return tx.studyTask.create({ data });
  }

  async deleteTask(id: string, tx: Db = this.prisma) {
    return tx.studyTask.delete({ where: { id } });
  }

  async createTimeLog(
    tx: Db,
    data: {
      taskId?: string | null;
      subjectId?: string | null;
      userId: string;
      startTime: Date;
    endTime: Date;
    durationMinutes: number;
    },
  ) {
    return tx.studyTimeLog.create({
      data: {
        taskId: data.taskId ?? null,
        subjectId: data.subjectId ?? null,
        userId: data.userId,
        startTime: data.startTime,
        endTime: data.endTime,
        durationMinutes: data.durationMinutes,
      },
    });
  }

  /** Tarefas concluídas desde `since`, com o tempo medido nelas: o registrado
   *  na própria tarefa e, na de simulado, o início e o envio do simulado. */
  findMeasuredTasks(tx: Db, scheduleId: string, since: Date) {
    return tx.studyTask.findMany({
      where: { scheduleId, status: StudyTaskStatus.DONE, completedAt: { gte: since } },
      select: {
        activityType: true,
        scheduledMinutes: true,
        timeLogs: { select: { durationMinutes: true } },
        simulation: { select: { submissions: { select: { startedAt: true, submittedAt: true } } } },
      },
    });
  }

  async findProgressByScheduleId(scheduleId: string) {
    return this.prisma.studyProgress.findUnique({ where: { scheduleId } });
  }

  /**
   * Tempo registrado que pertence a um cronograma. Um registro pertence ao
   * cronograma quando aponta para uma tarefa dele OU para uma disciplina que
   * ele planeja — o segundo caso é o do cronômetro, que trabalha por matéria e
   * pode rodar num dia sem sessão programada.
   *
   * `client` precisa ser informado quando a leitura acontece dentro de uma
   * transação: pelo cliente raiz, o log recém-gravado ainda não aparece e o
   * progresso voltaria zerado logo no primeiro registro do dia.
   */
  timeLogsForSchedule(
    scheduleId: string,
    period?: { from: Date; to: Date },
    client: Db = this.prisma,
  ) {
    return client.studyTimeLog.findMany({
      where: {
        OR: [
          { task: { scheduleId } },
          { subject: { scheduleSubjects: { some: { scheduleId } } } },
        ],
        ...(period ? { endTime: { gte: period.from, lte: period.to } } : {}),
      },
    });
  }

  /** A disciplina pertence a este cronograma? Usado para validar o cronômetro. */
  async findScheduleSubjectById(scheduleId: string, subjectId: string) {
    return this.prisma.studyScheduleSubject.findFirst({
      where: { scheduleId, subjectId },
      include: { subject: true },
    });
  }

  async upsertProgress(
    tx: Db,
    scheduleId: string,
    data: {
      completedMinutes: number;
      totalScheduledMinutes: number;
      streakDays: number;
      lastStudyDate: Date | null;
      completedTasks: number;
      totalTasks: number;
    },
  ) {
    return tx.studyProgress.upsert({
      where: { scheduleId },
      update: data,
      create: { scheduleId, ...data },
    });
  }

  async findSessionsByRange(
    scheduleId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return this.prisma.studySession.findMany({
      where: { scheduleId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: "asc" },
      include: { sessionSubjects: { include: { subject: true } } },
    });
  }

  async findUserVestibular(userId: string) {
    return this.prisma.userVestibular.findUnique({
      where: { userId },
      include: { exam: true },
    });
  }

  async upsertUserVestibular(
    userId: string,
    data: {
      examId?: string | null;
      customName?: string | null;
      targetDate?: Date | null;
    },
  ) {
    return this.prisma.userVestibular.upsert({
      where: { userId },
      update: {
        examId: data.examId ?? null,
        customName: data.customName === undefined ? undefined : data.customName,
        targetDate: data.targetDate ?? null,
      },
      create: {
        userId,
        examId: data.examId ?? null,
        customName: data.customName ?? undefined,
        targetDate: data.targetDate ?? null,
      },
    });
  }

  async findTasksByDate(scheduleId: string, date: Date) {
    return this.prisma.studyTask.findMany({
      where: { schedule: { id: scheduleId }, session: { date } },
      include: { subject: true, session: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findTasksByDateRange(
    scheduleId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return this.prisma.studyTask.findMany({
      where: {
        scheduleId,
        session: { date: { gte: startDate, lte: endDate } },
      },
      include: { subject: true, session: true },
      orderBy: { session: { date: "asc" } },
    });
  }
}
