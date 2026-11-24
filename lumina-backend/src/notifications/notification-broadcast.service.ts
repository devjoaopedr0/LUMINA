import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { checkMessage } from '../groups/content-filter';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_RULES, brtDayStart } from './notification-rules';

export interface BroadcastInput {
  scope: 'class' | 'institution';
  classId?: string;
  title: string;
  body?: string;
}

const STAFF = ['COORDINATOR', 'DIRECTOR'];

/**
 * Aviso da instituição ou do professor (item 51): para uma turma (professor
 * dela, ou coordenação/direção da instituição) ou para a instituição inteira
 * (coordenação/direção). Passa pelo filtro de conteúdo e tem limite diário.
 */
@Injectable()
export class NotificationBroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Para onde a pessoa pode mandar aviso. */
  async targets(userId: string) {
    const [user, teaching, staff] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } }),
      this.prisma.class.findMany({ where: { archived: false, teachers: { some: { userId } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.workspaceMember.findFirst({ where: { userId, status: 'ACTIVE', workspace: { type: 'INSTITUTION' } }, select: { workspace: { select: { id: true, name: true } } } }),
    ]);
    const isStaff = Boolean(user && STAFF.includes(user.accountType) && staff);
    const institutionClasses = isStaff
      ? await this.prisma.class.findMany({ where: { workspaceId: staff!.workspace.id, archived: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : [];
    const classes = new Map([...teaching, ...institutionClasses].map((c) => [c.id, c]));
    return {
      classes: [...classes.values()],
      institution: isStaff ? { id: staff!.workspace.id, name: staff!.workspace.name } : null,
      dailyLimit: NOTIFICATION_RULES.broadcastsPerDay,
    };
  }

  async send(userId: string, input: BroadcastInput, now = new Date()) {
    const title = input.title.trim();
    const body = input.body?.trim() || null;
    for (const text of [title, body]) {
      if (!text) continue;
      const verdict = checkMessage(text);
      if (!verdict.ok) throw new BadRequestException(verdict.message.replace('Sua mensagem', 'O aviso').replace('no grupo', 'no aviso'));
    }
    const sentToday = await this.prisma.notification.groupBy({
      by: ['link'],
      where: { kind: 'institution.notice', createdAt: { gte: brtDayStart(now) }, link: { startsWith: `/app?aviso=${userId}` } },
    });
    if (sentToday.length >= NOTIFICATION_RULES.broadcastsPerDay) {
      throw new HttpException(`Limite de ${NOTIFICATION_RULES.broadcastsPerDay} avisos por dia atingido.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const allowed = await this.targets(userId);
    let recipients: string[];
    let audience: string;
    if (input.scope === 'class') {
      const klass = allowed.classes.find((c) => c.id === input.classId);
      if (!klass) throw new NotFoundException('Turma não encontrada entre as suas.');
      recipients = (await this.prisma.classMember.findMany({ where: { classId: klass.id }, select: { userId: true } })).map((m) => m.userId);
      audience = `turma ${klass.name}`;
    } else {
      if (!allowed.institution) throw new ForbiddenException('Só a coordenação e a direção avisam a instituição inteira.');
      recipients = (await this.prisma.workspaceMember.findMany({ where: { workspaceId: allowed.institution.id, status: 'ACTIVE' }, select: { userId: true } })).map((m) => m.userId);
      audience = allowed.institution.name;
    }
    recipients = recipients.filter((id) => id !== userId);
    if (!recipients.length) throw new BadRequestException('Ninguém para receber este aviso ainda.');

    // O link identifica o envio (quem mandou e quando), para contar o limite diário.
    await this.notifications.notify(recipients, {
      kind: 'institution.notice',
      title,
      body: body ?? `Aviso para ${audience}.`,
      link: `/app?aviso=${userId}-${now.getTime()}`,
    });
    return { sent: recipients.length, audience };
  }
}
