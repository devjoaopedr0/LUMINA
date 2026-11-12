/**
 * Tipos e formatação da página "Meu plano". Sem dependências de runtime do
 * app, para poder ser testado direto no Node (test/planos.check.ts).
 */

export type PlanTier = 'FREE' | 'PREMIUM' | 'INSTITUTIONAL';
export type PlanFeature = 'ESSAY_CORRECTION' | 'SIMULATION' | 'LUMINIA_MESSAGE' | 'FLASHCARD_AI';
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export type SubscriptionSource = 'ASAAS' | 'FOUNDER' | 'MANUAL';
export type EntitlementSource = SubscriptionSource | 'STAFF' | 'INSTITUTION' | 'NONE';
export type CheckoutBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';

export interface UsageSnapshot {
  feature: PlanFeature;
  window: 'day' | 'month';
  limit: number | null;
  used: number;
  remaining: number | null;
  period: string;
  resetsAt: string;
}

export interface SubscriptionView {
  id: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  billingType: string | null;
  invoiceUrl: string | null;
  priceCents: number | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  founderNumber: number | null;
}

export interface FounderCampaign {
  open: boolean;
  slots: number;
  taken: number;
  remaining: number;
  grantMonths: number;
  endsAt: string;
}

export interface BillingMe {
  tier: PlanTier;
  tierLabel: string;
  source: EntitlementSource;
  accessUntil: string | null;
  isStudent: boolean;
  access: SubscriptionView | null;
  billing: SubscriptionView | null;
  usage: UsageSnapshot[];
  checkout: { available: boolean; priceCents: number | null };
  founderCampaign: FounderCampaign;
}

export const FEATURE_LABEL: Record<PlanFeature, string> = {
  ESSAY_CORRECTION: 'Correções de redação por IA',
  SIMULATION: 'Simulados',
  LUMINIA_MESSAGE: 'Mensagens para a LuminIA',
  FLASHCARD_AI: 'Flashcards gerados por IA',
};

/** Tabela de comparação (espelha plan-limits.ts do backend). */
export const PLAN_COMPARISON: { feature: PlanFeature; free: string; premium: string }[] = [
  { feature: 'ESSAY_CORRECTION', free: '2 por mês', premium: '30 por mês' },
  { feature: 'SIMULATION', free: '2 por mês', premium: 'Ilimitados' },
  { feature: 'LUMINIA_MESSAGE', free: '10 por dia', premium: '200 por dia' },
  { feature: 'FLASHCARD_AI', free: 'Não incluso', premium: '60 gerações por mês' },
];

export const BILLING_TYPE_LABEL: Record<CheckoutBillingType, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
  UNDEFINED: 'Escolher na hora de pagar',
};

export function formatPrice(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "3 de 10 hoje", "1 de 2 neste mês", "5 neste mês (sem limite)", "Não incluso". */
export function usageText(usage: UsageSnapshot): string {
  const when = usage.window === 'day' ? 'hoje' : 'neste mês';
  if (usage.limit === null) return `${usage.used} ${when} (sem limite)`;
  if (usage.limit === 0) return 'Não incluso no seu plano';
  return `${usage.used} de ${usage.limit} ${when}`;
}

/** Fração usada, de 0 a 1 (0 quando não há limite). */
export function usageRatio(usage: UsageSnapshot): number {
  if (!usage.limit) return 0;
  return Math.min(1, usage.used / usage.limit);
}

/** Frase curta sobre de onde vem o plano atual. */
export function planOriginText(me: Pick<BillingMe, 'tier' | 'source' | 'accessUntil' | 'access'>): string {
  const until = me.accessUntil ? ` até ${formatDate(me.accessUntil)}` : '';
  switch (me.source) {
    case 'FOUNDER':
      return `Você é fundador${me.access?.founderNumber ? ` nº ${me.access.founderNumber}` : ''} da Lumina: Premium sem cobrança${until}.`;
    case 'MANUAL':
      return `Premium liberado pela equipe da Lumina${until || ' sem prazo'}.`;
    case 'ASAAS':
      return me.access?.status === 'CANCELED' ? `Assinatura cancelada: o Premium continua${until}.` : `Assinatura Premium ativa${until}.`;
    case 'INSTITUTION':
      return `Plano institucional da sua escola${until}.`;
    case 'STAFF':
      return 'Contas de equipe usam os recursos sem cobrança.';
    default:
      return 'Você está no plano Gratuito.';
  }
}

/** Situação da cobrança recorrente, quando existe. */
export function billingStatusText(billing: SubscriptionView): string {
  switch (billing.status) {
    case 'PENDING':
      return billing.invoiceUrl ? 'Aguardando o pagamento da primeira cobrança.' : 'Assinatura criada. O link da cobrança aparece aqui em instantes.';
    case 'ACTIVE':
      return `Renovação mensal${billing.currentPeriodEnd ? `; pago até ${formatDate(billing.currentPeriodEnd)}` : ''}.`;
    case 'PAST_DUE':
      return 'Há uma cobrança vencida. Pague para não perder o Premium.';
    case 'CANCELED':
      return `Cancelada${billing.currentPeriodEnd ? `; o acesso pago vale até ${formatDate(billing.currentPeriodEnd)}` : ''}.`;
  }
}

/** Máscara de CPF/CNPJ enquanto o aluno digita. */
export function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
