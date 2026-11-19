import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GroupRole, canModerate, dayKey, displayName, isMinor } from './group-rules';
import {
  ENGAGEMENT_RULES,
  GoalMetric,
  RankingMetric,
  RankingPeriod,
  achievements,
  buildRanking,
  currentStreak,
  goalProgress,
  keysBetween,
  longestStreak,
  minutesByUserDay,
  periodKeys,
  summarize,
} from './engagement-rules';
import { CreateGoalDto } from './group-engagement.dto';

const NOT_FOUND = 'Grupo não encontrado.';
const RECENT_FINISHED_GOALS = 5;

function shiftKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Início do dia (AAAA-MM-DD, Brasília) em UTC, para filtrar logs. */
function startOfKey(key: string): Date {
  return new Date(`${key}T03:00:00Z`);
}

/**
 * Engajamento do grupo (etapa 3): placar opcional, metas coletivas e
 * conquistas. Tudo sai do StudyTimeLog (fonte única); nada é gravado além
 * da definição das metas. docs/LUMINA_GROUPS.md §2.5 e §10.
 */
@Injectable()
export class GroupEngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string, groupId: string, options: { metric?: RankingMetric; period?: RankingPeriod } = {}, now = new Date()) {
    const metric: RankingMetric = options.metric ?? 'consistency';
    const period: RankingPeriod = options.period ?? 7;
    const group = await this.prisma.studyGroup.findUnique({
      where: { id: groupId },
      select: {
        archivedAt: true,
        members: {
          where: { status: 'ACTIVE' },
          select: {
            userId: true, role: true, rankingOptIn: true,
            user: { select: { email: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true, birthDate: true } } } },
          },
        },
        goals: {
          where: { cancelledAt: null, endDate: { gte: shiftKey(dayKey(now), -60) } },
          orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true, title: true, metric: true, target: true, startDate: true, endDate: true, createdAt: true,
            createdBy: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });
    const me = group?.members.find((m) => m.userId === userId);
    if (!group || !me) throw new NotFoundException(NOT_FOUND);

    const today = dayKey(now);
    const participants = group.members.filter((m) => m.rankingOptIn).map((m) => m.userId);
    const earliestGoal = group.goals.reduce((min, g) => (g.startDate < min ? g.startDate : min), today);
    const windowStart = [shiftKey(today, -(ENGAGEMENT_RULES.streakLookbackDays - 1)), earliestGoal].sort()[0];
    // Lê só quem participa, mais o próprio aluno (para as conquistas dele).
    const readable = [...new Set([...participants, userId])];
    const [logs, roomsJoined] = await Promise.all([
      this.prisma.studyTimeLog.findMany({
        where: { userId: { in: readable }, endTime: { gte: startOfKey(windowStart) } },
        select: { userId: true, endTime: true, durationMinutes: true },
      }),
      this.prisma.groupSessionParticipant.count({ where: { userId, session: { groupId } } }),
    ]);
    const byUser = minutesByUserDay(logs);

    const people = new Map(group.members.map((m) => [m.userId, m]));
    const ranking = buildRanking(participants, byUser, metric, period, now).map((entry) => {
      const m = people.get(entry.userId)!;
      return { ...entry, name: displayName(m.user), avatarUrl: m.user.profile?.avatarUrl ?? null, isMe: entry.userId === userId };
    });

    const active = group.goals.filter((g) => g.endDate >= today);
    const finished = group.goals.filter((g) => g.endDate < today).slice(0, RECENT_FINISHED_GOALS);
    let goalsHelped = 0;
    const goals = [...active.sort((a, b) => a.endDate.localeCompare(b.endDate)), ...finished].map((g) => {
      const progress = goalProgress({ metric: g.metric, target: g.target, startKey: g.startDate, endKey: g.endDate }, participants, byUser, now);
      const mine = me.rankingOptIn
        ? summarize(byUser.get(userId), keysBetween(g.startDate, g.endDate < today ? g.endDate : today))
        : null;
      const myPart = mine ? (g.metric === 'GROUP_MINUTES' ? mine.cappedMinutes : mine.activeDays) : null;
      if (progress.reached && myPart) goalsHelped++;
      return {
        id: g.id,
        title: g.title,
        metric: g.metric,
        target: g.target,
        startDate: g.startDate,
        endDate: g.endDate,
        createdBy: displayName(g.createdBy),
        ...progress,
        myContribution: myPart,
      };
    });

    const myDays = byUser.get(userId);
    return {
      serverTime: now,
      rules: {
        dailyCapHours: ENGAGEMENT_RULES.dailyCapMinutes / 60,
        minMinutesPerDay: ENGAGEMENT_RULES.minMinutesPerDay,
        maxActiveGoals: ENGAGEMENT_RULES.maxActiveGoals,
        goalMaxDays: ENGAGEMENT_RULES.goalMaxDays,
      },
      me: {
        rankingOptIn: me.rankingOptIn,
        // Aviso só para o próprio aluno: placar desligado por padrão para menores.
        iAmMinor: isMinor(me.user.profile?.birthDate, now),
      },
      canManageGoals: canModerate(me.role as GroupRole) && !group.archivedAt,
      ranking: { metric, period, participantCount: participants.length, entries: ranking },
      goals,
      achievements: achievements({
        roomsJoined,
        last7: summarize(myDays, periodKeys(7, now)),
        currentStreak: currentStreak(myDays, now),
        longestStreak: longestStreak(myDays, now),
        goalsHelped,
      }),
    };
  }

  async createGoal(userId: string, groupId: string, dto: CreateGoalDto, now = new Date()) {
    const member = await this.moderator(userId, groupId);
    if (member.archived) throw new BadRequestException('O grupo está arquivado.');
    const today = dayKey(now);
    const activeCount = await this.prisma.groupGoal.count({ where: { groupId, cancelledAt: null, endDate: { gte: today } } });
    if (activeCount >= ENGAGEMENT_RULES.maxActiveGoals) {
      throw new BadRequestException(`O grupo já tem ${ENGAGEMENT_RULES.maxActiveGoals} metas ativas. Espere uma terminar ou cancele uma delas.`);
    }
    const startDate = dto.startDate ?? today;
    if (startDate < today) throw new BadRequestException('A meta não pode começar no passado.');
    if (startDate > shiftKey(today, 30)) throw new BadRequestException('A meta precisa começar nos próximos 30 dias.');
    const endDate = shiftKey(startDate, dto.days - 1);
    await this.prisma.groupGoal.create({
      data: { groupId, title: dto.title, metric: dto.metric as GoalMetric, target: dto.target, startDate, endDate, createdById: userId },
    });
    return this.overview(userId, groupId, {}, now);
  }

  async cancelGoal(userId: string, groupId: string, goalId: string, now = new Date()) {
    await this.moderator(userId, groupId);
    const goal = await this.prisma.groupGoal.findFirst({ where: { id: goalId, groupId, cancelledAt: null } });
    if (!goal) throw new NotFoundException('Meta não encontrada.');
    await this.prisma.groupGoal.update({ where: { id: goalId }, data: { cancelledAt: now } });
    return this.overview(userId, groupId, {}, now);
  }

  private async moderator(userId: string, groupId: string) {
    const member = await this.prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true, role: true, group: { select: { archivedAt: true } } },
    });
    if (!member || member.status !== 'ACTIVE') throw new NotFoundException(NOT_FOUND);
    if (!canModerate(member.role as GroupRole)) throw new ForbiddenException('Só moderadores, administradores e o dono criam ou cancelam metas.');
    return { archived: member.group.archivedAt !== null };
  }
}
