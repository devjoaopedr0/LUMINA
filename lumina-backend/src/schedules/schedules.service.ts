import { Injectable } from "@nestjs/common";
import { StudyTaskStatus, type Prisma } from "@prisma/client";
import { SchedulesRepository } from "./schedules.repository";
import { Db, SessionAllocation } from "./domain/types";
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

@Injectable()
export class SchedulesService {
  constructor(private readonly repo: SchedulesRepository) {}

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
    return this.repo.findTasks({
      scheduleId: schedule.id,
      status: params.status,
      subjectId: params.subjectId,
      page: params.page,
      limit: params.limit,
    });
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

    const schedule = await this.repo.prisma.$transaction(async (tx: Db) => {
      const scheduleRecord = await this.repo.createSchedule(tx, {
        userId,
        startDate,
        endDate,
        studyDays: dto.studyDays,
        dailyMinutes: dto.dailyMinutes,
        objective: dto.objective ?? null,
      });

      await this.repo.createScheduleSubjects(tx, scheduleRecord.id, dto.subjects);
      return scheduleRecord;
    });

    const scheduleWithSubjects = await this.repo.findScheduleById(schedule.id);
    const studyDays = scheduleWithSubjects!.studyDays as number[];
    const allocations = this.buildSessions(
      new Date(schedule.startDate),
      new Date(schedule.endDate),
      schedule.dailyMinutes,
      studyDays,
      dto.subjects,
    );

    await this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.createSessions(
        tx,
        schedule.id,
        allocations.map((a) => ({ date: a.date, scheduledMinutes: a.scheduledMinutes })),
      );

      const sessions = await tx.studySession.findMany({
        where: { scheduleId: schedule.id },
        orderBy: { date: "asc" },
      });

      const sessionSubjectAllocations: {
        sessionId: string;
        subjectId: string;
        estimatedMinutes: number;
      }[] = [];
      const tasks: Prisma.StudyTaskUncheckedCreateInput[] = [];

      for (const alloc of allocations) {
        const session = sessions.find(
          (s: { date: Date }) => s.date.getTime() === alloc.date.getTime(),
        );
        if (!session) continue;

        for (const subjAlloc of alloc.subjectAllocations) {
          sessionSubjectAllocations.push({
            sessionId: session.id,
            subjectId: subjAlloc.subjectId,
            estimatedMinutes: subjAlloc.estimatedMinutes,
          });

          if (subjAlloc.estimatedMinutes > 0) {
            const subject = scheduleWithSubjects!.scheduleSubjects.find(
              (ss: { subjectId: string }) => ss.subjectId === subjAlloc.subjectId,
            )?.subject;
            if (subject) {
              tasks.push({
                scheduleId: schedule.id,
                sessionId: session.id,
                subjectId: subjAlloc.subjectId,
                title: `${subject.name}: estudo programado`,
                description:
                  subject.name === "Redação"
                    ? "Revisão de redação e argumentos"
                    : `Conteúdo de ${subject.name}`,
                status: StudyTaskStatus.PENDING,
                scheduledMinutes: subjAlloc.estimatedMinutes,
              });
            }
          }
        }
      }

      await this.repo.createSessionSubjects(tx, sessionSubjectAllocations);
      await this.repo.createTasks(tx, tasks);

      const totalTasks = tasks.length;
      const totalScheduledMinutes = allocations.reduce(
        (sum: number, a: SessionAllocation) => sum + a.scheduledMinutes,
        0,
      );

      await this.repo.upsertProgress(tx, schedule.id, {
        completedMinutes: 0,
        totalScheduledMinutes,
        streakDays: 0,
        lastStudyDate: null,
        completedTasks: 0,
        totalTasks,
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
    const session = await this.repo.findSessionByDate(
      schedule.id,
      startOfDay(date),
    );
    return { schedule, session, tasks: session?.tasks ?? [] };
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

    return this.repo.createTask({
      scheduleId: session.scheduleId,
      sessionId: data.sessionId,
      subjectId: data.subjectId ?? null,
      title: data.title,
      description: data.description ?? null,
      scheduledMinutes: data.scheduledMinutes,
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
    }

    return this.repo.updateTask(taskId, update);
  }

  async deleteTask(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;
    await this.repo.deleteTask(taskId);
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
      const updated = await this.repo.updateTask(taskId, {
        status: StudyTaskStatus.DONE,
        completedAt: new Date(),
      }, tx);
      await this.updateProgress(tx, task.scheduleId);
      return updated;
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
    const progress = await this.repo.findProgressByScheduleId(schedule.id);
    return progress;
  }

  async getProgressEvolution(userId: string, days = 30) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    const endDate = endOfDay(new Date());
    const startDate = addDays(startOfDay(new Date()), -days);

    const sessions = await this.repo.findSessionsByRange(
      schedule.id,
      startDate,
      endDate,
    );

    const tasksByDate = await this.repo.findTasksByDateRange(
      schedule.id,
      startDate,
      endDate,
    );

    const dayKeys = eachDayOfInterval(startDate, endDate);

    const evolution = dayKeys.map((day) => {
      const dayKey = formatDate(day);
      const session = sessions.find(
        (s: { date: Date }) => formatDate(s.date) === dayKey,
      );
      const tasks = tasksByDate.filter(
        (t: { session: { date: Date }; status: StudyTaskStatus }) =>
          formatDate(t.session.date) === dayKey &&
          t.status === StudyTaskStatus.DONE,
      );
      return {
        date: dayKey,
        studyMinutes: session ? session.scheduledMinutes : 0,
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
      tx.studyTimeLog.findMany({ where: { task: { scheduleId } } }),
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
    for (let i = 0; i < datesWithCompletedTasks.length; i++) {
      const d = new Date(datesWithCompletedTasks[i]);
      d.setHours(12, 0, 0, 0);
      const todayStart = new Date(today);
      todayStart.setHours(12, 0, 0, 0);
      const diff = Math.round(
        (todayStart.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diff === streakDays) streakDays++;
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

  private buildSessions(
    startDate: Date,
    endDate: Date,
    dailyMinutes: number,
    studyDays: number[],
    dtoSubjects: { subjectId: string; targetHours: number }[],
  ): SessionAllocation[] {
    const result: SessionAllocation[] = [];

    const allDays = eachDayOfInterval(startDate, endDate);

    if (allDays.length === 0) return result;

    const studyDaySet = new Set(studyDays);
    const studyDaysFiltered = allDays.filter((d) =>
      studyDaySet.has(d.getUTCDay()),
    );

    if (studyDaysFiltered.length === 0) return result;

    const totalTargetHours = dtoSubjects.reduce(
      (sum, s) => sum + s.targetHours,
      0,
    );
    if (totalTargetHours === 0) return result;

    for (const day of studyDaysFiltered) {
      const allocations: { subjectId: string; estimatedMinutes: number }[] = [];

      for (const subj of dtoSubjects) {
        const proportion = subj.targetHours / totalTargetHours;
        const minutes = Math.round(dailyMinutes * proportion);
        allocations.push({
          subjectId: subj.subjectId,
          estimatedMinutes: minutes,
        });
      }

      result.push({
        date: startOfDay(day),
        scheduledMinutes: dailyMinutes,
        subjectAllocations: allocations,
      });
    }

    return result;
  }
}
