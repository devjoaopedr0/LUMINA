import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { GroupsService } from './groups.service';

/**
 * Banco em memória só com o que o GroupsService usa (study_groups,
 * study_group_members, study_time_logs). Ignora `select` e devolve a linha
 * inteira, enriquecida com as relações que o serviço lê.
 */
function fakeDb() {
  const groups: any[] = [];
  const members: any[] = [];
  const logs: any[] = [];
  const users = new Map<string, any>();

  const groupOf = (id: string) => groups.find((g) => g.id === id) ?? null;
  const withUser = (m: any) => ({ ...m, user: users.get(m.userId), group: groupOf(m.groupId) });
  const matchMember = (where: any) => (m: any) =>
    (!where.groupId || m.groupId === where.groupId) &&
    (!where.userId || m.userId === where.userId) &&
    (!where.status || m.status === where.status) &&
    (!where.group || (where.group.archivedAt === null ? groupOf(m.groupId)?.archivedAt === null : true));
  const byKey = (where: any) =>
    where.id ? members.find((m) => m.id === where.id) : members.find((m) => m.groupId === where.groupId_userId.groupId && m.userId === where.groupId_userId.userId);
  const fullGroup = (g: any) =>
    g && {
      ...g,
      members: members.filter((m) => m.groupId === g.id).sort((a, b) => a.joinedAt - b.joinedAt).map(withUser),
    };

  const db: any = {
    users,
    logs,
    studyGroup: {
      count: async ({ where }: any) => groups.filter((g) => g.ownerId === where.ownerId && g.createdAt >= where.createdAt.gte).length,
      create: async ({ data }: any) => {
        if (groups.some((g) => g.joinCode === data.joinCode)) throw new Error('dup');
        const { members: nested, ...rest } = data;
        const g = { id: randomUUID(), archivedAt: null, createdAt: new Date(), ...rest };
        groups.push(g);
        members.push({ id: randomUUID(), groupId: g.id, joinedAt: new Date(), ...SHARE_OFF, ...nested.create });
        return g;
      },
      findUnique: async ({ where }: any) => groups.find((g) => (where.id ? g.id === where.id : g.joinCode === where.joinCode)) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        const g = fullGroup(groupOf(where.id));
        if (!g) throw new Error('not found');
        return g;
      },
      update: async ({ where, data }: any) => Object.assign(groupOf(where.id), stripUndefined(data)),
      delete: async ({ where }: any) => {
        groups.splice(groups.indexOf(groupOf(where.id)), 1);
        for (let i = members.length - 1; i >= 0; i--) if (members[i].groupId === where.id) members.splice(i, 1);
      },
    },
    studyGroupMember: {
      findMany: async ({ where }: any) =>
        members.filter(matchMember(where)).map((m) => {
          const g = groupOf(m.groupId);
          return { ...m, group: { ...g, _count: { members: members.filter((x) => x.groupId === g.id && x.status === 'ACTIVE').length } } };
        }),
      findUnique: async ({ where }: any) => byKey(where) ?? null,
      count: async ({ where }: any) => members.filter(matchMember(where)).length,
      create: async ({ data }: any) => {
        const m = { id: randomUUID(), joinedAt: new Date(), ...SHARE_OFF, ...data };
        members.push(m);
        return m;
      },
      update: async ({ where, data }: any) => Object.assign(byKey(where), stripUndefined(data)),
      delete: async ({ where }: any) => members.splice(members.indexOf(byKey(where)), 1),
    },
    studyTimeLog: {
      findMany: async ({ where }: any) => logs.filter((l) => where.userId.in.includes(l.userId) && l.endTime >= where.endTime.gte),
      groupBy: async ({ where }: any) => {
        const sums = new Map<string, number>();
        for (const l of logs) if (where.userId.in.includes(l.userId)) sums.set(l.userId, (sums.get(l.userId) ?? 0) + l.durationMinutes);
        return [...sums].map(([userId, sum]) => ({ userId, _sum: { durationMinutes: sum } }));
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return db;
}

const SHARE_OFF = { shareStudyTime: false, shareSubjects: false, shareStreak: false, shareLastActivity: false, rankingOptIn: false };
const stripUndefined = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

describe('GroupsService', () => {
  let db: ReturnType<typeof fakeDb>;
  let service: GroupsService;
  const ana = randomUUID();
  const bia = randomUUID();
  const caio = randomUUID();

  beforeEach(() => {
    process.env.JWT_SECRET = 'segredo-de-teste';
    db = fakeDb();
    for (const [id, name, birthDate] of [[ana, 'Ana', new Date('2000-01-01')], [bia, 'Bia', new Date('2010-05-05')], [caio, 'Caio', null]] as const) {
      db.users.set(id, { email: `${name.toLowerCase()}@x.dev`, profile: { firstName: name, lastName: null, avatarUrl: null, birthDate } });
    }
    service = new GroupsService(db as unknown as PrismaService);
  });

  it('cria o grupo com o criador como dono e entra por código', async () => {
    const group = await service.create(ana, { name: 'ENEM 2027' });
    expect(group.myRole).toBe('OWNER');
    expect(group.joinCode).toMatch(/^[A-Z2-9]{8}$/);

    const joined = await service.join(bia, { code: group.joinCode!.toLowerCase() });
    expect(joined).toMatchObject({ groupId: group.id, status: 'ACTIVE', alreadyMember: false });
    expect(await service.join(bia, { code: group.joinCode! })).toMatchObject({ alreadyMember: true });

    const list = await service.listMine(bia);
    expect(list).toEqual([expect.objectContaining({ id: group.id, myRole: 'MEMBER', memberCount: 2 })]);
  });

  it('quem não é membro recebe 404, não 403', async () => {
    const group = await service.create(ana, { name: 'Grupo fechado' });
    await expect(service.detail(caio, group.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('colegas veem só o que cada um ligou; o próprio aluno vê tudo', async () => {
    const group = await service.create(ana, { name: 'Medicina' });
    await service.join(bia, { code: group.joinCode! });
    const now = new Date();
    db.logs.push({ userId: bia, endTime: now, durationMinutes: 45, subject: { name: 'Física' } });
    db.logs.push({ userId: ana, endTime: now, durationMinutes: 30, subject: null });

    let seen = await service.detail(ana, group.id, now);
    const biaRow = () => seen.members.find((m) => m.userId === bia)!;
    expect(biaRow().stats).toEqual({ todayMinutes: null, weekMinutes: null, totalMinutes: null, subjects: null, streakDays: null, lastActivityAt: null });
    expect(seen.members.find((m) => m.isMe)!.stats.todayMinutes).toBe(30);

    await service.updateSharing(bia, group.id, { shareStudyTime: true });
    seen = await service.detail(ana, group.id, now);
    expect(biaRow().stats).toMatchObject({ todayMinutes: 45, totalMinutes: 45, subjects: null });

    // O aviso de menor de idade só aparece para o próprio aluno.
    expect((await service.detail(bia, group.id, now)).iAmMinor).toBe(true);
    expect(JSON.stringify(seen.members)).not.toContain('birthDate');
  });

  it('com aprovação ligada, a entrada fica pendente até um moderador aprovar', async () => {
    const group = await service.create(ana, { name: 'Redação', requiresApproval: true });
    expect(await service.join(bia, { code: group.joinCode! })).toMatchObject({ status: 'PENDING' });
    await expect(service.detail(bia, group.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.detail(ana, group.id)).pendingRequests).toEqual([expect.objectContaining({ userId: bia, name: 'Bia' })]);

    await service.approve(ana, group.id, bia);
    expect((await service.detail(bia, group.id)).myRole).toBe('MEMBER');
  });

  it('papéis: membro não promove nem remove; dono promove; administrador não remove o dono', async () => {
    const group = await service.create(ana, { name: 'Grupo' });
    await service.join(bia, { code: group.joinCode! });
    await service.join(caio, { code: group.joinCode! });

    await expect(service.changeRole(bia, group.id, caio, { role: 'MODERATOR' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeMember(bia, group.id, caio)).rejects.toBeInstanceOf(ForbiddenException);

    await service.changeRole(ana, group.id, bia, { role: 'ADMIN' });
    await expect(service.removeMember(bia, group.id, ana)).rejects.toBeInstanceOf(ForbiddenException);
    await service.removeMember(bia, group.id, caio);
    expect((await service.detail(ana, group.id)).members.map((m) => m.userId)).toEqual([ana, bia]);
  });

  it('o dono só sai depois de transferir a posse', async () => {
    const group = await service.create(ana, { name: 'Grupo' });
    await service.join(bia, { code: group.joinCode! });
    await expect(service.leave(ana, group.id)).rejects.toBeInstanceOf(BadRequestException);

    await service.transferOwnership(ana, group.id, bia);
    expect((await service.detail(bia, group.id)).myRole).toBe('OWNER');
    expect(await service.leave(ana, group.id)).toEqual({ left: true });
  });

  it('link de convite funciona até o código ser trocado', async () => {
    const group = await service.create(ana, { name: 'Grupo' });
    const { token } = await service.inviteLink(ana, group.id);
    expect((await service.preview({ token })).name).toBe('Grupo');
    await service.regenerateCode(ana, group.id);
    await expect(service.join(bia, { token })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('respeita o limite de membros e só exclui grupo arquivado', async () => {
    const group = await service.create(ana, { name: 'Dupla', maxMembers: 2 });
    await service.join(bia, { code: group.joinCode! });
    await expect(service.join(caio, { code: group.joinCode! })).rejects.toThrow('O grupo está cheio.');

    await expect(service.remove(ana, group.id)).rejects.toBeInstanceOf(BadRequestException);
    await service.setArchived(ana, group.id, true);
    await expect(service.join(caio, { code: group.joinCode! })).rejects.toBeInstanceOf(BadRequestException);
    expect(await service.remove(ana, group.id)).toEqual({ deleted: true });
  });

  it('limita a criação a 3 grupos por dia', async () => {
    for (let i = 0; i < 3; i++) await service.create(ana, { name: `Grupo ${i}` });
    await expect(service.create(ana, { name: 'Mais um' })).rejects.toThrow(/3 grupos nas últimas 24 horas/);
  });
});
