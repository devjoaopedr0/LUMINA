import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SchedulesService } from '../schedules/schedules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { displayName } from '../groups/group-rules';
import {
  ROOM_RULES,
  leave as leaveClock,
  pause as pauseClock,
  presence,
  resume as resumeClock,
  roomDurationSeconds,
  studiedSeconds,
} from '../groups/room-rules';
import { ClassRoomEvents } from './class-room-events';

const NOT_FOUND = 'Turma não encontrada.';
const ACTIVE = ['STUDYING', 'PAUSED'] as const;
const STAFF_TYPES = ['COORDINATOR', 'DIRECTOR'];
const HISTORY_SIZE = 10;
const SWEEP_EVERY_MS = 60_000;

const participantSelect = {
  id: true, sessionId: true, userId: true, status: true, subjectId: true, joinedAt: true,
  lastHeartbeatAt: true, activeSince: true, accumulatedSeconds: true,
  subject: { select: { name: true } },
  user: { select: { email: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
} satisfies Prisma.ClassSessionParticipantSelect;

type ParticipantRow = Prisma.ClassSessionParticipantGetPayload<{ select: typeof participantSelect }>;
export type ClassRole = 'TEACHER' | 'STUDENT';

/**
 * Sala de estudo da turma (Fase 3, item 47). Mesmo motor de presença da sala
 * do Groups (room-rules): sinal a cada 30 s, saída no último sinal, tempo
 * líquido vira StudyTimeLog do aluno (com classSessionId como contexto).
 *
 * Professor (ou coordenação/direção da instituição) abre, encerra, liga uma
 * atividade da turma e acompanha cada aluno em tempo real: presença, tempo e
 * se já entregou a atividade. Alunos veem só quem está na sala e o status —
 * nunca o tempo ou a nota dos colegas.
 */
@Injectable()
export class ClassRoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClassRoomsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SchedulesService,
    private readonly events: ClassRoomEvents,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.VITEST) return;
    this.timer = setInterval(() => {
      this.sweep(new Date()).catch((error) => this.logger.warn(`Varredura das salas de turma falhou: ${(error as Error).message}`));
    }, SWEEP_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------ papel

  /** Professor da turma, coordenação/direção da instituição dela, ou aluno. */
  async roleIn(userId: string, classId: string): Promise<{ role: ClassRole; klass: { id: string; name: string; archived: boolean; workspaceId: string } }> {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true, name: true, archived: true, workspaceId: true,
        teachers: { where: { userId }, select: { id: true } },
        members: { where: { userId }, select: { id: true } },
      },
    });
    if (!klass) throw new NotFoundException(NOT_FOUND);
    const base = { id: klass.id, name: klass.name, archived: klass.archived, workspaceId: klass.workspaceId };
    if (klass.teachers.length) return { role: 'TEACHER', klass: base };
    const staff = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: klass.workspaceId, status: 'ACTIVE', user: { accountType: { in: STAFF_TYPES as Array<'COORDINATOR' | 'DIRECTOR'> } } },
      select: { id: true },
    });
    if (staff) return { role: 'TEACHER', klass: base };
    if (klass.members.length) return { role: 'STUDENT', klass: base };
    throw new NotFoundException(NOT_FOUND);
  }

  // ------------------------------------------------------------ leitura

  async state(userId: string, classId: string, now = new Date()) {
    const { role, klass } = await this.roleIn(userId, classId);
    await this.sweep(now, classId);
    const teacher = role === 'TEACHER';

    const [session, history, mine, subjects, activities] = await Promise.all([
      this.prisma.classStudySession.findFirst({
        where: { classId, status: 'OPEN' },
        select: {
          id: true, title: true, startedAt: true, endedAt: true, lastActivityAt: true,
          openedBy: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
          simulation: { select: { id: true, title: true, assessmentType: true, dueAt: true, _count: { select: { items: true } } } },
          participants: { where: { status: { in: [...ACTIVE] } }, orderBy: { joinedAt: 'asc' }, select: participantSelect },
        },
      }),
      this.prisma.classStudySession.findMany({
        where: { classId, status: 'CLOSED' },
        orderBy: { endedAt: 'desc' },
        take: HISTORY_SIZE,
        select: { id: true, title: true, startedAt: true, endedAt: true, participants: { select: { userId: true, accumulatedSeconds: true } } },
      }),
      this.myActive(userId),
      this.prisma.studySubject.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
      teacher
        ? this.prisma.simulation.findMany({
            where: { classId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true, title: true, assessmentType: true, dueAt: true },
          })
        : Promise.resolve([]),
    ]);

    // Entregas da atividade ligada: só o professor vê, por aluno.
    let submissions = new Map<string, { correct: number; total: number }>();
    let classSize = 0;
    if (session) {
      classSize = await this.prisma.classMember.count({ where: { classId } });
      if (teacher && session.simulation) {
        const rows = await this.prisma.simulationSubmission.findMany({ where: { simulationId: session.simulation.id }, select: { userId: true, correct: true, total: true } });
        submissions = new Map(rows.map((r) => [r.userId, { correct: r.correct, total: r.total }]));
      }
    }

    return {
      serverTime: now,
      role,
      class: { id: klass.id, name: klass.name, archived: klass.archived },
      rules: { heartbeatSeconds: ROOM_RULES.heartbeatSeconds, offlineAfterSeconds: ROOM_RULES.offlineAfterSeconds, closeEmptyAfterMinutes: ROOM_RULES.closeEmptyAfterMinutes },
      subjects,
      activities: activities.map((a) => ({ id: a.id, title: a.title, assessmentType: a.assessmentType, dueAt: a.dueAt })),
      mine: mine && mine.session.classId === classId ? this.mineView(mine, now) : null,
      elsewhere: mine && mine.session.classId !== classId ? { classId: mine.session.classId, className: mine.session.class.name } : null,
      session: session && {
        id: session.id,
        title: session.title,
        openedBy: displayName(session.openedBy),
        startedAt: session.startedAt,
        durationSeconds: roomDurationSeconds(session, now),
        activity: session.simulation && {
          id: session.simulation.id,
          title: session.simulation.title,
          assessmentType: session.simulation.assessmentType,
          questionCount: session.simulation._count.items,
          // Quantos da turma já entregaram (professor); o aluno vê só o dele.
          submittedCount: teacher ? submissions.size : null,
        },
        classSize,
        presentCount: session.participants.length,
        participants: session.participants.map((p) => {
          const isMe = p.userId === userId;
          const state = presence(p, now);
          const detailed = teacher || isMe;
          return {
            participantId: p.id,
            userId: p.userId,
            name: displayName(p.user),
            avatarUrl: p.user.profile?.avatarUrl ?? null,
            presence: state,
            isMe,
            subject: detailed ? p.subject?.name ?? null : null,
            studiedSeconds: detailed ? studiedSeconds(p, now) : null,
            ticking: detailed && state === 'STUDYING',
            activity: teacher && session.simulation ? submissions.get(p.userId) ?? null : null,
          };
        }),
      },
      history: history.map((h) => {
        const people = new Set(h.participants.map((p) => p.userId));
        const total = h.participants.reduce((sum, p) => sum + p.accumulatedSeconds, 0);
        const myseconds = h.participants.filter((p) => p.userId === userId).reduce((sum, p) => sum + p.accumulatedSeconds, 0);
        return {
          id: h.id,
          title: h.title,
          startedAt: h.startedAt,
          endedAt: h.endedAt,
          durationSeconds: roomDurationSeconds(h, now),
          participantCount: people.size,
          averageMinutes: teacher && people.size ? Math.round(total / people.size / 60) : null,
          myMinutes: people.has(userId) ? Math.floor(myseconds / 60) : null,
        };
      }),
    };
  }

  /** Minha passagem ativa numa sala de turma (para a barra global de presença). */
  async current(userId: string, now = new Date()) {
    const mine = await this.myActive(userId);
    if (!mine) return { mine: null };
    if (presence(mine, now) === 'OFFLINE') {
      await this.finish(mine, now);
      return { mine: null };
    }
    return { mine: { ...this.mineView(mine, now), classId: mine.session.classId, className: mine.session.class.name, roomTitle: mine.session.title } };
  }

  // ------------------------------------------------------------ professor

  async open(userId: string, classId: string, input: { title?: string | null; simulationId?: string | null }, now = new Date()) {
    const { role, klass } = await this.roleIn(userId, classId);
    if (role !== 'TEACHER') throw new NotFoundException(NOT_FOUND);
    if (klass.archived) throw new BadRequestException('A turma está arquivada.');
    await this.sweep(now, classId);
    const open = await this.prisma.classStudySession.findFirst({ where: { classId, status: 'OPEN' }, select: { id: true } });
    if (open) throw new ConflictException('A turma já tem uma sala aberta. Encerre a atual antes de abrir outra.');
    const simulationId = await this.validActivity(classId, input.simulationId);
    await this.prisma.classStudySession.create({
      data: { classId, title: input.title?.trim() || null, openedById: userId, simulationId, startedAt: now, lastActivityAt: now },
    });
    const members = await this.prisma.classMember.findMany({ where: { classId }, select: { userId: true } });
    await this.notifications?.notify(members.map((m) => m.userId), {
      kind: 'class.session_open',
      title: `Sala de estudo aberta na turma ${klass.name}`,
      body: input.title?.trim() || 'Entre para estudar junto com a turma.',
      link: `/app/turmas/${classId}/sala`,
    });
    this.events.changed(classId);
    return this.state(userId, classId, now);
  }

  async setActivity(userId: string, sessionId: string, simulationId: string | null, now = new Date()) {
    const session = await this.sessionFor(userId, sessionId, 'TEACHER');
    await this.prisma.classStudySession.update({ where: { id: sessionId }, data: { simulationId: await this.validActivity(session.classId, simulationId) } });
    this.events.changed(session.classId);
    return this.state(userId, session.classId, now);
  }

  /** Encerrar: todo mundo sai (o tempo vai para o histórico de cada um) e a sala fecha. */
  async close(userId: string, sessionId: string, now = new Date()) {
    const session = await this.sessionFor(userId, sessionId, 'TEACHER');
    const rows = await this.prisma.classSessionParticipant.findMany({ where: { sessionId, status: { in: [...ACTIVE] } }, select: participantSelect });
    for (const row of rows) await this.finish(row, now);
    await this.prisma.classStudySession.update({ where: { id: sessionId }, data: { status: 'CLOSED', endedAt: now } });
    this.events.changed(session.classId);
    return this.state(userId, session.classId, now);
  }

  // ------------------------------------------------------------ aluno

  async join(userId: string, sessionId: string, input: { subjectId?: string | null }, now = new Date()) {
    const session = await this.sessionFor(userId, sessionId, 'STUDENT');
    if (session.status === 'CLOSED') throw new BadRequestException('Esta sala já foi encerrada.');
    const already = await this.prisma.classSessionParticipant.findFirst({ where: { sessionId, userId, status: { in: [...ACTIVE] } } });
    if (!already) {
      await this.assertFreeToJoin(userId, now);
      const subjectId = input.subjectId ? (await this.prisma.studySubject.findUnique({ where: { id: input.subjectId }, select: { id: true } }))?.id ?? null : null;
      await this.prisma.$transaction([
        this.prisma.classSessionParticipant.create({ data: { sessionId, userId, subjectId, joinedAt: now, lastHeartbeatAt: now, activeSince: now } }),
        this.prisma.classStudySession.update({ where: { id: sessionId }, data: { lastActivityAt: now } }),
      ]);
      this.events.changed(session.classId);
    }
    return this.state(userId, session.classId, now);
  }

  async heartbeat(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    await this.prisma.classSessionParticipant.update({ where: { id: mine.id }, data: { lastHeartbeatAt: now } });
    return { ok: true, serverTime: now, studiedSeconds: studiedSeconds({ ...mine, lastHeartbeatAt: now }, now) };
  }

  async pause(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    if (mine.status === 'STUDYING') await this.prisma.classSessionParticipant.update({ where: { id: mine.id }, data: pauseClock(mine, now) });
    return this.after(userId, sessionId, now);
  }

  async resume(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    if (mine.status === 'PAUSED') await this.prisma.classSessionParticipant.update({ where: { id: mine.id }, data: resumeClock(now) });
    return this.after(userId, sessionId, now);
  }

  async leave(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    const result = await this.finish(mine, now);
    return { ...(await this.after(userId, sessionId, now)), loggedMinutes: result.loggedMinutes };
  }

  // ------------------------------------------------------------ varredura

  async sweep(now = new Date(), classId?: string) {
    const inClass = classId ? { session: { classId } } : {};
    const staleBefore = new Date(now.getTime() - ROOM_RULES.offlineAfterSeconds * 1000);
    const tooLongBefore = new Date(now.getTime() - ROOM_RULES.maxParticipationHours * 3600_000);
    const stale = await this.prisma.classSessionParticipant.findMany({
      where: { status: { in: [...ACTIVE] }, OR: [{ lastHeartbeatAt: { lt: staleBefore } }, { joinedAt: { lt: tooLongBefore } }], ...inClass },
      select: { ...participantSelect, session: { select: { classId: true } } },
    });
    const touched = new Set<string>();
    for (const row of stale) {
      await this.finish(row, now);
      touched.add(row.session.classId);
    }
    const closeBefore = new Date(now.getTime() - ROOM_RULES.closeEmptyAfterMinutes * 60_000);
    const idle = await this.prisma.classStudySession.findMany({
      where: { status: 'OPEN', lastActivityAt: { lte: closeBefore }, participants: { none: { status: { in: [...ACTIVE] } } }, ...(classId ? { classId } : {}) },
      select: { id: true, classId: true, lastActivityAt: true },
    });
    for (const room of idle) {
      await this.prisma.classStudySession.update({ where: { id: room.id }, data: { status: 'CLOSED', endedAt: room.lastActivityAt } });
      touched.add(room.classId);
    }
    for (const id of touched) this.events.changed(id);
    return { closedParticipations: stale.length, closedRooms: idle.length };
  }

  // ------------------------------------------------------------ apoio

  private async after(userId: string, sessionId: string, now: Date) {
    const session = await this.prisma.classStudySession.findUniqueOrThrow({ where: { id: sessionId }, select: { classId: true } });
    this.events.changed(session.classId);
    return this.state(userId, session.classId, now);
  }

  private async finish(row: ParticipantRow, now: Date): Promise<{ loggedMinutes: number }> {
    const out = leaveClock(row, now);
    const claimed = await this.prisma.classSessionParticipant.updateMany({
      where: { id: row.id, status: { in: [...ACTIVE] } },
      data: { status: 'LEFT', leftAt: out.leftAt, activeSince: null, accumulatedSeconds: out.accumulatedSeconds },
    });
    if (claimed.count === 0) return { loggedMinutes: 0 };
    await this.prisma.classStudySession.updateMany({ where: { id: row.sessionId, lastActivityAt: { lt: out.leftAt } }, data: { lastActivityAt: out.leftAt } });
    if (out.loggedMinutes > 0) {
      const log = await this.schedules.logGroupSessionTime({
        userId: row.userId,
        subjectId: row.subjectId,
        startTime: new Date(out.leftAt.getTime() - out.loggedMinutes * 60_000),
        endTime: out.leftAt,
        durationMinutes: out.loggedMinutes,
        classSessionId: row.sessionId,
      });
      await this.prisma.classSessionParticipant.update({ where: { id: row.id }, data: { timeLogId: log.id } });
    }
    return { loggedMinutes: out.loggedMinutes };
  }

  private mineView(p: ParticipantRow, now: Date) {
    return {
      participantId: p.id,
      sessionId: p.sessionId,
      status: p.status as 'STUDYING' | 'PAUSED',
      subjectId: p.subjectId,
      subject: p.subject?.name ?? null,
      studiedSeconds: studiedSeconds(p, now),
      ticking: p.status === 'STUDYING',
    };
  }

  private myActive(userId: string) {
    return this.prisma.classSessionParticipant.findFirst({
      where: { userId, status: { in: [...ACTIVE] } },
      orderBy: { joinedAt: 'desc' },
      select: { ...participantSelect, session: { select: { classId: true, title: true, class: { select: { name: true } } } } },
    });
  }

  /** Um aluno numa sala por vez — de turma OU de grupo, para o tempo não contar duas vezes. */
  private async assertFreeToJoin(userId: string, now: Date) {
    const mine = await this.myActive(userId);
    if (mine) {
      if (presence(mine, now) === 'OFFLINE') await this.finish(mine, now);
      else throw new ConflictException(`Você já está na sala da turma ${mine.session.class.name}. Saia dela antes.`);
    }
    const inGroup = await this.prisma.groupSessionParticipant.findFirst({
      where: { userId, status: { in: [...ACTIVE] }, lastHeartbeatAt: { gte: new Date(now.getTime() - ROOM_RULES.offlineAfterSeconds * 1000) } },
      select: { session: { select: { group: { select: { name: true } } } } },
    });
    if (inGroup) throw new ConflictException(`Você está numa sala do grupo ${inGroup.session.group.name}. Saia dela antes de entrar na sala da turma.`);
  }

  private async myParticipation(userId: string, sessionId: string, now: Date): Promise<ParticipantRow> {
    const session = await this.sessionFor(userId, sessionId, 'STUDENT');
    const mine = await this.prisma.classSessionParticipant.findFirst({ where: { sessionId, userId, status: { in: [...ACTIVE] } }, select: participantSelect });
    if (!mine) throw new NotFoundException('Você não está nesta sala.');
    if (presence(mine, now) === 'OFFLINE') {
      await this.finish(mine, now);
      this.events.changed(session.classId);
      throw new ConflictException('Sua presença na sala expirou por falta de sinal. O tempo até o último sinal foi salvo; entre de novo para continuar.');
    }
    return mine;
  }

  private async sessionFor(userId: string, sessionId: string, needed: ClassRole) {
    const session = await this.prisma.classStudySession.findUnique({ where: { id: sessionId }, select: { id: true, classId: true, status: true } });
    if (!session) throw new NotFoundException('Sala não encontrada.');
    const { role } = await this.roleIn(userId, session.classId).catch(() => {
      throw new NotFoundException('Sala não encontrada.');
    });
    if (role !== needed) {
      throw new BadRequestException(needed === 'TEACHER' ? 'Só o professor ou a coordenação controlam a sala.' : 'Professores acompanham a sala; quem estuda nela são os alunos.');
    }
    return session;
  }

  private async validActivity(classId: string, simulationId: string | null | undefined): Promise<string | null> {
    if (!simulationId) return null;
    const sim = await this.prisma.simulation.findFirst({ where: { id: simulationId, classId }, select: { id: true } });
    if (!sim) throw new BadRequestException('Escolha uma atividade desta turma.');
    return sim.id;
  }
}
