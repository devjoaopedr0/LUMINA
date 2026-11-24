import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { checkMessage } from './content-filter';
import { GroupRoomEvents } from './group-room-events';
import { GroupRole, ROLE_RANK, canModerate, canRemoveMember, displayName } from './group-rules';
import type { CreateReportDto, ResolveReportDto } from './group-communication.dto';

const NOT_FOUND = 'Grupo não encontrado.';
const PAGE = 50;
const ANNOUNCEMENTS_SHOWN = 3;

export const CHAT_RULES = {
  /** Mensagens por pessoa a cada 30 s (contra spam). */
  maxMessagesPer30s: 6,
  /** Denúncias de pessoas diferentes que ocultam a mensagem até a revisão. */
  hideAfterReports: 3,
  /** Opções de silenciamento, em horas. */
  muteHours: [1, 24, 168] as const,
} as const;

export const REPORT_REASONS = ['ofensa', 'assedio', 'spam', 'conteudo_improprio', 'dados_pessoais', 'outro'] as const;

type Member = { userId: string; role: GroupRole; status: string; mutedUntil: Date | null };

const userSelect = { email: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } as const;

/**
 * Comunicação do Lumina Groups (etapa 4): chat com moderação, avisos,
 * denúncias e notificações. docs/LUMINA_GROUPS.md §2.6 e §11.
 *
 * Chat aberto a todas as idades (decisão de 18/11/2026), por isso: filtro de
 * palavras, bloqueio de telefone/e-mail, limite de envio, ocultar, silenciar
 * e ocultação automática com 3 denúncias.
 */
@Injectable()
export class GroupCommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: GroupRoomEvents,
  ) {}

  // ------------------------------------------------------------ chat

  async chat(userId: string, groupId: string, options: { before?: Date } = {}, now = new Date()) {
    const { me, group } = await this.member(userId, groupId);
    const rows = await this.prisma.groupMessage.findMany({
      where: { groupId, ...(options.before ? { createdAt: { lt: options.before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
      select: { id: true, authorId: true, body: true, createdAt: true, hiddenAt: true, hiddenReason: true, author: { select: userSelect } },
    });
    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE).reverse();
    const roles = await this.roles(groupId);
    const myRank = ROLE_RANK[me.role];

    const [announcements, openReports] = await Promise.all([
      this.prisma.groupAnnouncement.findMany({
        where: { groupId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: ANNOUNCEMENTS_SHOWN,
        select: { id: true, body: true, createdAt: true, author: { select: userSelect } },
      }),
      canModerate(me.role) ? this.visibleReportsWhere(groupId, me).then((where) => this.prisma.groupReport.count({ where })) : Promise.resolve(0),
    ]);
    if (!options.before) {
      await this.prisma.studyGroupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { chatLastReadAt: now } });
    }

    return {
      serverTime: now,
      archived: group.archivedAt !== null,
      me: {
        canModerate: canModerate(me.role),
        mutedUntil: me.mutedUntil && me.mutedUntil > now ? me.mutedUntil : null,
      },
      rules: { muteHours: CHAT_RULES.muteHours, reasons: REPORT_REASONS },
      openReports,
      announcements: announcements.map((a) => ({ id: a.id, body: a.body, createdAt: a.createdAt, author: displayName(a.author) })),
      hasMore,
      messages: page.map((m) => {
        const authorRole = roles.get(m.authorId) ?? null;
        const isMine = m.authorId === userId;
        return {
          id: m.id,
          authorId: m.authorId,
          author: displayName(m.author),
          avatarUrl: m.author.profile?.avatarUrl ?? null,
          authorRole,
          isMine,
          createdAt: m.createdAt,
          // Oculta: ninguém lê o texto pela API (nem quem modera).
          body: m.hiddenAt ? null : m.body,
          hidden: m.hiddenAt ? (m.hiddenReason as 'author' | 'moderator' | 'reports') : null,
          canHide: !m.hiddenAt && (isMine || (canModerate(me.role) && (authorRole === null || ROLE_RANK[authorRole] < myRank))),
          canReport: !m.hiddenAt && !isMine,
          canMute: !isMine && authorRole !== null && canModerate(me.role) && canRemoveMember(me.role, authorRole),
        };
      }),
    };
  }

  async send(userId: string, groupId: string, rawBody: string, now = new Date()) {
    const { me, group } = await this.member(userId, groupId);
    if (group.archivedAt) throw new BadRequestException('O grupo está arquivado: a conversa fica só para leitura.');
    if (me.mutedUntil && me.mutedUntil > now) {
      throw new ForbiddenException(`Um moderador silenciou você no chat até ${formatTime(me.mutedUntil)}.`);
    }
    const body = rawBody.trim();
    if (!body) throw new BadRequestException('Escreva uma mensagem.');
    const verdict = checkMessage(body);
    if (!verdict.ok) throw new BadRequestException(verdict.message);
    const recent = await this.prisma.groupMessage.count({
      where: { groupId, authorId: userId, createdAt: { gte: new Date(now.getTime() - 30_000) } },
    });
    if (recent >= CHAT_RULES.maxMessagesPer30s) {
      throw new HttpException('Calma: espere alguns segundos antes de mandar outra mensagem.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const message = await this.prisma.groupMessage.create({ data: { groupId, authorId: userId, body, createdAt: now } });
    await this.prisma.studyGroupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { chatLastReadAt: now } });
    this.events.changed(groupId, 'chat');
    return { id: message.id, createdAt: message.createdAt };
  }

  /** O autor apaga a própria; moderador oculta a de quem está abaixo dele. */
  async hide(userId: string, groupId: string, messageId: string, now = new Date()) {
    const { me, group } = await this.member(userId, groupId);
    const message = await this.prisma.groupMessage.findFirst({ where: { id: messageId, groupId }, select: { id: true, authorId: true, hiddenAt: true } });
    if (!message) throw new NotFoundException('Mensagem não encontrada.');
    if (message.hiddenAt) return { hidden: true };
    const isMine = message.authorId === userId;
    if (!isMine) {
      const authorRole = (await this.roles(groupId)).get(message.authorId) ?? null;
      const allowed = canModerate(me.role) && (authorRole === null || ROLE_RANK[authorRole] < ROLE_RANK[me.role]);
      if (!allowed) throw new ForbiddenException('Seu papel não permite ocultar esta mensagem.');
    }
    await this.prisma.groupMessage.update({
      where: { id: messageId },
      data: { hiddenAt: now, hiddenById: userId, hiddenReason: isMine ? 'author' : 'moderator' },
    });
    if (!isMine) {
      await this.notifications.notify([message.authorId], {
        kind: 'group.message_hidden',
        title: `Uma mensagem sua foi ocultada em ${group.name}`,
        body: 'Um moderador ocultou a mensagem por não seguir as regras do grupo.',
        link: `/app/grupos/${groupId}`,
      });
    }
    this.events.changed(groupId, 'chat');
    return { hidden: true };
  }

  /** Silenciar (1 h, 24 h ou 7 dias) ou liberar (0). Só quem está acima. */
  async mute(userId: string, groupId: string, targetUserId: string, hours: number, now = new Date()) {
    const { me, group } = await this.member(userId, groupId);
    if (!canModerate(me.role)) throw new ForbiddenException('Só moderadores silenciam membros.');
    if (hours !== 0 && !(CHAT_RULES.muteHours as readonly number[]).includes(hours)) throw new BadRequestException('Escolha 1 h, 24 h ou 7 dias.');
    const target = await this.prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: targetUserId } }, select: { role: true, status: true } });
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('Membro não encontrado.');
    if (!canRemoveMember(me.role, target.role as GroupRole)) throw new ForbiddenException('Seu papel não permite silenciar este membro.');
    const mutedUntil = hours === 0 ? null : new Date(now.getTime() + hours * 3600_000);
    await this.prisma.studyGroupMember.update({ where: { groupId_userId: { groupId, userId: targetUserId } }, data: { mutedUntil } });
    await this.notifications.notify([targetUserId], mutedUntil
      ? { kind: 'group.muted', title: `Você foi silenciado no chat de ${group.name}`, body: `Você volta a escrever às ${formatTime(mutedUntil)}. Releia as regras do grupo.`, link: `/app/grupos/${groupId}` }
      : { kind: 'group.unmuted', title: `Você pode voltar a escrever em ${group.name}`, link: `/app/grupos/${groupId}` });
    this.events.changed(groupId, 'chat');
    return { mutedUntil };
  }

  // ------------------------------------------------------------ avisos

  async announce(userId: string, groupId: string, rawBody: string, now = new Date()) {
    const { me, group } = await this.member(userId, groupId);
    if (!canModerate(me.role)) throw new ForbiddenException('Só moderadores, administradores e o dono publicam avisos.');
    if (group.archivedAt) throw new BadRequestException('O grupo está arquivado.');
    const body = rawBody.trim();
    const verdict = checkMessage(body);
    if (!verdict.ok) throw new BadRequestException(verdict.message);
    await this.prisma.groupAnnouncement.create({ data: { groupId, authorId: userId, body, createdAt: now } });
    const members = await this.prisma.studyGroupMember.findMany({ where: { groupId, status: 'ACTIVE', userId: { not: userId } }, select: { userId: true } });
    await this.notifications.notify(members.map((m) => m.userId), {
      kind: 'group.announcement',
      title: `Novo aviso em ${group.name}`,
      body,
      link: `/app/grupos/${groupId}`,
    });
    this.events.changed(groupId, 'chat');
    return this.chat(userId, groupId, {}, now);
  }

  async removeAnnouncement(userId: string, groupId: string, announcementId: string, now = new Date()) {
    const { me } = await this.member(userId, groupId);
    if (!canModerate(me.role)) throw new ForbiddenException('Só moderadores removem avisos.');
    const found = await this.prisma.groupAnnouncement.findFirst({ where: { id: announcementId, groupId, deletedAt: null } });
    if (!found) throw new NotFoundException('Aviso não encontrado.');
    await this.prisma.groupAnnouncement.update({ where: { id: announcementId }, data: { deletedAt: now } });
    this.events.changed(groupId, 'chat');
    return this.chat(userId, groupId, {}, now);
  }

  // ------------------------------------------------------------ denúncias

  async report(userId: string, groupId: string, dto: CreateReportDto, now = new Date()) {
    const { group } = await this.member(userId, groupId);
    let targetUserId: string | null = null;
    let messageId: string | null = null;
    if (dto.targetType === 'MESSAGE') {
      const message = await this.prisma.groupMessage.findFirst({ where: { id: dto.messageId ?? '', groupId }, select: { id: true, authorId: true, hiddenAt: true } });
      if (!message) throw new NotFoundException('Mensagem não encontrada.');
      if (message.authorId === userId) throw new BadRequestException('Você não pode denunciar a própria mensagem.');
      messageId = message.id;
      targetUserId = message.authorId;
    } else if (dto.targetType === 'MEMBER') {
      if (!dto.targetUserId || dto.targetUserId === userId) throw new BadRequestException('Escolha outro membro para denunciar.');
      const target = await this.prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId: dto.targetUserId } } });
      if (!target) throw new NotFoundException('Membro não encontrado.');
      targetUserId = dto.targetUserId;
    }

    const duplicate = await this.prisma.groupReport.findFirst({
      where: { groupId, reporterId: userId, status: 'OPEN', targetType: dto.targetType, messageId, targetUserId },
      select: { id: true },
    });
    if (duplicate) return { reported: true, duplicate: true };

    await this.prisma.groupReport.create({
      data: { groupId, reporterId: userId, targetType: dto.targetType, messageId, targetUserId, reason: dto.reason, details: dto.details?.trim() || null, createdAt: now },
    });

    let autoHidden = false;
    if (messageId) {
      const reporters = await this.prisma.groupReport.findMany({ where: { messageId, status: 'OPEN' }, select: { reporterId: true } });
      if (new Set(reporters.map((r) => r.reporterId)).size >= CHAT_RULES.hideAfterReports) {
        const res = await this.prisma.groupMessage.updateMany({ where: { id: messageId, hiddenAt: null }, data: { hiddenAt: now, hiddenReason: 'reports' } });
        autoHidden = res.count > 0;
        if (autoHidden) this.events.changed(groupId, 'chat');
      }
    }

    // Quem trata: moderadores do grupo; grupo inteiro ou o dono vão para a Lumina.
    const ownerTargeted = targetUserId !== null && targetUserId === group.ownerId;
    const recipients = dto.targetType === 'GROUP' || ownerTargeted
      ? (await this.prisma.user.findMany({ where: { accountType: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id)
      : (await this.prisma.studyGroupMember.findMany({
          where: { groupId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN', 'MODERATOR'] }, userId: { notIn: [userId, ...(targetUserId ? [targetUserId] : [])] } },
          select: { userId: true },
        })).map((m) => m.userId);
    await this.notifications.notify(recipients, {
      kind: 'group.report',
      title: `Nova denúncia em ${group.name}`,
      body: `Motivo: ${dto.reason.replace('_', ' ')}.`,
      link: dto.targetType === 'GROUP' || ownerTargeted ? '/app/grupos/denuncias' : `/app/grupos/${groupId}`,
    });
    return { reported: true, autoHidden };
  }

  /** Denúncias que este moderador pode tratar: nunca contra si nem contra quem está no mesmo nível ou acima. */
  async reports(userId: string, groupId: string) {
    const { me } = await this.member(userId, groupId);
    if (!canModerate(me.role)) throw new ForbiddenException('Só moderadores veem as denúncias.');
    const rows = await this.prisma.groupReport.findMany({
      where: await this.visibleReportsWhere(groupId, me),
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, targetType: true, reason: true, details: true, createdAt: true, targetUserId: true,
        targetUser: { select: userSelect },
        message: { select: { id: true, body: true, hiddenAt: true, hiddenReason: true, createdAt: true } },
      },
    });
    // Quem denunciou fica anônimo para a moderação.
    return rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      reason: r.reason,
      details: r.details,
      createdAt: r.createdAt,
      targetUserId: r.targetUserId,
      targetName: r.targetUser ? displayName(r.targetUser) : null,
      message: r.message ? { id: r.message.id, body: r.message.body, hidden: r.message.hiddenReason, createdAt: r.message.createdAt } : null,
    }));
  }

  async resolveReport(userId: string, groupId: string, reportId: string, dto: ResolveReportDto, now = new Date()) {
    const { me } = await this.member(userId, groupId);
    if (!canModerate(me.role)) throw new ForbiddenException('Só moderadores tratam denúncias.');
    const report = await this.prisma.groupReport.findFirst({
      where: { id: reportId, ...(await this.visibleReportsWhere(groupId, me)) },
      select: { id: true, messageId: true, targetType: true },
    });
    if (!report) throw new NotFoundException('Denúncia não encontrada.');
    await this.applyResolution(report, dto.action, userId, now);
    this.events.changed(groupId, 'chat');
    return this.reports(userId, groupId);
  }

  // ------------------------------------------------------------ administração da Lumina

  /** Denúncias de grupos inteiros e contra donos: só a administração da plataforma. */
  async adminReports(accountType: string) {
    if (accountType !== 'ADMIN') throw new ForbiddenException('Só a administração da Lumina vê estas denúncias.');
    const rows = await this.prisma.groupReport.findMany({
      // Grupo inteiro, ou contra uma pessoa (filtrado abaixo: só quando ela é a dona DESTE grupo).
      where: { status: 'OPEN', OR: [{ targetType: 'GROUP' }, { targetUserId: { not: null } }] },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true, groupId: true, targetType: true, reason: true, details: true, createdAt: true, targetUserId: true,
        group: { select: { name: true, ownerId: true } },
        targetUser: { select: userSelect },
        message: { select: { body: true } },
      },
    });
    return rows
      .filter((r) => r.targetType === 'GROUP' || r.targetUserId === r.group.ownerId)
      .map((r) => ({
        id: r.id,
        groupId: r.groupId,
        groupName: r.group.name,
        targetType: r.targetType,
        reason: r.reason,
        details: r.details,
        createdAt: r.createdAt,
        targetName: r.targetUser ? displayName(r.targetUser) : null,
        messageBody: r.message?.body ?? null,
      }));
  }

  async adminResolve(accountType: string, userId: string, reportId: string, dto: ResolveReportDto, now = new Date()) {
    if (accountType !== 'ADMIN') throw new ForbiddenException('Só a administração da Lumina trata estas denúncias.');
    const report = await this.prisma.groupReport.findFirst({ where: { id: reportId, status: 'OPEN' }, select: { id: true, messageId: true, targetType: true, groupId: true } });
    if (!report) throw new NotFoundException('Denúncia não encontrada.');
    await this.applyResolution(report, dto.action, userId, now);
    this.events.changed(report.groupId, 'chat');
    return this.adminReports(accountType);
  }

  // ------------------------------------------------------------ apoio

  /** "Procede": a mensagem fica oculta pela moderação. "Não procede": volta se
   * tinha sumido só pelas denúncias. As outras denúncias da mesma mensagem
   * são fechadas junto. */
  private async applyResolution(report: { id: string; messageId: string | null }, action: 'resolve' | 'dismiss', userId: string, now: Date) {
    const status = action === 'resolve' ? 'RESOLVED' : 'DISMISSED';
    await this.prisma.groupReport.updateMany({
      where: report.messageId ? { messageId: report.messageId, status: 'OPEN' } : { id: report.id },
      data: { status, resolvedById: userId, resolvedAt: now },
    });
    if (report.messageId) {
      if (action === 'resolve') {
        await this.prisma.groupMessage.updateMany({
          where: { id: report.messageId, OR: [{ hiddenAt: null }, { hiddenReason: 'reports' }] },
          data: { hiddenAt: now, hiddenById: userId, hiddenReason: 'moderator' },
        });
      } else {
        await this.prisma.groupMessage.updateMany({ where: { id: report.messageId, hiddenReason: 'reports' }, data: { hiddenAt: null, hiddenReason: null } });
      }
    }
  }

  private async visibleReportsWhere(groupId: string, me: Member) {
    const higherOrSame = (await this.prisma.studyGroupMember.findMany({
      where: { groupId, role: { in: (Object.keys(ROLE_RANK) as GroupRole[]).filter((r) => ROLE_RANK[r] >= ROLE_RANK[me.role]) } },
      select: { userId: true },
    })).map((m) => m.userId);
    return {
      groupId,
      status: 'OPEN' as const,
      targetType: { in: ['MESSAGE', 'MEMBER'] as Array<'MESSAGE' | 'MEMBER'> },
      // Nunca contra si mesmo, nem contra quem está no mesmo nível ou acima.
      OR: [{ targetUserId: null }, { targetUserId: { notIn: [...new Set([...higherOrSame, me.userId])] } }],
    };
  }

  private async roles(groupId: string): Promise<Map<string, GroupRole>> {
    const rows = await this.prisma.studyGroupMember.findMany({ where: { groupId, status: 'ACTIVE' }, select: { userId: true, role: true } });
    return new Map(rows.map((r) => [r.userId, r.role as GroupRole]));
  }

  private async member(userId: string, groupId: string): Promise<{ me: Member; group: { name: string; ownerId: string; archivedAt: Date | null } }> {
    const row = await this.prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { userId: true, role: true, status: true, mutedUntil: true, group: { select: { name: true, ownerId: true, archivedAt: true } } },
    });
    if (!row || row.status !== 'ACTIVE') throw new NotFoundException(NOT_FOUND);
    return { me: { userId: row.userId, role: row.role as GroupRole, status: row.status, mutedUntil: row.mutedUntil }, group: row.group };
  }
}

function formatTime(at: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at);
}
