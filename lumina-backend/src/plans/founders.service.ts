import { Injectable, Logger } from '@nestjs/common';
import { PlanTier, Subscription, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FounderPolicy, founderGrantEndsAt, founderPolicyFromEnv, isCampaignOpen, isFounderEligible } from './founder-policy';

export interface FounderCampaignStatus {
  open: boolean;
  slots: number;
  taken: number;
  remaining: number;
  grantMonths: number;
  endsAt: string;
}

@Injectable()
export class FoundersService {
  private readonly logger = new Logger(FoundersService.name);

  constructor(private readonly prisma: PrismaService) {}

  policy(): FounderPolicy {
    return founderPolicyFromEnv();
  }

  async campaign(now: Date = new Date()): Promise<FounderCampaignStatus> {
    const policy = this.policy();
    const taken = await this.prisma.subscription.count({ where: { source: SubscriptionSource.FOUNDER } });
    return {
      open: isCampaignOpen(policy, now) && taken < policy.slots,
      slots: policy.slots,
      taken,
      remaining: Math.max(0, policy.slots - taken),
      grantMonths: policy.grantMonths,
      endsAt: policy.campaignEndsAt.toISOString(),
    };
  }

  /**
   * Concede o benefício a um cadastro novo, se couber. Roda depois do
   * cadastro e nunca derruba o cadastro: falha vira log.
   *
   * A trava consultiva serializa as concessões; o número do fundador é único
   * no banco, então mesmo uma corrida não passa do número de vagas.
   */
  async claimForNewUser(userId: string, now: Date = new Date()): Promise<Subscription | null> {
    try {
      const policy = this.policy();
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
      if (!user || !isFounderEligible(user.accountType, policy, now)) return null;

      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('founder-grants'))`;
        const already = await tx.subscription.findFirst({ where: { userId, source: SubscriptionSource.FOUNDER } });
        if (already) return null;
        const last = await tx.subscription.aggregate({ where: { source: SubscriptionSource.FOUNDER }, _max: { founderNumber: true } });
        const taken = await tx.subscription.count({ where: { source: SubscriptionSource.FOUNDER } });
        if (taken >= policy.slots) return null;
        return tx.subscription.create({
          data: {
            userId,
            tier: PlanTier.PREMIUM,
            status: SubscriptionStatus.ACTIVE,
            source: SubscriptionSource.FOUNDER,
            founderNumber: (last._max.founderNumber ?? 0) + 1,
            currentPeriodEnd: founderGrantEndsAt(policy, now),
            note: `Fundador: ${policy.grantMonths} meses de Premium sem cobrança.`,
          },
        });
      });
    } catch (error) {
      this.logger.warn(`Benefício de fundador não concedido a ${userId}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
