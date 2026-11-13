import { Injectable } from '@nestjs/common';
import { AccountType, PlanTier, Subscription, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { limitsFor, PlanLimits } from './plan-limits';

const STUDENT_TYPES: AccountType[] = [AccountType.STUDENT_INDEPENDENT, AccountType.STUDENT_INSTITUTION];

/** De onde vem o plano em vigor. STAFF = conta de equipe (sem cobrança). */
export type EntitlementSource = SubscriptionSource | 'STAFF' | 'INSTITUTION' | 'NONE';

export interface Entitlement {
  tier: PlanTier;
  source: EntitlementSource;
  limits: PlanLimits;
  /** Assinatura/concessão que dá o acesso (individual ou da instituição). */
  subscription: Subscription | null;
  /** Até quando o acesso vale; null = sem prazo ou plano gratuito. */
  accessUntil: Date | null;
  isStudent: boolean;
}

/**
 * Uma assinatura dá acesso quando já foi paga/concedida e o período não
 * acabou. PENDING nunca dá acesso. Sem fim de período, só a concessão
 * manual ativa vale (licença institucional sem prazo).
 */
export function grantsAccess(sub: Pick<Subscription, 'status' | 'currentPeriodEnd' | 'source'>, now: Date): boolean {
  if (sub.status === SubscriptionStatus.PENDING) return false;
  if (sub.currentPeriodEnd) return sub.currentPeriodEnd > now;
  return sub.status === SubscriptionStatus.ACTIVE && sub.source === SubscriptionSource.MANUAL;
}

/** Entre várias assinaturas válidas, fica a que dura mais (sem prazo vence). */
export function bestAccess<T extends Pick<Subscription, 'status' | 'currentPeriodEnd' | 'source'>>(subs: T[], now: Date): T | null {
  const valid = subs.filter((sub) => grantsAccess(sub, now));
  if (!valid.length) return null;
  return valid.reduce((best, sub) => {
    if (!best.currentPeriodEnd) return best;
    if (!sub.currentPeriodEnd) return sub;
    return sub.currentPeriodEnd > best.currentPeriodEnd ? sub : best;
  });
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, now: Date = new Date()): Promise<Entitlement> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    const isStudent = !!user && STUDENT_TYPES.includes(user.accountType);
    if (user && !isStudent) {
      return { tier: PlanTier.INSTITUTIONAL, source: 'STAFF', limits: limitsFor(PlanTier.INSTITUTIONAL), subscription: null, accessUntil: null, isStudent };
    }

    const personal = bestAccess(
      await this.prisma.subscription.findMany({ where: { userId, status: { not: SubscriptionStatus.PENDING } } }),
      now,
    );
    if (personal) {
      return { tier: personal.tier, source: personal.source, limits: limitsFor(personal.tier), subscription: personal, accessUntil: personal.currentPeriodEnd, isStudent };
    }

    // Aluno de instituição com licença ativa usa o plano da instituição.
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId, status: 'ACTIVE', workspace: { type: 'INSTITUTION', institutionId: { not: null } } },
      select: { workspace: { select: { institutionId: true } } },
    });
    const institutionIds = memberships.map((m) => m.workspace.institutionId).filter((id): id is string => !!id);
    if (institutionIds.length) {
      const license = bestAccess(
        await this.prisma.subscription.findMany({
          where: { institutionId: { in: institutionIds }, status: { not: SubscriptionStatus.PENDING } },
        }),
        now,
      );
      if (license) {
        return { tier: PlanTier.INSTITUTIONAL, source: 'INSTITUTION', limits: limitsFor(PlanTier.INSTITUTIONAL), subscription: license, accessUntil: license.currentPeriodEnd, isStudent };
      }
    }

    return { tier: PlanTier.FREE, source: 'NONE', limits: limitsFor(PlanTier.FREE), subscription: null, accessUntil: null, isStudent };
  }

  /** Limite mensal de correções de redação do usuário (sempre numérico). */
  async essayCorrectionLimit(userId: string, now: Date = new Date()): Promise<number> {
    const { limits } = await this.resolve(userId, now);
    return limits.ESSAY_CORRECTION.limit ?? Number.MAX_SAFE_INTEGER;
  }
}
