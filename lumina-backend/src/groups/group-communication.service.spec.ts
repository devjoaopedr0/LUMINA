import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GroupCommunicationService } from './group-communication.service';
import { GroupRoomEvents } from './group-room-events';

/** Filtro mínimo no formato do Prisma usado pelo serviço. */
function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'OR') return cond.some((c: any) => matches(row, c));
    const value = row[key];
    if (cond === undefined) return true;
    if (cond === null) return value === null || value === undefined;
    if (cond instanceof Date) return value?.getTime() === cond.getTime();
    if (typeof cond === 'object') {
      if ('in' in cond) return cond.in.includes(value);
      if ('notIn' in cond) return !cond.notIn.includes(value);
      if ('not' in cond) return value !== cond.not;
      if ('gte' in cond) return value >= cond.gte;
      if ('gt' in cond) return value > cond.gt;
      if ('lt' in cond) return value < cond.lt;
    }
    return value === cond;
  });
}

function fakeDb() {
  const users = new Map<string, any>();
  const members: any[] = [];
  const messages: any[] = [];
  const announcements: any[] = [];
  const reports: any[] = [];
  const notifications: any[] = [];
  const group = { id: randomUUID(), name: 'Medicina 2027', ownerId: '', archivedAt: null as Date | null };
  const userView = (id: string) => users.get(id);

  const table = (rows: any[], extra: (r: any) => any = (r) => r, defaults: Record<string, unknown> = {}) => ({
    findMany: async ({ where, take, orderBy }: any = {}) => {
      let out = rows.filter((r) => matches(r, where));
      if (orderBy?.createdAt === 'desc') out = [...out].sort((a, b) => b.createdAt - a.createdAt);
      if (orderBy?.createdAt === 'asc') out = [...out].sort((a, b) => a.createdAt - b.createdAt);
      return out.slice(0, take ?? Infinity).map(extra);
    },
    findFirst: async ({ where }: any) => {
      const r = rows.find((x) => matches(x, where));
      return r ? extra(r) : null;
    },
    count: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length,
    create: async ({ data }: any) => {
      const r = { id: randomUUID(), createdAt: new Date(), ...defaults, ...data };
      rows.push(r);
      return r;
    },
    update: async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data),
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
  });

  const db: any = {
    group, members, messages, announcements, reports, notifications,
    addUser(name: string, role: string | null, accountType = 'STUDENT_INDEPENDENT') {
      const id = randomUUID();
      users.set(id, { id, email: `${name}@x.com`, accountType, status: 'ACTIVE', profile: { firstName: name, lastName: null, avatarUrl: null } });
      if (role) members.push({ groupId: group.id, userId: id, role, status: 'ACTIVE', mutedUntil: null, chatLastReadAt: null });
      if (role === 'OWNER') group.ownerId = id;
      return id;
    },
    user: { findMany: async ({ where }: any) => [...users.values()].filter((u) => u.accountType === where.accountType).map((u) => ({ id: u.id })) },
    studyGroupMember: {
      ...table(members),
      findUnique: async ({ where }: any) => {
        const m = members.find((x) => x.groupId === where.groupId_userId.groupId && x.userId === where.groupId_userId.userId);
        return m ? { ...m, group } : null;
      },
      update: async ({ where, data }: any) => Object.assign(members.find((x) => x.userId === where.groupId_userId.userId), data),
    },
    groupMessage: table(messages, (m) => ({ ...m, author: userView(m.authorId) }), { hiddenAt: null, hiddenReason: null }),
    groupAnnouncement: table(announcements, (a) => ({ ...a, author: userView(a.authorId) })),
    groupReport: table(reports, (r) => ({
      ...r,
      targetUser: r.targetUserId ? userView(r.targetUserId) : null,
      message: r.messageId ? messages.find((m) => m.id === r.messageId) : null,
      group,
    }), { status: 'OPEN' }),
    notification: { createMany: async ({ data }: any) => { notifications.push(...data); return { count: data.length }; } },
    studyGroup: {
      findUnique: async () => ({ name: group.name, ownerId: group.ownerId, archivedAt: group.archivedAt }),
      update: async ({ data }: any) => Object.assign(group, data),
    },
  };
  return db;
}

const NOW = new Date('2026-11-18T18:00:00Z');
const later = (s: number) => new Date(NOW.getTime() + s * 1000);

describe('GroupCommunicationService', () => {
  let db: any;
  let service: GroupCommunicationService;
  let dono: string, mod: string, ana: string, bia: string, caio: string, admin: string;
  let changes: string[];

  beforeEach(() => {
    db = fakeDb();
    const events = new GroupRoomEvents();
    changes = [];
    events.subscribe((_id, kind) => changes.push(kind));
    service = new GroupCommunicationService(db as PrismaService, new NotificationsService(db as PrismaService), events);
    dono = db.addUser('Dono', 'OWNER');
    mod = db.addUser('Mod', 'MODERATOR');
    ana = db.addUser('Ana', 'MEMBER');
    bia = db.addUser('Bia', 'MEMBER');
    caio = db.addUser('Caio', 'MEMBER');
    admin = db.addUser('Admin', null, 'ADMIN');
  });

  it('envia, lista e avisa o tempo real; quem não é membro recebe 404', async () => {
    await service.send(ana, db.group.id, '  Alguém revisa genética comigo?  ', NOW);
    const chat = await service.chat(bia, db.group.id, {}, later(1));
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({ author: 'Ana', body: 'Alguém revisa genética comigo?', isMine: false, canReport: true, canHide: false });
    expect(changes).toContain('chat');
    await expect(service.chat(admin, db.group.id, {}, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa palavrão e contato fora da plataforma', async () => {
    await expect(service.send(ana, db.group.id, 'que p0rr4 de questão', NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.send(ana, db.group.id, 'me chama no (85) 99876-5432', NOW)).rejects.toThrow(/telefone, e-mail/);
    expect(db.messages).toHaveLength(0);
  });

  it('limite de envio contra spam', async () => {
    for (let i = 0; i < 6; i++) await service.send(ana, db.group.id, `msg ${i}`, later(i));
    await expect(service.send(ana, db.group.id, 'mais uma', later(7))).rejects.toBeInstanceOf(HttpException);
    await expect(service.send(ana, db.group.id, 'depois de 30 s', later(40))).resolves.toBeTruthy();
  });

  it('autor apaga a própria; membro não oculta a de outro; moderador não oculta a do dono', async () => {
    const own = await service.send(ana, db.group.id, 'oi', NOW);
    await expect(service.hide(bia, db.group.id, own.id, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await service.hide(ana, db.group.id, own.id, NOW);
    const fromOwner = await service.send(dono, db.group.id, 'regras do grupo', later(1));
    await expect(service.hide(mod, db.group.id, fromOwner.id, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const chat = await service.chat(bia, db.group.id, {}, later(2));
    expect(chat.messages[0]).toMatchObject({ body: null, hidden: 'author' });
  });

  it('moderador oculta, o autor é notificado e o texto não sai mais pela API', async () => {
    const m = await service.send(caio, db.group.id, 'mensagem chata', NOW);
    await service.hide(mod, db.group.id, m.id, later(1));
    expect(db.notifications.some((n: any) => n.userId === caio && n.kind === 'group.message_hidden')).toBe(true);
    const forMod = await service.chat(mod, db.group.id, {}, later(2));
    expect(forMod.messages[0]).toMatchObject({ body: null, hidden: 'moderator' });
  });

  it('silenciar: só quem está acima; silenciado não escreve até a hora', async () => {
    await expect(service.mute(ana, db.group.id, bia, 1, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.mute(mod, db.group.id, dono, 1, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await service.mute(mod, db.group.id, bia, 1, NOW);
    await expect(service.send(bia, db.group.id, 'oi', later(60))).rejects.toThrow(/silenciou você/);
    await expect(service.send(bia, db.group.id, 'voltei', later(3601))).resolves.toBeTruthy();
    expect(db.notifications.some((n: any) => n.userId === bia && n.kind === 'group.muted')).toBe(true);
  });

  it('3 denúncias de pessoas diferentes ocultam a mensagem; repetir a denúncia não conta duas vezes', async () => {
    const m = await service.send(caio, db.group.id, 'mensagem estranha', NOW);
    await service.report(ana, db.group.id, { targetType: 'MESSAGE', messageId: m.id, reason: 'assedio' }, later(1));
    await service.report(ana, db.group.id, { targetType: 'MESSAGE', messageId: m.id, reason: 'assedio' }, later(2));
    await service.report(bia, db.group.id, { targetType: 'MESSAGE', messageId: m.id, reason: 'spam' }, later(3));
    expect(db.messages[0].hiddenAt).toBeNull();
    const third = await service.report(dono, db.group.id, { targetType: 'MESSAGE', messageId: m.id, reason: 'ofensa' }, later(4));
    expect(third).toMatchObject({ autoHidden: true });
    expect(db.messages[0].hiddenReason).toBe('reports');
  });

  it('"não procede" devolve a mensagem que sumiu pelas denúncias e fecha as denúncias dela', async () => {
    const m = await service.send(caio, db.group.id, 'discordo da resolução', NOW);
    for (const who of [ana, bia, dono]) await service.report(who, db.group.id, { targetType: 'MESSAGE', messageId: m.id, reason: 'spam' }, later(1));
    const list = await service.reports(mod, db.group.id);
    expect(list).toHaveLength(3);
    expect(Object.keys(list[0])).not.toContain('reporterId');
    await service.resolveReport(mod, db.group.id, list[0].id, { action: 'dismiss' }, later(5));
    expect(db.messages[0].hiddenAt).toBeNull();
    expect(db.reports.every((r: any) => r.status === 'DISMISSED')).toBe(true);
  });

  it('moderador não vê denúncia contra si nem contra quem está acima; grupo e dono vão para a Lumina', async () => {
    await service.report(ana, db.group.id, { targetType: 'MEMBER', targetUserId: mod, reason: 'ofensa' }, NOW);
    await service.report(ana, db.group.id, { targetType: 'MEMBER', targetUserId: dono, reason: 'ofensa' }, NOW);
    await service.report(ana, db.group.id, { targetType: 'GROUP', reason: 'conteudo_improprio' }, NOW);
    await service.report(ana, db.group.id, { targetType: 'MEMBER', targetUserId: caio, reason: 'spam' }, NOW);
    expect((await service.reports(mod, db.group.id)).map((r: any) => r.targetName)).toEqual(['Caio']);
    expect((await service.reports(dono, db.group.id)).map((r: any) => r.targetName).sort()).toEqual(['Caio', 'Mod']);
    const forLumina = await service.adminReports('ADMIN');
    expect(forLumina.map((r: any) => r.targetType).sort()).toEqual(['GROUP', 'MEMBER']);
    expect(db.notifications.filter((n: any) => n.userId === admin && n.kind === 'group.report')).toHaveLength(2);
    await expect(service.adminReports('STUDENT_INDEPENDENT')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aviso: só moderação publica, todos os outros são notificados', async () => {
    await expect(service.announce(ana, db.group.id, 'Aviso', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const chat = await service.announce(mod, db.group.id, 'Simulado coletivo sábado às 9h', NOW);
    expect(chat.announcements[0]).toMatchObject({ body: 'Simulado coletivo sábado às 9h', author: 'Mod' });
    const notified = db.notifications.filter((n: any) => n.kind === 'group.announcement').map((n: any) => n.userId);
    expect(notified.sort()).toEqual([dono, ana, bia, caio].sort());
  });

  it('administração arquiva o grupo denunciado, encerra as denúncias e avisa o dono', async () => {
    await service.report(ana, db.group.id, { targetType: 'GROUP', reason: 'conteudo_improprio' }, NOW);
    await service.report(bia, db.group.id, { targetType: 'MEMBER', targetUserId: caio, reason: 'spam' }, NOW);
    const [groupReport] = await service.adminReports('ADMIN');
    const after = await service.adminResolve('ADMIN', admin, groupReport.id, { action: 'archive_group' }, later(10));
    expect(db.group.archivedAt).toEqual(later(10));
    expect(after).toHaveLength(0);
    expect(db.reports.every((r: any) => r.status === 'RESOLVED')).toBe(true);
    expect(db.notifications.some((n: any) => n.userId === dono && n.kind === 'group.archived_by_admin')).toBe(true);
    await expect(service.send(ana, db.group.id, 'oi', later(20))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('grupo arquivado: conversa só para leitura', async () => {
    db.group.archivedAt = NOW;
    await expect(service.send(ana, db.group.id, 'oi', NOW)).rejects.toBeInstanceOf(BadRequestException);
  });
});
