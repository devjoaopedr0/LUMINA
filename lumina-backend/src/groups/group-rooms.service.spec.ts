import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { SchedulesService } from '../schedules/schedules.service';
import { GroupRoomEvents } from './group-room-events';
import { GroupRoomsService } from './group-rooms.service';
import { ROOM_RULES } from './room-rules';

/** Filtro mínimo no formato do Prisma: igualdade, in, lt, lte, OR, none. */
function matches(row: any, where: any, ctx: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'OR') return cond.some((c: any) => matches(row, c, ctx));
    if (key === 'session') return matches(ctx.sessionOf(row), cond, ctx);
    if (key === 'participants') return !ctx.participantsOf(row).some((p: any) => matches(p, cond.none, ctx));
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('lt' in cond) return value < cond.lt;
      if ('lte' in cond) return value <= cond.lte;
    }
    return value === cond;
  });
}

function fakeDb() {
  const sessions: any[] = [];
  const participants: any[] = [];
  const members: any[] = [];
  const groups = new Map<string, any>();
  const users = new Map<string, any>();
  const subjects = [{ id: randomUUID(), name: 'Matemática', displayOrder: 1 }, { id: randomUUID(), name: 'Biologia', displayOrder: 2 }];

  const ctx = {
    sessionOf: (p: any) => sessions.find((s) => s.id === p.sessionId),
    participantsOf: (s: any) => participants.filter((p) => p.sessionId === s.id),
  };
  const withRelations = (p: any) => {
    const s = ctx.sessionOf(p);
    return {
      ...p,
      subject: subjects.find((x) => x.id === p.subjectId) ?? null,
      user: users.get(p.userId),
      session: { id: s.id, title: s.title, groupId: s.groupId, group: groups.get(s.groupId) },
    };
  };
  const sessionView = (s: any, select: any) => ({
    ...s,
    openedBy: users.get(s.openedById),
    participants: participants
      .filter((p) => p.sessionId === s.id && matches(p, select?.participants?.where, ctx))
      .map(withRelations),
  });

  const db: any = {
    sessions, participants, subjects,
    addUser(name: string) {
      const id = randomUUID();
      users.set(id, { email: `${name}@x.com`, profile: { firstName: name, lastName: null, avatarUrl: null } });
      return id;
    },
    addGroup(memberIds: string[], archived = false) {
      const id = randomUUID();
      groups.set(id, { id, name: 'Grupo ENEM', archivedAt: archived ? new Date() : null });
      for (const userId of memberIds) members.push({ groupId: id, userId, status: 'ACTIVE' });
      return id;
    },
    studyGroupMember: {
      findUnique: async ({ where }: any) => {
        const m = members.find((x) => x.groupId === where.groupId_userId.groupId && x.userId === where.groupId_userId.userId);
        return m ? { status: m.status, group: groups.get(m.groupId) } : null;
      },
    },
    studySubject: {
      findMany: async () => subjects,
      findUnique: async ({ where }: any) => subjects.find((s) => s.id === where.id) ?? null,
    },
    groupStudySession: {
      findMany: async ({ where, select, take }: any) =>
        sessions.filter((s) => matches(s, where, ctx)).slice(0, take ?? Infinity).map((s) => sessionView(s, select)),
      count: async ({ where }: any) => sessions.filter((s) => matches(s, where, ctx)).length,
      findUnique: async ({ where }: any) => sessions.find((s) => s.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        const s = sessions.find((x) => x.id === where.id);
        if (!s) throw new Error('not found');
        return s;
      },
      create: async ({ data }: any) => {
        const { participants: nested, ...rest } = data;
        const s = { id: randomUUID(), status: 'OPEN', endedAt: null, ...rest };
        sessions.push(s);
        participants.push(newParticipant({ sessionId: s.id, ...nested.create }));
        return s;
      },
      update: async ({ where, data }: any) => Object.assign(sessions.find((s) => s.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const rows = sessions.filter((s) => matches(s, where, ctx));
        rows.forEach((s) => Object.assign(s, data));
        return { count: rows.length };
      },
    },
    groupSessionParticipant: {
      findFirst: async ({ where }: any) => {
        const found = participants.filter((x) => matches(x, where, ctx));
        const p = found[found.length - 1];
        return p ? withRelations(p) : null;
      },
      findMany: async ({ where }: any) => participants.filter((x) => matches(x, where, ctx)).map(withRelations),
      create: async ({ data }: any) => {
        const p = newParticipant(data);
        participants.push(p);
        return p;
      },
      update: async ({ where, data }: any) => Object.assign(participants.find((p) => p.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const rows = participants.filter((p) => matches(p, where, ctx));
        rows.forEach((p) => Object.assign(p, data));
        return { count: rows.length };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return db;
}

function newParticipant(data: any) {
  return {
    id: randomUUID(), status: 'STUDYING', subjectId: null, showDetails: false, leftAt: null,
    accumulatedSeconds: 0, timeLogId: null, ...data,
  };
}

const T0 = new Date('2026-11-17T13:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

/** O app manda sinal a cada 30 s; simula isso de `from` até `to` (segundos). */
async function keepAlive(service: GroupRoomsService, userId: string, roomId: string, from: number, to: number) {
  for (let t = from + 30; t <= to; t += 30) await service.heartbeat(userId, roomId, at(t));
}

describe('GroupRoomsService', () => {
  let db: any;
  let service: GroupRoomsService;
  let logs: any[];
  let events: GroupRoomEvents;
  let ana: string;
  let bia: string;
  let caio: string;
  let groupId: string;

  beforeEach(() => {
    db = fakeDb();
    logs = [];
    const schedules = {
      logGroupSessionTime: vi.fn(async (input: any) => {
        const log = { id: randomUUID(), ...input };
        logs.push(log);
        return log;
      }),
    } as unknown as SchedulesService;
    events = new GroupRoomEvents();
    service = new GroupRoomsService(db as unknown as PrismaService, schedules, events);
    ana = db.addUser('Ana');
    bia = db.addUser('Bia');
    caio = db.addUser('Caio');
    groupId = db.addGroup([ana, bia]);
  });

  it('abre a sala, outro membro entra com a própria matéria e cada um vê o que pode', async () => {
    const [math, bio] = db.subjects;
    await service.open(ana, groupId, { title: 'Exatas', subjectId: math.id, showDetails: true }, at(0));
    const roomId = db.sessions[0].id;
    const state = await service.join(bia, roomId, { subjectId: bio.id }, at(60));

    expect(state.rooms).toHaveLength(1);
    const [annaView, biaView] = state.rooms[0].participants;
    // Bia vê a matéria e o tempo de Ana (que permitiu); vê o próprio tempo.
    expect(annaView).toMatchObject({ name: 'Ana', subject: 'Matemática', studiedSeconds: 60, presence: 'STUDYING' });
    expect(biaView).toMatchObject({ isMe: true, subject: 'Biologia', studiedSeconds: 0 });

    // Ana não vê a matéria de Bia (padrão desligado).
    const forAna = await service.state(ana, groupId, at(90));
    expect(forAna.rooms[0].participants[1]).toMatchObject({ name: 'Bia', subject: null, studiedSeconds: null, ticking: false });
  });

  it('pausa não conta; sair gera um StudyTimeLog com o tempo líquido e o vínculo da sessão', async () => {
    await service.open(ana, groupId, { subjectId: db.subjects[0].id }, at(0));
    const roomId = db.sessions[0].id;
    await keepAlive(service, ana, roomId, 0, 25 * 60);
    await service.pause(ana, roomId, at(25 * 60));
    await keepAlive(service, ana, roomId, 25 * 60, 35 * 60);
    await service.resume(ana, roomId, at(35 * 60));
    await keepAlive(service, ana, roomId, 35 * 60, 45 * 60);
    const out = await service.leave(ana, roomId, at(45 * 60));

    expect(out.loggedMinutes).toBe(35);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: ana, durationMinutes: 35, groupSessionId: roomId, subjectId: db.subjects[0].id });
    expect(db.participants[0]).toMatchObject({ status: 'LEFT', timeLogId: logs[0].id });
  });

  it('sair duas vezes não duplica o tempo', async () => {
    await service.open(ana, groupId, {}, at(0));
    const roomId = db.sessions[0].id;
    await keepAlive(service, ana, roomId, 0, 300);
    await service.leave(ana, roomId, at(300));
    await expect(service.leave(ana, roomId, at(310))).rejects.toBeInstanceOf(NotFoundException);
    expect(logs).toHaveLength(1);
  });

  it('um aluno fica em uma sala por vez', async () => {
    await service.open(ana, groupId, {}, at(0));
    const other = db.addGroup([ana]);
    await expect(service.open(ana, other, {}, at(10))).rejects.toBeInstanceOf(ConflictException);
  });

  it('quem some sai no último sinal: o tempo não infla', async () => {
    await service.open(ana, groupId, {}, at(0));
    const roomId = db.sessions[0].id;
    await keepAlive(service, ana, roomId, 0, 20 * 60);
    // Fechou o notebook: 2 horas sem sinal.
    const swept = await service.sweep(at(2 * 3600));
    expect(swept.closedParticipations).toBe(1);
    expect(logs[0].durationMinutes).toBe(20);
    expect(db.participants[0].leftAt).toEqual(at(20 * 60));
  });

  it('presença expirada recusa o sinal, salva o tempo e pede para entrar de novo', async () => {
    await service.open(ana, groupId, {}, at(0));
    const roomId = db.sessions[0].id;
    await keepAlive(service, ana, roomId, 0, 600);
    await expect(service.heartbeat(ana, roomId, at(600 + ROOM_RULES.offlineAfterSeconds + 5))).rejects.toBeInstanceOf(ConflictException);
    expect(logs[0].durationMinutes).toBe(10);
  });

  it('sala vazia fecha sozinha depois de 30 minutos e entra no histórico', async () => {
    await service.open(ana, groupId, { title: 'Noite' }, at(0));
    const roomId = db.sessions[0].id;
    await keepAlive(service, ana, roomId, 0, 1800);
    await service.leave(ana, roomId, at(1800));
    await service.sweep(at(1800 + 29 * 60));
    expect(db.sessions[0].status).toBe('OPEN');
    const state = await service.state(bia, groupId, at(1800 + 31 * 60));
    expect(state.rooms).toHaveLength(0);
    expect(state.history[0]).toMatchObject({ title: 'Noite', durationSeconds: 1800, participantCount: 1, myStudiedMinutes: null });
    const forAna = await service.state(ana, groupId, at(1800 + 31 * 60));
    expect(forAna.history[0].myStudiedMinutes).toBe(30);
  });

  it('trocar de matéria fecha o trecho na matéria antiga', async () => {
    const [math, bio] = db.subjects;
    await service.open(ana, groupId, { subjectId: math.id }, at(0));
    const roomId = db.sessions[0].id;
    await keepAlive(service, ana, roomId, 0, 15 * 60);
    await service.update(ana, roomId, { subjectId: bio.id }, at(15 * 60));
    expect(logs[0]).toMatchObject({ subjectId: math.id, durationMinutes: 15 });
    const mine = await service.current(ana, at(16 * 60));
    expect(mine.mine).toMatchObject({ subject: 'Biologia', status: 'STUDYING' });
  });

  it('quem não é membro não vê nem entra (404)', async () => {
    await service.open(ana, groupId, {}, at(0));
    await expect(service.state(caio, groupId, at(5))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.join(caio, db.sessions[0].id, {}, at(5))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('grupo arquivado não abre sala; arquivar fecha as abertas e salva o tempo', async () => {
    const archived = db.addGroup([ana], true);
    await expect(service.open(ana, archived, {}, at(0))).rejects.toBeInstanceOf(BadRequestException);

    await service.open(ana, groupId, {}, at(0));
    await keepAlive(service, ana, db.sessions[0].id, 0, 300);
    await service.closeAllInGroup(groupId, at(300));
    expect(db.sessions[0].status).toBe('CLOSED');
    expect(logs[0].durationMinutes).toBe(5);
  });

  it('limite de salas abertas por grupo', async () => {
    const people = Array.from({ length: ROOM_RULES.maxOpenRoomsPerGroup + 1 }, (_, i) => db.addUser(`p${i}`));
    const big = db.addGroup(people);
    for (let i = 0; i < ROOM_RULES.maxOpenRoomsPerGroup; i++) await service.open(people[i], big, {}, at(i));
    await expect(service.open(people[people.length - 1], big, {}, at(10))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('avisa o tempo real quando a sala muda (sem dados pessoais no aviso)', async () => {
    const seen: string[] = [];
    events.subscribe((id) => seen.push(id));
    await service.open(ana, groupId, {}, at(0));
    expect(seen).toEqual([groupId]);
  });
});
