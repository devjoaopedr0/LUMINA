import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_RULES, assessmentLabel, brtDayEnd, brtDayStart, formatDue, isReviewHour, reviewNotice } from './notification-rules';

/**
 * Notificações automáticas (Fase 3, item 51): prova próxima e revisão do dia.
 * Roda a cada 15 min e é idempotente — nunca manda o mesmo aviso duas vezes
 * (confere se a pessoa já recebeu aquele tipo, para aquele link, no período).
 */
@Injectable()
export class NotificationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.VITEST) return;
    const tick = () => this.run(new Date()).catch((error) => this.logger.warn(`Notificações automáticas falharam: ${(error as Error).message}`));
    this.timer = setInterval(tick, NOTIFICATION_RULES.sweepEveryMinutes * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()) {
    const dueSoon = await this.dueSoon(now);
    const reviews = isReviewHour(now) ? await this.dailyReviews(now) : 0;
    return { dueSoon, reviews };
  }

  /** Atividade da turma com prazo nas próximas 24 h: avisa quem ainda não entregou, uma vez. */
  async dueSoon(now: Date) {
    const until = new Date(now.getTime() + NOTIFICATION_RULES.dueSoonHours * 3600_000);
    const sims = await this.prisma.simulation.findMany({
      where: { classId: { not: null }, dueAt: { gt: now, lte: until } },
      select: {
        id: true, title: true, assessmentType: true, dueAt: true,
        class: { select: { name: true, archived: true, members: { select: { userId: true } } } },
        submissions: { select: { userId: true } },
      },
    });
    let sent = 0;
    for (const sim of sims) {
      if (!sim.class || sim.class.archived) continue;
      const submitted = new Set(sim.submissions.map((s) => s.userId));
      const pending = sim.class.members.map((m) => m.userId).filter((id) => !submitted.has(id));
      if (!pending.length) continue;
      const link = `/app/simulados?id=${sim.id}`;
      const already = new Set(
        (await this.prisma.notification.findMany({ where: { kind: 'class.due_soon', link, userId: { in: pending } }, select: { userId: true } })).map((n) => n.userId),
      );
      const targets = pending.filter((id) => !already.has(id));
      if (!targets.length) continue;
      const label = assessmentLabel(sim.assessmentType);
      await this.notifications.notify(targets, {
        kind: 'class.due_soon',
        title: `Prazo chegando: ${label} da turma ${sim.class.name}`,
        body: `${sim.title} · entrega até ${formatDue(sim.dueAt!)}.`,
        link,
      });
      sent += targets.length;
    }
    return sent;
  }

  /** Um aviso por dia para quem tem revisão (assuntos ou flashcards) vencendo hoje. */
  async dailyReviews(now: Date) {
    const end = brtDayEnd(now);
    const [topics, cards] = await Promise.all([
      this.prisma.topicMastery.groupBy({ by: ['userId'], where: { nextReviewAt: { lte: end } }, _count: { _all: true } }),
      this.prisma.flashcard.groupBy({ by: ['userId'], where: { nextReviewAt: { lte: end } }, _count: { _all: true } }),
    ]);
    const counts = new Map<string, number>();
    for (const row of [...topics, ...cards]) counts.set(row.userId, (counts.get(row.userId) ?? 0) + row._count._all);
    if (!counts.size) return 0;
    const already = new Set(
      (await this.prisma.notification.findMany({
        where: { kind: 'review.due', createdAt: { gte: brtDayStart(now) }, userId: { in: [...counts.keys()] } },
        select: { userId: true },
      })).map((n) => n.userId),
    );
    let sent = 0;
    for (const [userId, count] of counts) {
      if (already.has(userId)) continue;
      await this.notifications.notify([userId], { kind: 'review.due', ...reviewNotice(count), link: '/app/revisao-espacada' });
      sent++;
    }
    return sent;
  }
}
