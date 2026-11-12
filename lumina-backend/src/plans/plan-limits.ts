/**
 * Limites de uso por plano.
 *
 * O plano gratuito é o "mais restrito" combinado em 11/11/2026. O Premium
 * (individual ou pela instituição) não tem limite de produto; os tetos
 * abaixo existem só contra abuso e custo de IA. Contas de equipe
 * (professor, coordenação, direção, admin) usam os tetos do Premium.
 *
 * Os períodos seguem o fuso de Brasília, como a cota de redação.
 */
import { PlanFeature, PlanTier } from '@prisma/client';
import { quotaPeriod, quotaResetsAt } from '../essay-correction/quota/correction-quota';

export type LimitWindow = 'day' | 'month';

export interface FeatureRule {
  window: LimitWindow;
  /** null = sem limite. */
  limit: number | null;
}

export type PlanLimits = Record<PlanFeature, FeatureRule>;

export const FREE_LIMITS: PlanLimits = {
  ESSAY_CORRECTION: { window: 'month', limit: 2 },
  SIMULATION: { window: 'month', limit: 2 },
  LUMINIA_MESSAGE: { window: 'day', limit: 10 },
  FLASHCARD_AI: { window: 'month', limit: 0 },
};

export const PREMIUM_LIMITS: PlanLimits = {
  ESSAY_CORRECTION: { window: 'month', limit: 30 },
  SIMULATION: { window: 'month', limit: null },
  LUMINIA_MESSAGE: { window: 'day', limit: 200 },
  FLASHCARD_AI: { window: 'month', limit: 60 },
};

export function limitsFor(tier: PlanTier): PlanLimits {
  return tier === PlanTier.FREE ? FREE_LIMITS : PREMIUM_LIMITS;
}

export const FEATURE_LABELS: Record<PlanFeature, { one: string; many: string }> = {
  ESSAY_CORRECTION: { one: 'correção de redação por IA', many: 'correções de redação por IA' },
  SIMULATION: { one: 'simulado', many: 'simulados' },
  LUMINIA_MESSAGE: { one: 'mensagem para a LuminIA', many: 'mensagens para a LuminIA' },
  FLASHCARD_AI: { one: 'geração de flashcards por IA', many: 'gerações de flashcards por IA' },
};

export const TIER_LABELS: Record<PlanTier, string> = {
  FREE: 'Gratuito',
  PREMIUM: 'Premium',
  INSTITUTIONAL: 'Institucional',
};

const TIME_ZONE = 'America/Sao_Paulo';

/** "AAAA-MM-DD" no fuso de Brasília. */
export function dayPeriod(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function periodFor(window: LimitWindow, at: Date = new Date()): string {
  return window === 'day' ? dayPeriod(at) : quotaPeriod(at);
}

/** Início do período seguinte (00:00 de Brasília = 03:00 UTC). */
export function periodResetsAt(window: LimitWindow, period: string): Date {
  if (window === 'month') return quotaResetsAt(period);
  const [year, month, day] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0));
}

export interface UsageSnapshot {
  feature: PlanFeature;
  window: LimitWindow;
  limit: number | null;
  used: number;
  /** null quando não há limite. */
  remaining: number | null;
  period: string;
  resetsAt: string;
}

export function snapshot(feature: PlanFeature, rule: FeatureRule, used: number, period: string): UsageSnapshot {
  return {
    feature,
    window: rule.window,
    limit: rule.limit,
    used,
    remaining: rule.limit === null ? null : Math.max(0, rule.limit - used),
    period,
    resetsAt: periodResetsAt(rule.window, period).toISOString(),
  };
}

/** Mensagem mostrada quando o limite acaba, já apontando o caminho. */
export function limitExceededMessage(tier: PlanTier, usage: UsageSnapshot): string {
  const label = FEATURE_LABELS[usage.feature];
  const when = usage.window === 'day' ? 'de hoje' : 'deste mês';
  const renew = usage.window === 'day' ? 'O limite renova amanhã.' : 'O limite renova no dia 1º do próximo mês.';
  if (usage.limit === 0) {
    return `O plano ${TIER_LABELS[tier]} não inclui ${label.one}. Veja o Premium em "Meu plano".`;
  }
  const what = usage.limit === 1 ? `a ${label.one}` : `as ${usage.limit} ${label.many}`;
  const upsell = tier === PlanTier.FREE ? ' Com o Premium o limite é bem maior: veja em "Meu plano".' : '';
  return `Você já usou ${what} ${when} no plano ${TIER_LABELS[tier]}. ${renew}${upsell}`;
}
