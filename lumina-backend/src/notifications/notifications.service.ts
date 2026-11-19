import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface NotificationInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

const PAGE = 30;
const clip = (text: string | null | undefined, max: number) => (text ? (text.length > max ? `${text.slice(0, max - 1)}…` : text) : null);

/**
 * Notificações in-app (módulo genérico; o Lumina Groups é o primeiro a usar).
 * Notificar nunca derruba a ação que gerou o aviso: falhas só vão para o log.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(userIds: string[], input: NotificationInput): Promise<void> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    try {
      await this.prisma.notification.createMany({
        data: ids.map((userId) => ({
          userId,
          kind: input.kind.slice(0, 40),
          title: clip(input.title, 120)!,
          body: clip(input.body, 300),
          link: clip(input.link, 200),
        })),
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar (${input.kind}): ${(error as Error).message}`);
    }
  }

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: PAGE,
        select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      this.unreadCount(userId),
    ]);
    return { items, unread };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Marca como lidas as indicadas, ou todas quando a lista vem vazia. */
  async markRead(userId: string, ids: string[] = []) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { unread: await this.unreadCount(userId) };
  }
}
