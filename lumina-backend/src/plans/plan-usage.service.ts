import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PlanFeature, PlanTier } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Entitlement, EntitlementsService } from './entitlements.service';
import { limitExceededMessage, periodFor, snapshot, UsageSnapshot } from './plan-limits';

/** 429 com o uso atual, para o app mostrar o limite e o caminho do Premium. */
export class PlanLimitExceededException extends HttpException {
  constructor(readonly tier: PlanTier, readonly usage: UsageSnapshot) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'PLAN_LIMIT', message: limitExceededMessage(tier, usage), tier, usage },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

const USAGE_FEATURES: PlanFeature[] = [PlanFeature.SIMULATION, PlanFeature.LUMINIA_MESSAGE, PlanFeature.FLASHCARD_AI];

@Injectable()
export class PlanUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Gasta uma unidade do recurso ou lança PlanLimitExceededException.
   * O incremento e a checagem do limite acontecem no mesmo comando SQL:
   * duas requisições simultâneas não passam juntas do limite.
   */
  async consume(userId: string, feature: PlanFeature, now: Date = new Date()): Promise<UsageSnapshot> {
    const entitlement = await this.entitlements.resolve(userId, now);
    const rule = entitlement.limits[feature];
    const period = periodFor(rule.window, now);

    if (rule.limit === null) {
      const row = await this.prisma.planUsage.upsert({
        where: { userId_feature_period: { userId, feature, period } },
        create: { userId, feature, period, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
      return snapshot(feature, rule, row.count, period);
    }

    if (rule.limit <= 0) {
      throw new PlanLimitExceededException(entitlement.tier, snapshot(feature, rule, 0, period));
    }

    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "plan_usages" ("id", "user_id", "feature", "period", "count", "updated_at")
      VALUES (gen_random_uuid(), ${userId}::uuid, ${feature}::"PlanFeature", ${period}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("user_id", "feature", "period")
      DO UPDATE SET "count" = "plan_usages"."count" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "plan_usages"."count" < ${rule.limit}
      RETURNING "count"`;
    if (!rows.length) {
      throw new PlanLimitExceededException(entitlement.tier, snapshot(feature, rule, rule.limit, period));
    }
    return snapshot(feature, rule, Number(rows[0].count), period);
  }

  /** Devolve a unidade quando a operação falhou depois de consumir. */
  async refund(userId: string, feature: PlanFeature, period: string): Promise<void> {
    await this.prisma.planUsage.updateMany({
      where: { userId, feature, period, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  }

  /** Consome, executa e devolve o crédito se a operação lançar erro. */
  async withQuota<T>(userId: string, feature: PlanFeature, run: () => Promise<T>): Promise<T> {
    const usage = await this.consume(userId, feature);
    try {
      return await run();
    } catch (error) {
      await this.refund(userId, feature, usage.period).catch(() => undefined);
      throw error;
    }
  }

  /** Uso atual de todos os recursos, para a página "Meu plano". */
  async usage(userId: string, entitlement: Entitlement, now: Date = new Date()): Promise<UsageSnapshot[]> {
    const periods = USAGE_FEATURES.map((feature) => periodFor(entitlement.limits[feature].window, now));
    const rows = await this.prisma.planUsage.findMany({
      where: { userId, OR: USAGE_FEATURES.map((feature, i) => ({ feature, period: periods[i] })) },
      select: { feature: true, count: true },
    });
    const essayRule = entitlement.limits.ESSAY_CORRECTION;
    const essayPeriod = periodFor(essayRule.window, now);
    const essaysUsed = await this.prisma.essayCorrectionUsage.count({ where: { userId, period: essayPeriod, refundedAt: null } });

    return [
      snapshot(PlanFeature.ESSAY_CORRECTION, essayRule, essaysUsed, essayPeriod),
      ...USAGE_FEATURES.map((feature, i) =>
        snapshot(feature, entitlement.limits[feature], rows.find((row) => row.feature === feature)?.count ?? 0, periods[i]),
      ),
    ];
  }
}
