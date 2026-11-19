import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SchedulesService } from '../schedules/schedules.service';
import { displayName } from './group-rules';
import { GroupRoomEvents } from './group-room-events';
import { JoinRoomDto, OpenRoomDto, UpdateParticipationDto } from './group-rooms.dto';
import {
  ROOM_RULES,
  leave as leaveClock,
  pause as pauseClock,
  presence,
  resume as resumeClock,
  roomDurationSeconds,
  studiedSeconds,
  visibleParticipant,
} from './room-rules';

const NOT_FOUND = 'Grupo não encontrado.';
const ROOM_NOT_FOUND = 'Sala não encontrada.';
const ACTIVE = ['STUDYING', 'PAUSED'] as const;
const HISTORY_SIZE = 10;
const SWEEP_EVERY_MS = 60_000;

const participantSelect = {
  id: true,
  sessionId: true,
  userId: true,
  status: true,
  subjectId: true,
  showDetails: true,
  joinedAt: true,
  lastHeartbeatAt: true,
  activeSince: true,
  accumulatedSeconds: true,
  subject: { select: { name: true } },
  user: { select: { email: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
} satisfies Prisma.GroupSessionParticipantSelect;

type ParticipantRow = Prisma.GroupSessionParticipantGetPayload<{ select: typeof participantSelect }>;

/**
 * Salas coletivas do Lumina Groups (etapa 2). docs/LUMINA_GROUPS.md §2.3–§2.4.
 *
 * Regra contra tempo duplicado: a sala não guarda "horas" próprias. Quando o
 * aluno sai (ou some por 90 s), o tempo dele vira um StudyTimeLog comum, com
 * o vínculo da sessão como contexto — e só uma vez, mesmo com requisições
 * repetidas (a saída é "reivindicada" com um updateMany condicional).
 */
@Injectable()
export class GroupRoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupRoomsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SchedulesService,
    private readonly events: GroupRoomEvents,
  ) {}

  onModuleInit() {
    // Nos testes não há banco de verdade; a varredura roda só no servidor.
    if (process.env.VITEST) return;
    this.timer = setInterval(() => {
      this.sweep(new Date()).catch((error) => this.logger.warn(`Varredura das salas falhou: ${(error as Error).message}`));
    }, SWEEP_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------ leitura

  /** Salas abertas, histórico, minha passagem atual e as matérias para escolher. */
  async state(userId: string, groupId: string, now = new Date()) {
    await this.assertMember(userId, groupId);
    await this.sweep(now, groupId);

    const [open, closed, mine, subjects] = await Promise.all([
      this.prisma.groupStudySession.findMany({
        where: { groupId, status: 'OPEN' },
        orderBy: { startedAt: 'asc' },
        select: {
          id: true, title: true, startedAt: true, endedAt: true, lastActivityAt: true,
          openedBy: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
          participants: { where: { status: { in: [...ACTIVE] } }, orderBy: { joinedAt: 'asc' }, select: participantSelect },
        },
      }),
      this.prisma.groupStudySession.findMany({
        where: { groupId, status: 'CLOSED' },
        orderBy: { endedAt: 'desc' },
        take: HISTORY_SIZE,
        select: {
          id: true, title: true, startedAt: true, endedAt: true,
          participants: { select: { userId: true, accumulatedSeconds: true } },
        },
      }),
      this.myActive(userId),
      this.prisma.studySubject.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    ]);

    return {
      serverTime: now,
      rules: {
        heartbeatSeconds: ROOM_RULES.heartbeatSeconds,
        offlineAfterSeconds: ROOM_RULES.offlineAfterSeconds,
        closeEmptyAfterMinutes: ROOM_RULES.closeEmptyAfterMinutes,
        maxOpenRooms: ROOM_RULES.maxOpenRoomsPerGroup,
      },
      subjects,
      mine: mine ? this.mineView(mine, now) : null,
      rooms: open.map((room) => ({
        id: room.id,
        title: room.title,
        openedBy: displayName(room.openedBy),
        startedAt: room.startedAt,
        durationSeconds: roomDurationSeconds(room, now),
        // Sala vazia aguardando alguém: fecha sozinha depois de 30 min.
        closesAt: room.participants.length === 0
          ? new Date(room.lastActivityAt.getTime() + ROOM_RULES.closeEmptyAfterMinutes * 60_000)
          : null,
        iAmHere: room.participants.some((p) => p.userId === userId),
        participants: room.participants.map((p) => this.participantView(p, userId, now)),
      })),
      history: closed.map((room) => {
        const people = new Set(room.participants.map((p) => p.userId));
        const myseconds = room.participants.filter((p) => p.userId === userId).reduce((sum, p) => sum + p.accumulatedSeconds, 0);
        return {
          id: room.id,
          title: room.title,
          startedAt: room.startedAt,
          endedAt: room.endedAt,
          durationSeconds: roomDurationSeconds(room, now),
          participantCount: people.size,
          myStudiedMinutes: people.has(userId) ? Math.floor(myseconds / 60) : null,
        };
      }),
    };
  }

  /** Minha passagem ativa em qualquer grupo (um aluno só fica em uma sala por vez). */
  async current(userId: string, now = new Date()) {
    const mine = await this.myActive(userId);
    if (!mine) return { mine: null };
    if (presence(mine, now) === 'OFFLINE') {
      await this.finish(mine, now);
      return { mine: null };
    }
    return { mine: this.mineView(mine, now) };
  }

  // ------------------------------------------------------------ ações

  async open(userId: string, groupId: string, dto: OpenRoomDto, now = new Date()) {
    await this.assertMember(userId, groupId, { forChange: true });
    await this.sweep(now, groupId);
    const openCount = await this.prisma.groupStudySession.count({ where: { groupId, status: 'OPEN' } });
    if (openCount >= ROOM_RULES.maxOpenRoomsPerGroup) {
      throw new BadRequestException(`O grupo já tem ${ROOM_RULES.maxOpenRoomsPerGroup} salas abertas. Entre em uma delas.`);
    }
    await this.assertFreeToJoin(userId, now);
    const subjectId = await this.validSubject(dto.subjectId);

    await this.prisma.groupStudySession.create({
      data: {
        groupId,
        title: dto.title ?? null,
        openedById: userId,
        startedAt: now,
        lastActivityAt: now,
        participants: {
          create: { userId, subjectId, showDetails: dto.showDetails ?? false, joinedAt: now, lastHeartbeatAt: now, activeSince: now },
        },
      },
    });
    this.events.changed(groupId);
    return this.state(userId, groupId, now);
  }

  async join(userId: string, sessionId: string, dto: JoinRoomDto, now = new Date()) {
    const room = await this.roomFor(userId, sessionId, { forChange: true });
    if (room.status === 'CLOSED') throw new BadRequestException('Esta sala já foi encerrada. Abra outra.');
    const already = await this.prisma.groupSessionParticipant.findFirst({ where: { sessionId, userId, status: { in: [...ACTIVE] } } });
    if (!already) {
      await this.assertFreeToJoin(userId, now);
      const subjectId = await this.validSubject(dto.subjectId);
      await this.prisma.$transaction([
        this.prisma.groupSessionParticipant.create({
          data: { sessionId, userId, subjectId, showDetails: dto.showDetails ?? false, joinedAt: now, lastHeartbeatAt: now, activeSince: now },
        }),
        this.prisma.groupStudySession.update({ where: { id: sessionId }, data: { lastActivityAt: now } }),
      ]);
      this.events.changed(room.groupId);
    }
    return this.state(userId, room.groupId, now);
  }

  /** Sinal de vida a cada 30 s. Não avisa ninguém: a presença só muda quando falta. */
  async heartbeat(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    await this.prisma.groupSessionParticipant.update({ where: { id: mine.id }, data: { lastHeartbeatAt: now } });
    return { ok: true, serverTime: now, studiedSeconds: studiedSeconds({ ...mine, lastHeartbeatAt: now }, now) };
  }

  async pause(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    if (mine.status === 'STUDYING') {
      await this.prisma.groupSessionParticipant.update({ where: { id: mine.id }, data: pauseClock(mine, now) });
      this.events.changed(await this.groupOf(sessionId));
    }
    return this.state(userId, await this.groupOf(sessionId), now);
  }

  async resume(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    if (mine.status === 'PAUSED') {
      await this.prisma.groupSessionParticipant.update({ where: { id: mine.id }, data: resumeClock(now) });
      this.events.changed(await this.groupOf(sessionId));
    }
    return this.state(userId, await this.groupOf(sessionId), now);
  }

  /** Trocar a matéria fecha a passagem atual (o tempo vai para a matéria
   * antiga) e abre outra na mesma sala; mostrar ou esconder só atualiza. */
  async update(userId: string, sessionId: string, dto: UpdateParticipationDto, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    const groupId = await this.groupOf(sessionId);
    const subjectChanged = dto.subjectId !== undefined && (dto.subjectId ?? null) !== mine.subjectId;
    const showDetails = dto.showDetails ?? mine.showDetails;
    if (subjectChanged) {
      const subjectId = await this.validSubject(dto.subjectId);
      await this.finish(mine, now);
      await this.prisma.groupSessionParticipant.create({
        data: { sessionId, userId, subjectId, showDetails, joinedAt: now, lastHeartbeatAt: now, activeSince: now },
      });
    } else if (showDetails !== mine.showDetails) {
      await this.prisma.groupSessionParticipant.update({ where: { id: mine.id }, data: { showDetails } });
    }
    this.events.changed(groupId);
    return this.state(userId, groupId, now);
  }

  async leave(userId: string, sessionId: string, now = new Date()) {
    const mine = await this.myParticipation(userId, sessionId, now);
    const groupId = await this.groupOf(sessionId);
    const result = await this.finish(mine, now);
    this.events.changed(groupId);
    return { ...(await this.state(userId, groupId, now)), loggedMinutes: result.loggedMinutes };
  }

  // ------------------------------------------------------------ ganchos do grupo

  /** Quem sai (ou é removido) do grupo sai da sala; o tempo estudado fica dele. */
  async endForMember(groupId: string, userId: string, now = new Date()) {
    const rows = await this.prisma.groupSessionParticipant.findMany({
      where: { userId, status: { in: [...ACTIVE] }, session: { groupId } },
      select: participantSelect,
    });
    for (const row of rows) await this.finish(row, now);
    if (rows.length) this.events.changed(groupId);
  }

  /** Grupo arquivado: todo mundo sai e as salas fecham. */
  async closeAllInGroup(groupId: string, now = new Date()) {
    const rows = await this.prisma.groupSessionParticipant.findMany({
      where: { status: { in: [...ACTIVE] }, session: { groupId } },
      select: participantSelect,
    });
    for (const row of rows) await this.finish(row, now);
    await this.prisma.groupStudySession.updateMany({ where: { groupId, status: 'OPEN' }, data: { status: 'CLOSED', endedAt: now } });
    this.events.changed(groupId);
  }

  // ------------------------------------------------------------ varredura

  /** Fecha passagens sem sinal (no último sinal) e salas vazias há 30 min. */
  async sweep(now = new Date(), groupId?: string) {
    const inGroup = groupId ? { session: { groupId } } : {};
    const staleBefore = new Date(now.getTime() - ROOM_RULES.offlineAfterSeconds * 1000);
    const tooLongBefore = new Date(now.getTime() - ROOM_RULES.maxParticipationHours * 3600_000);
    const stale = await this.prisma.groupSessionParticipant.findMany({
      where: {
        status: { in: [...ACTIVE] },
        OR: [{ lastHeartbeatAt: { lt: staleBefore } }, { joinedAt: { lt: tooLongBefore } }],
        ...inGroup,
      },
      select: { ...participantSelect, session: { select: { groupId: true } } },
    });
    const touched = new Set<string>();
    for (const row of stale) {
      await this.finish(row, now);
      touched.add(row.session.groupId);
    }

    const closeBefore = new Date(now.getTime() - ROOM_RULES.closeEmptyAfterMinutes * 60_000);
    const idle = await this.prisma.groupStudySession.findMany({
      where: {
        status: 'OPEN',
        lastActivityAt: { lte: closeBefore },
        participants: { none: { status: { in: [...ACTIVE] } } },
        ...(groupId ? { groupId } : {}),
      },
      select: { id: true, groupId: true, lastActivityAt: true },
    });
    for (const room of idle) {
      await this.prisma.groupStudySession.update({ where: { id: room.id }, data: { status: 'CLOSED', endedAt: room.lastActivityAt } });
      touched.add(room.groupId);
    }
    for (const id of touched) this.events.changed(id);
    return { closedParticipations: stale.length, closedRooms: idle.length };
  }

  // ------------------------------------------------------------ apoio

  /** Encerra uma passagem e manda o tempo para o histórico pessoal, uma vez só. */
  private async finish(row: ParticipantRow, now: Date): Promise<{ loggedMinutes: number }> {
    const out = leaveClock(row, now);
    const claimed = await this.prisma.groupSessionParticipant.updateMany({
      where: { id: row.id, status: { in: [...ACTIVE] } },
      data: { status: 'LEFT', leftAt: out.leftAt, activeSince: null, accumulatedSeconds: out.accumulatedSeconds },
    });
    if (claimed.count === 0) return { loggedMinutes: 0 };

    await this.prisma.groupStudySession.updateMany({
      where: { id: row.sessionId, lastActivityAt: { lt: out.leftAt } },
      data: { lastActivityAt: out.leftAt },
    });
    if (out.loggedMinutes > 0) {
      const log = await this.schedules.logGroupSessionTime({
        userId: row.userId,
        subjectId: row.subjectId,
        startTime: new Date(out.leftAt.getTime() - out.loggedMinutes * 60_000),
        endTime: out.leftAt,
        durationMinutes: out.loggedMinutes,
        groupSessionId: row.sessionId,
      });
      await this.prisma.groupSessionParticipant.update({ where: { id: row.id }, data: { timeLogId: log.id } });
    }
    return { loggedMinutes: out.loggedMinutes };
  }

  private participantView(p: ParticipantRow, viewerId: string, now: Date) {
    const isMe = p.userId === viewerId;
    const state = presence(p, now);
    const visible = visibleParticipant(
      { subject: p.subject?.name ?? null, studiedSeconds: studiedSeconds(p, now) },
      p.showDetails,
      isMe,
    );
    return {
      participantId: p.id,
      userId: p.userId,
      name: displayName(p.user),
      avatarUrl: p.user.profile?.avatarUrl ?? null,
      presence: state,
      isMe,
      subject: visible.subject,
      studiedSeconds: visible.studiedSeconds,
      // O cronômetro anda no app a partir de serverTime só quando faz sentido.
      ticking: state === 'STUDYING' && visible.studiedSeconds !== null,
    };
  }

  private mineView(p: ParticipantRow & { session?: { id: string; title: string | null; group: { id: string; name: string } } }, now: Date) {
    return {
      participantId: p.id,
      sessionId: p.sessionId,
      roomTitle: p.session?.title ?? null,
      groupId: p.session?.group.id ?? null,
      groupName: p.session?.group.name ?? null,
      status: p.status as 'STUDYING' | 'PAUSED',
      subjectId: p.subjectId,
      subject: p.subject?.name ?? null,
      showDetails: p.showDetails,
      studiedSeconds: studiedSeconds(p, now),
      ticking: p.status === 'STUDYING',
    };
  }

  private myActive(userId: string) {
    return this.prisma.groupSessionParticipant.findFirst({
      where: { userId, status: { in: [...ACTIVE] } },
      orderBy: { joinedAt: 'desc' },
      select: { ...participantSelect, session: { select: { id: true, title: true, group: { select: { id: true, name: true } } } } },
    });
  }

  /** Um aluno só fica em uma sala por vez; passagem esquecida (sem sinal) é encerrada. */
  private async assertFreeToJoin(userId: string, now: Date) {
    await this.assertNotInClassRoom(userId, now);
    const mine = await this.myActive(userId);
    if (!mine) return;
    if (presence(mine, now) === 'OFFLINE') {
      await this.finish(mine, now);
      return;
    }
    throw new ConflictException(
      `Você já está estudando na sala${mine.session.title ? ` "${mine.session.title}"` : ''} do grupo ${mine.session.group.name}. Saia dela antes de entrar em outra.`,
    );
  }

  /** Sala da turma ativa (com sinal recente) também conta: o tempo não pode contar duas vezes. */
  private async assertNotInClassRoom(userId: string, now: Date) {
    const inClass = await this.prisma.classSessionParticipant?.findFirst({
      where: { userId, status: { in: [...ACTIVE] }, lastHeartbeatAt: { gte: new Date(now.getTime() - ROOM_RULES.offlineAfterSeconds * 1000) } },
      select: { session: { select: { class: { select: { name: true } } } } },
    });
    if (inClass) throw new ConflictException(`Você está na sala da turma ${inClass.session.class.name}. Saia dela antes de entrar numa sala de grupo.`);
  }

  /** Minha passagem ativa nesta sala; se ela expirou, fecha e avisa. */
  private async myParticipation(userId: string, sessionId: string, now: Date): Promise<ParticipantRow> {
    const room = await this.roomFor(userId, sessionId);
    const mine = await this.prisma.groupSessionParticipant.findFirst({
      where: { sessionId, userId, status: { in: [...ACTIVE] } },
      select: participantSelect,
    });
    if (!mine) throw new NotFoundException('Você não está nesta sala.');
    if (presence(mine, now) === 'OFFLINE') {
      await this.finish(mine, now);
      this.events.changed(room.groupId);
      throw new ConflictException('Sua presença na sala expirou por falta de sinal. O tempo até o último sinal foi salvo; entre de novo para continuar.');
    }
    return mine;
  }

  private async roomFor(userId: string, sessionId: string, options: { forChange?: boolean } = {}) {
    const room = await this.prisma.groupStudySession.findUnique({ where: { id: sessionId }, select: { id: true, groupId: true, status: true } });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);
    // Quem não é membro recebe o mesmo 404 da sala inexistente.
    await this.assertMember(userId, room.groupId, options).catch(() => {
      throw new NotFoundException(ROOM_NOT_FOUND);
    });
    return room;
  }

  private async groupOf(sessionId: string): Promise<string> {
    const room = await this.prisma.groupStudySession.findUniqueOrThrow({ where: { id: sessionId }, select: { groupId: true } });
    return room.groupId;
  }

  private async assertMember(userId: string, groupId: string, options: { forChange?: boolean } = {}) {
    const member = await this.prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true, group: { select: { archivedAt: true } } },
    });
    if (!member || member.status !== 'ACTIVE') throw new NotFoundException(NOT_FOUND);
    if (options.forChange && member.group.archivedAt) {
      throw new BadRequestException('O grupo está arquivado: as salas ficam fechadas.');
    }
  }

  private async validSubject(subjectId: string | null | undefined): Promise<string | null> {
    if (!subjectId) return null;
    const subject = await this.prisma.studySubject.findUnique({ where: { id: subjectId }, select: { id: true } });
    if (!subject) throw new BadRequestException('Matéria não encontrada.');
    return subject.id;
  }
}
