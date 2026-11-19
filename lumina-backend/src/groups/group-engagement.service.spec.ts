import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { GroupEngagementService } from './group-engagement.service';

// 18/11/2026, 15h em Brasília.
const NOW = new Date('2026-11-18T18:00:00Z');
const at = (key: string) => new Date(`${key}T18:00:00Z`);

function fakeDb() {
  const members: any[] = [];
  const goals: any[] = [];
  const logs: any[] = [];
  const participations: any[] = [];
  const group = { id: randomUUID(), archivedAt: null as Date | null };
  const user = (name: string, birthDate: Date | null = null) => ({ email: `${name}@x.com`, profile: { firstName: name, lastName: null, avatarUrl: null, birthDate } });
  const readLogs: string[][] = [];

  const db: any = {
    group, members, goals, logs, participations, readLogs,
    add(name: string, role = 'MEMBER', optIn = false, birthDate: Date | null = null) {
      const id = randomUUID();
      members.push({ groupId: group.id, userId: id, role, status: 'ACTIVE', rankingOptIn: optIn, user: user(name, birthDate) });
      return id;
    },
    studyGroup: {
      findUnique: async ({ where }: any) => {
        if (where.id !== group.id) return null;
        const today = '2026-11-18';
        return {
          archivedAt: group.archivedAt,
          members: members.filter((m) => m.status === 'ACTIVE'),
          goals: goals
            .filter((g) => g.cancelledAt === null && g.endDate >= '2026-09-19')
            .map((g) => ({ ...g, createdBy: user('Criador') }))
            .sort((a, b) => b.endDate.localeCompare(a.endDate) || (today ? 0 : 0)),
        };
      },
    },
    studyGroupMember: {
      findUnique: async ({ where }: any) => {
        const m = members.find((x) => x.userId === where.groupId_userId.userId && x.groupId === where.groupId_userId.groupId);
        return m ? { status: m.status, role: m.role, group: { archivedAt: group.archivedAt } } : null;
      },
    },
    studyTimeLog: {
      findMany: async ({ where }: any) => {
        readLogs.push(where.userId.in);
        return logs.filter((l) => where.userId.in.includes(l.userId) && l.endTime >= where.endTime.gte);
      },
    },
    groupSessionParticipant: { count: async ({ where }: any) => participations.filter((p) => p.userId === where.userId).length },
    groupGoal: {
      count: async ({ where }: any) => goals.filter((g) => g.cancelledAt === null && g.endDate >= where.endDate.gte).length,
      create: async ({ data }: any) => {
        const g = { id: randomUUID(), createdAt: new Date(), cancelledAt: null, ...data };
        goals.push(g);
        return g;
      },
      findFirst: async ({ where }: any) => goals.find((g) => g.id === where.id && g.cancelledAt === null) ?? null,
      update: async ({ where, data }: any) => Object.assign(goals.find((g) => g.id === where.id), data),
    },
  };
  return db;
}

describe('GroupEngagementService', () => {
  let db: any;
  let service: GroupEngagementService;
  let ana: string;
  let bia: string;
  let caio: string;

  beforeEach(() => {
    db = fakeDb();
    service = new GroupEngagementService(db as unknown as PrismaService);
    ana = db.add('Ana', 'OWNER', true);
    bia = db.add('Bia', 'MEMBER', true);
    caio = db.add('Caio', 'MEMBER', false);
    for (const key of ['2026-11-16', '2026-11-17', '2026-11-18']) db.logs.push({ userId: ana, endTime: at(key), durationMinutes: 60 });
    db.logs.push({ userId: bia, endTime: at('2026-11-18'), durationMinutes: 300 });
    db.logs.push({ userId: caio, endTime: at('2026-11-18'), durationMinutes: 999 });
  });

  it('placar só com quem participa; padrão é constância', async () => {
    const o = await service.overview(caio, db.group.id, {}, NOW);
    expect(o.ranking.metric).toBe('consistency');
    expect(o.ranking.entries.map((e: any) => [e.name, e.position])).toEqual([['Ana', 1], ['Bia', 2]]);
    expect(o.ranking.entries.some((e: any) => e.name === 'Caio')).toBe(false);
    expect(o.me.rankingOptIn).toBe(false);
  });

  it('não lê o tempo de quem está fora do placar (exceto o próprio aluno)', async () => {
    await service.overview(ana, db.group.id, {}, NOW);
    expect(db.readLogs[db.readLogs.length - 1].sort()).toEqual([ana, bia].sort());
  });

  it('meta coletiva soma só quem participa e mostra a contribuição do aluno', async () => {
    const o = await service.createGoal(ana, db.group.id, { title: 'Semana forte', metric: 'GROUP_MINUTES', target: 600, days: 7 }, NOW);
    const goal = o.goals[0];
    // Ana 60 (hoje) + Bia 300 = 360; Caio (fora do placar) não conta.
    expect(goal).toMatchObject({ value: 360, percent: 60, status: 'ACTIVE', contributors: 2, myContribution: 60, startDate: '2026-11-18', endDate: '2026-11-24' });
  });

  it('só moderador ou acima cria e cancela metas', async () => {
    await expect(service.createGoal(bia, db.group.id, { title: 'Meta', metric: 'GROUP_STUDY_DAYS', target: 5, days: 7 }, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const o = await service.createGoal(ana, db.group.id, { title: 'Meta', metric: 'GROUP_STUDY_DAYS', target: 5, days: 7 }, NOW);
    await expect(service.cancelGoal(bia, db.group.id, o.goals[0].id, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const after = await service.cancelGoal(ana, db.group.id, o.goals[0].id, NOW);
    expect(after.goals).toHaveLength(0);
  });

  it('limite de metas ativas e sem começar no passado', async () => {
    for (let i = 0; i < 3; i++) await service.createGoal(ana, db.group.id, { title: `Meta ${i}`, metric: 'GROUP_STUDY_DAYS', target: 5, days: 7 }, NOW);
    await expect(service.createGoal(ana, db.group.id, { title: 'Quarta', metric: 'GROUP_STUDY_DAYS', target: 5, days: 7 }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    db.goals.length = 0;
    await expect(service.createGoal(ana, db.group.id, { title: 'Ontem', metric: 'GROUP_STUDY_DAYS', target: 5, days: 7, startDate: '2026-11-17' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('conquistas do próprio aluno, inclusive fora do placar', async () => {
    db.participations.push({ userId: caio });
    const o = await service.overview(caio, db.group.id, {}, NOW);
    expect(o.achievements.filter((a: any) => a.earned).map((a: any) => a.code)).toEqual(['FIRST_ROOM']);
  });

  it('aviso de menor só para o próprio aluno; quem não é membro recebe 404', async () => {
    const teen = db.add('Teen', 'MEMBER', false, new Date('2012-01-01'));
    expect((await service.overview(teen, db.group.id, {}, NOW)).me.iAmMinor).toBe(true);
    await expect(service.overview(randomUUID(), db.group.id, {}, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
