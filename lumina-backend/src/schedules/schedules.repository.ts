import { Injectable } from "@nestjs/common";
import { Prisma, StudyTaskStatus } from "@prisma/client";
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
      },
    });
  }

  async findScheduleById(id: string) {
    return this.prisma.studySchedule.findUnique({
      where: { id },
      include: {
        scheduleSubjects: { include: { subject: true } },
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
      },
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

  async findSessionByDate(scheduleId: string, date: Date) {
    return this.prisma.studySession.findUnique({
      where: { scheduleId_date: { scheduleId, date } },
      include: {
        sessionSubjects: { include: { subject: true } },
        tasks: { include: { subject: true }, orderBy: { createdAt: "desc" } },
      },
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
        include: { subject: true, session: true },
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

  async findTaskById(id: string) {
    return this.prisma.studyTask.findUnique({
      where: { id },
      include: { subject: true, session: true, schedule: true },
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
      taskId: string;
      userId: string;
      startTime: Date;
    endTime: Date;
    durationMinutes: number;
    },
  ) {
    return tx.studyTimeLog.create({
      data: {
        taskId: data.taskId,
        userId: data.userId,
        startTime: data.startTime,
        endTime: data.endTime,
        durationMinutes: data.durationMinutes,
      },
    });
  }

  async findProgressByScheduleId(scheduleId: string) {
    return this.prisma.studyProgress.findUnique({ where: { scheduleId } });
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
        customName: data.customName ?? undefined,
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
