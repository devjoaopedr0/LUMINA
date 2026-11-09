import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TeacherAnalyticsQueryDto } from './teacher-analytics.dto';
import {
  buildTeacherAnalytics,
  TeacherAnalyticsClassInput,
  TeacherAnalyticsResult,
  TeacherAnalyticsStudyLog,
} from './teacher-analytics';

const DEFAULT_DAYS = 30;
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
  ): Promise<TeacherAnalyticsResult> {
    const teacher = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { teacherProfile: { select: { subject: true } } },
    });
    if (!teacher?.teacherProfile) {
      throw new ForbiddenException('Apenas professores podem acessar este painel.');
    }

    const days = query.days ?? DEFAULT_DAYS;
    const now = new Date();
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

    return buildTeacherAnalytics({ classes: classInputs, studyLogs, now, days });
  }
}
