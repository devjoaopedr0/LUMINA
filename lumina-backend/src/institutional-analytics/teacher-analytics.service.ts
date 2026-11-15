import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { enrichSignals, type PeriodStats } from './extra-signals';
import { manualTransition, planAlertSync, type AlertHistoryEntry, type AlertStatus, type StoredAlert } from './pedagogical-alerts';
import { PrismaService } from '../database/prisma.service';
import { TeacherAnalyticsQueryDto } from './teacher-analytics.dto';
import {
  buildTeacherAnalytics,
  TeacherAnalyticsClassInput,
  TeacherAnalyticsResult,
  TeacherAnalyticsStudyLog,
} from './teacher-analytics';

const DEFAULT_DAYS = 30;
/** Janela fixa dos alertas persistidos: não muda com o filtro do painel. */
export const ALERT_WINDOW_DAYS = 30;
const OVERDUE_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function displayName(user: {
  email: string;
  profile: { firstName: string | null; lastName: string | null } | null;
}): string {
  return [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') || user.email;
}

/**
 * Painel analítico do professor (fase 3).
 *
 * A consulta parte sempre das turmas em que o professor está vinculado. O
 * `classId` opcional é só um recorte: se a turma não for dele, a resposta é 404
 * para não revelar a existência da turma de outro professor.
 */
@Injectable()
export class TeacherAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async teacherAnalytics(
    userId: string,
    query: TeacherAnalyticsQueryDto,
    now: Date = new Date(),
  ): Promise<TeacherAnalyticsResult> {
    const teacher = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { teacherProfile: { select: { subject: true } } },
    });
    if (!teacher?.teacherProfile) {
      throw new ForbiddenException('Apenas professores podem acessar este painel.');
    }

    const days = query.days ?? DEFAULT_DAYS;
    const from = new Date(now.getTime() - days * DAY_MS);

    const classes = await this.prisma.class.findMany({
      where: {
        archived: false,
        teachers: { some: { userId } },
        ...(query.classId ? { id: query.classId } : {}),
      },
      select: {
        id: true,
        name: true,
        joinCode: true,
        members: {
          select: {
            joinedAt: true,
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        simulations: {
          where: {
            OR: [
              { createdAt: { gte: from } },
              { submissions: { some: { submittedAt: { gte: from } } } },
            ],
          },
          select: {
            id: true,
            title: true,
            items: {
              select: {
                position: true,
                questionId: true,
                stem: true,
                subject: true,
                correctPosition: true,
              },
            },
            submissions: {
              where: { submittedAt: { gte: from } },
              select: {
                userId: true,
                correct: true,
                total: true,
                submittedAt: true,
                answers: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (query.classId && classes.length === 0) {
      throw new NotFoundException('Turma não encontrada para este professor.');
    }

    const studentIds = [
      ...new Set(
        classes.flatMap((classRoom) => classRoom.members.map((member) => member.user.id)),
      ),
    ];
    const studyLogs: TeacherAnalyticsStudyLog[] = studentIds.length
      ? await this.prisma.studyTimeLog.findMany({
          where: {
            userId: { in: studentIds },
            startTime: { gte: from },
          },
          select: { userId: true, durationMinutes: true, startTime: true },
        })
      : [];

    const classInputs: TeacherAnalyticsClassInput[] = classes.map((classRoom) => ({
      id: classRoom.id,
      name: classRoom.name,
      joinCode: classRoom.joinCode,
      members: classRoom.members.map((member) => ({
        joinedAt: member.joinedAt,
        user: {
          id: member.user.id,
          name: displayName(member.user),
          email: member.user.email,
        },
      })),
      simulations: classRoom.simulations.map((simulation) => ({
        id: simulation.id,
        title: simulation.title,
        items: simulation.items,
        submissions: simulation.submissions,
      })),
    }));

    const result = buildTeacherAnalytics({ classes: classInputs, studyLogs, now, days });
    const context = await this.extraContext(classes.map((c) => c.id), studentIds, from, days, now);
    return { ...result, signals: enrichSignals(result, context) };
  }

  /** Dados fora da janela da turma: período anterior, atividade global e cronograma atrasado. */
  private async extraContext(classIds: string[], studentIds: string[], from: Date, days: number, now: Date) {
    const previous = new Map<string, Map<string, PeriodStats>>();
    const lastActivity = new Map<string, Date>();
    const overdueTasks = new Map<string, number>();
    if (!studentIds.length) return { now, previous, lastActivity, overdueTasks };

    const prevFrom = new Date(from.getTime() - days * DAY_MS);
    const overdueFrom = new Date(now.getTime() - OVERDUE_WINDOW_DAYS * DAY_MS);
    const yesterday = new Date(now.getTime() - DAY_MS);
    const [prevSubmissions, logs, attempts, submissions, overdue] = await Promise.all([
      this.prisma.simulationSubmission.findMany({
        where: { userId: { in: studentIds }, submittedAt: { gte: prevFrom, lt: from }, simulation: { classId: { in: classIds } } },
        select: { userId: true, correct: true, total: true, simulation: { select: { classId: true } } },
      }),
      this.prisma.studyTimeLog.groupBy({ by: ['userId'], where: { userId: { in: studentIds } }, _max: { startTime: true } }),
      this.prisma.questionAttempt.groupBy({ by: ['userId'], where: { userId: { in: studentIds } }, _max: { createdAt: true } }),
      this.prisma.simulationSubmission.groupBy({ by: ['userId'], where: { userId: { in: studentIds } }, _max: { submittedAt: true } }),
      this.prisma.studyTask.findMany({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          schedule: { userId: { in: studentIds } },
          session: { date: { gte: overdueFrom, lt: yesterday } },
        },
        select: { schedule: { select: { userId: true } } },
      }),
    ]);

    for (const sub of prevSubmissions) {
      const classId = sub.simulation.classId;
      if (!classId) continue;
      const byStudent = previous.get(classId) ?? new Map<string, PeriodStats>();
      const cur = byStudent.get(sub.userId) ?? { answers: 0, correct: 0 };
      cur.answers += sub.total;
      cur.correct += sub.correct;
      byStudent.set(sub.userId, cur);
      previous.set(classId, byStudent);
    }
    const bump = (userId: string, at: Date | null | undefined) => {
      if (!at) return;
      const cur = lastActivity.get(userId);
      if (!cur || at > cur) lastActivity.set(userId, at);
    };
    for (const r of logs) bump(r.userId, r._max.startTime);
    for (const r of attempts) bump(r.userId, r._max.createdAt);
    for (const r of submissions) bump(r.userId, r._max.submittedAt);
    for (const t of overdue) overdueTasks.set(t.schedule.userId, (overdueTasks.get(t.schedule.userId) ?? 0) + 1);
    return { now, previous, lastActivity, overdueTasks };
  }

  /**
   * Alertas persistidos do professor. Recalcula os sinais na janela fixa de
   * 30 dias (todas as turmas), sincroniza a tabela e devolve os alertas.
   */
  async alerts(userId: string, now: Date = new Date()) {
    const analytics = await this.teacherAnalytics(userId, { days: ALERT_WINDOW_DAYS }, now);
    const stored = await this.prisma.pedagogicalAlert.findMany({ where: { teacherId: userId } });
    const plan = planAlertSync(stored.map(toStored), analytics.signals, now);
    await this.prisma.$transaction([
      ...plan.create.map((a) =>
        this.prisma.pedagogicalAlert.create({ data: { ...a, teacherId: userId, history: a.history as unknown as Prisma.InputJsonValue } }),
      ),
      ...plan.update.map((u) =>
        this.prisma.pedagogicalAlert.update({
          where: { id: u.id },
          data: (({ history, ...rest }) => ({ ...rest, ...(history ? { history: history as unknown as Prisma.InputJsonValue } : {}) }))(u.data),
        }),
      ),
    ]);
    const closedSince = new Date(now.getTime() - 60 * DAY_MS);
    const items = await this.prisma.pedagogicalAlert.findMany({
      where: { teacherId: userId, OR: [{ status: { in: ['OPEN', 'ACKNOWLEDGED'] } }, { closedAt: { gte: closedSince } }] },
      orderBy: [{ lastSeenAt: 'desc' }],
    });
    const classNames = new Map(analytics.classes.map((c) => [c.id, c.name]));
    const studentNames = new Map(analytics.classes.flatMap((c) => c.students.map((st) => [st.id, st.name] as const)));
    return {
      generatedAt: now.toISOString(),
      windowDays: ALERT_WINDOW_DAYS,
      items: items.map((a) => ({
        id: a.id,
        kind: a.kind,
        severity: a.severity,
        status: a.status,
        classId: a.classId,
        className: a.classId ? classNames.get(a.classId) ?? null : null,
        studentId: a.studentId,
        studentName: a.studentId ? studentNames.get(a.studentId) ?? null : null,
        questionKey: a.questionKey,
        title: a.title,
        detail: a.detail,
        recommendation: a.recommendation,
        autoResolved: a.autoResolved,
        reopenCount: a.reopenCount,
        note: a.note,
        history: a.history as unknown as AlertHistoryEntry[],
        firstSeenAt: a.firstSeenAt.toISOString(),
        lastSeenAt: a.lastSeenAt.toISOString(),
        closedAt: a.closedAt?.toISOString() ?? null,
      })),
    };
  }

  /** O professor reconhece, resolve, dispensa ou reabre um alerta seu. */
  async updateAlert(userId: string, id: string, status: AlertStatus, note: string | undefined, now: Date = new Date()) {
    const alert = await this.prisma.pedagogicalAlert.findFirst({ where: { id, teacherId: userId } });
    if (!alert) throw new NotFoundException('Alerta não encontrado.');
    const data = manualTransition(toStored(alert), status, userId, note?.trim() || undefined, now);
    const saved = await this.prisma.pedagogicalAlert.update({
      where: { id },
      data: { ...data, history: data.history as unknown as Prisma.InputJsonValue },
    });
    return { id: saved.id, status: saved.status, note: saved.note, closedAt: saved.closedAt?.toISOString() ?? null };
  }
}

function toStored(a: { id: string; fingerprint: string; severity: string; status: string; reopenCount: number; history: unknown }): StoredAlert {
  return {
    id: a.id,
    fingerprint: a.fingerprint,
    severity: a.severity,
    status: a.status as AlertStatus,
    reopenCount: a.reopenCount,
    history: Array.isArray(a.history) ? (a.history as AlertHistoryEntry[]) : [],
  };
}
