import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { SchedulesService } from '../schedules/schedules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClassRoomEvents } from './class-room-events';
import { ClassRoomsService } from './class-rooms.service';

function matches(row: any, where: any, ctx: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'OR') return cond.some((c: any) => matches(row, c, ctx));
    if (key === 'session') return matches(ctx.session(row), cond, ctx);
    if (key === 'participants') return !ctx.participantsOf(row).some((p: any) => matches(p, cond.none, ctx));
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('lt' in cond) return value < cond.lt;
      if ('lte' in cond) return value <= cond.lte;
      if ('gte' in cond) return value >= cond.gte;
    }
    return value === cond;
  });
}

function fakeDb() {
  const users = new Map<string, any>();
  const klass = { id: randomUUID(), name: '3º A', archived: false, workspaceId: 'ws', teachers: [] as string[], members: [] as string[] };
  const sessions: any[] = [];
  const participants: any[] = [];
  const submissions: any[] = [];
  const groupParticipants: any[] = [];
  const sims = [{ id: randomUUID(), classId: klass.id, title: 'Lista de funções', assessmentType: 'LIST', dueAt: null, items: 10 }];
  const ctx = { session: (p: any) => sessions.find((s) => s.id === p.sessionId), participantsOf: (s: any) => participants.filter((p) => p.sessionId === s.id) };
  const user = (id: string) => users.get(id);
  const withRel = (p: any) => ({ ...p, subject: null, user: user(p.userId), session: { ...ctx.session(p), class: { name: klass.name } } });

  const db: any = {
    klass, sessions, participants, submissions, groupParticipants, sims,
    add(name: string, kind: 'teacher' | 'student') {
      const id = randomUUID();
      users.set(id, { email: `${name}@x.com`, profile: { firstName: name, lastName: null, avatarUrl: null } });
      (kind === 'teacher' ? klass.teachers : klass.members).push(id);
      return id;
    },
    class: {
      findUnique: async ({ where }: any) => (where.id !== klass.id ? null : {
        ...klass,
        teachers: klass.teachers.includes(where.id) ? [] : [],
        members: [],
      }),
    },
    classMember: {
      findMany: async () => klass.members.map((userId) => ({ userId })),
      count: async () => klass.members.length,
    },
    workspaceMember: { findFirst: async () => null },
    studySubject: { findMany: async () => [], findUnique: async () => null },
    simulation: {
      findMany: async () => sims,
      findFirst: async ({ where }: any) => sims.find((s) => s.id === where.id && s.classId === where.classId) ?? null,
    },
    simulationSubmission: { findMany: async ({ where }: any) => submissions.filter((s) => s.simulationId === where.simulationId) },
    groupSessionParticipant: { findFirst: async ({ where }: any) => groupParticipants.find((g) => g.userId === where.userId) ?? null },
    classStudySession: {
      findFirst: async ({ where }: any) => {
        const s = sessions.find((x) => matches(x, where, ctx));
        return s ? {
          ...s,
          openedBy: user(s.openedById),
          simulation: s.simulationId ? (() => { const sim = sims.find((x) => x.id === s.simulationId)!; return { ...sim, _count: { items: sim.items } }; })() : null,
          participants: participants.filter((p) => p.sessionId === s.id && ['STUDYING', 'PAUSED'].includes(p.status)).map(withRel),
        } : null;
      },
      findMany: async ({ where }: any) => sessions.filter((s) => matches(s, where, ctx)).map((s) => ({ ...s, participants: participants.filter((p) => p.sessionId === s.id) })),
      findUnique: async ({ where }: any) => sessions.find((s) => s.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: any) => sessions.find((s) => s.id === where.id),
      create: async ({ data }: any) => { const s = { id: randomUUID(), status: 'OPEN', endedAt: null, simulationId: null, ...data }; sessions.push(s); return s; },
      update: async ({ where, data }: any) => Object.assign(sessions.find((s) => s.id === where.id), data),
      updateMany: async ({ where, data }: any) => { const r = sessions.filter((s) => matches(s, where, ctx)); r.forEach((s) => Object.assign(s, data)); return { count: r.length }; },
    },
    classSessionParticipant: {
      findFirst: async ({ where, orderBy }: any) => {
        const r = participants.filter((p) => matches(p, where, ctx));
        const p = orderBy ? r[r.length - 1] : r[0];
        return p ? withRel(p) : null;
      },
      findMany: async ({ where }: any) => participants.filter((p) => matches(p, where, ctx)).map(withRel),
      create: async ({ data }: any) => { const p = { id: randomUUID(), status: 'STUDYING', subjectId: null, accumulatedSeconds: 0, timeLogId: null, leftAt: null, ...data }; participants.push(p); return p; },
      update: async ({ where, data }: any) => Object.assign(participants.find((p) => p.id === where.id), data),
      updateMany: async ({ where, data }: any) => { const r = participants.filter((p) => matches(p, where, ctx)); r.forEach((p) => Object.assign(p, data)); return { count: r.length }; },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  // roleIn olha teachers/members filtrados pelo usuário.
  db.class.findUnique = async ({ where, select }: any) => {
    if (where.id !== klass.id) return null;
    const uid = select.teachers.where.userId;
    return { ...klass, teachers: klass.teachers.includes(uid) ? [{ id: 't' }] : [], members: klass.members.includes(uid) ? [{ id: 'm' }] : [] };
  };
  return db;
}

const T0 = new Date('2026-11-19T13:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

describe('ClassRoomsService (sala de estudo da turma)', () => {
  let db: any;
  let service: ClassRoomsService;
  let logs: any[];
  let notified: any[];
  let prof: string, ana: string, bia: string, outsider: string;

  const keepAlive = async (userId: string, sessionId: string, from: number, to: number) => {
    for (let t = from + 30; t <= to; t += 30) await service.heartbeat(userId, sessionId, at(t));
  };

  beforeEach(() => {
    db = fakeDb();
    logs = [];
    notified = [];
    const schedules = { logGroupSessionTime: vi.fn(async (input: any) => { const l = { id: randomUUID(), ...input }; logs.push(l); return l; }) } as unknown as SchedulesService;
    const notifications = { notify: vi.fn(async (ids: string[], n: any) => { notified.push({ ids, ...n }); }) } as unknown as NotificationsService;
    service = new ClassRoomsService(db as PrismaService, schedules, new ClassRoomEvents(), notifications);
    prof = db.add('Prof', 'teacher');
    ana = db.add('Ana', 'student');
    bia = db.add('Bia', 'student');
    outsider = randomUUID();
  });

  it('professor abre (alunos avisados); aluno não abre; uma sala por turma', async () => {
    await expect(service.open(ana, db.klass.id, {}, at(0))).rejects.toBeInstanceOf(NotFoundException);
    const st = await service.open(prof, db.klass.id, { title: 'Revisão de funções', simulationId: db.sims[0].id }, at(0));
    expect(st.session).toMatchObject({ title: 'Revisão de funções', activity: { title: 'Lista de funções', questionCount: 10, submittedCount: 0 } });
    expect(notified[0]).toMatchObject({ kind: 'class.session_open', link: `/app/turmas/${db.klass.id}/sala` });
    expect(notified[0].ids.sort()).toEqual([ana, bia].sort());
    await expect(service.open(prof, db.klass.id, {}, at(5))).rejects.toBeInstanceOf(ConflictException);
  });

  it('professor vê tempo e entrega de cada aluno; aluno não vê o tempo dos colegas', async () => {
    const st = await service.open(prof, db.klass.id, { simulationId: db.sims[0].id }, at(0));
    const sid = st.session!.id;
    await service.join(ana, sid, {}, at(0));
    await service.join(bia, sid, {}, at(0));
    await keepAlive(ana, sid, 0, 300);
    await keepAlive(bia, sid, 0, 300);
    db.submissions.push({ simulationId: db.sims[0].id, userId: ana, correct: 8, total: 10 });

    const forProf = await service.state(prof, db.klass.id, at(300));
    const anaRow = forProf.session!.participants.find((p: any) => p.name === 'Ana');
    expect(anaRow).toMatchObject({ studiedSeconds: 300, activity: { correct: 8, total: 10 } });
    expect(forProf.session!.activity!.submittedCount).toBe(1);

    const forBia = await service.state(bia, db.klass.id, at(300));
    const anaForBia = forBia.session!.participants.find((p: any) => p.name === 'Ana');
    expect(anaForBia).toMatchObject({ studiedSeconds: null, subject: null, activity: null, presence: 'STUDYING' });
    expect(forBia.session!.activity!.submittedCount).toBeNull();
  });

  it('professor não entra como aluno; quem não é da turma recebe 404', async () => {
    const st = await service.open(prof, db.klass.id, {}, at(0));
    await expect(service.join(prof, st.session!.id, {}, at(1))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.join(outsider, st.session!.id, {}, at(1))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('encerrar tira todos e manda o tempo para o histórico com o vínculo da sessão', async () => {
    const st = await service.open(prof, db.klass.id, {}, at(0));
    const sid = st.session!.id;
    await service.join(ana, sid, {}, at(0));
    await keepAlive(ana, sid, 0, 25 * 60);
    const after = await service.close(prof, sid, at(25 * 60));
    expect(after.session).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: ana, durationMinutes: 25, classSessionId: sid });
    expect(after.history[0]).toMatchObject({ participantCount: 1, averageMinutes: 25 });
  });

  it('quem está numa sala de grupo não entra na da turma (tempo não conta duas vezes)', async () => {
    const st = await service.open(prof, db.klass.id, {}, at(0));
    db.groupParticipants.push({ userId: ana, session: { group: { name: 'Amigos do ENEM' } } });
    await expect(service.join(ana, st.session!.id, {}, at(1))).rejects.toThrow(/sala do grupo Amigos do ENEM/);
  });

  it('atividade ligada precisa ser da turma', async () => {
    await expect(service.open(prof, db.klass.id, { simulationId: randomUUID() }, at(0))).rejects.toBeInstanceOf(BadRequestException);
  });
});
