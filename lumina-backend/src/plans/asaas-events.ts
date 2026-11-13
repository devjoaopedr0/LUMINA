/**
 * Efeito de cada webhook do Asaas sobre a assinatura local. Função pura:
 * o serviço busca a assinatura, aplica o patch e grava.
 *
 * Mensal (assinatura recorrente):
 * - pagamento confirmado/recebido: ativa e estende o acesso até o vencimento
 *   + 1 mês + 3 dias de folga (boleto e PIX podem levar dias para compensar a
 *   cobrança seguinte); nunca encurta um período já pago;
 * - cobrança vencida: PAST_DUE, mas o acesso já pago continua até o fim.
 *
 * Anual (cobrança parcelada no cartão, uma cobrança por parcela):
 * - parcela confirmada/recebida: o acesso vai até 12 meses depois do
 *   vencimento da 1ª parcela + 3 dias;
 * - parcela vencida: PAST_DUE e o acesso fica no máximo mais 7 dias; pagar
 *   a parcela devolve o ano inteiro.
 *
 * Nos dois: estorno ou chargeback corta o acesso na hora; assinatura
 * removida/inativada vira CANCELED mantendo o acesso pago; cobrança criada ou
 * atualizada guarda o link da cobrança em aberto.
 */
import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { addMonths } from './founder-policy';

export const GRACE_DAYS = 3;
export const YEARLY_OVERDUE_TOLERANCE_DAYS = 7;

export interface AsaasWebhookPayload {
  id: string;
  event: string;
  payment?: {
    id?: string;
    subscription?: string | null;
    installment?: string | null;
    installmentNumber?: number | null;
    externalReference?: string | null;
    status?: string;
    dueDate?: string;
    invoiceUrl?: string | null;
  };
  subscription?: { id?: string };
}

export interface LocalSubscriptionState {
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  invoiceUrl: string | null;
}

export type SubscriptionPatch = Partial<Omit<LocalSubscriptionState, 'billingCycle'>>;

export interface AsaasReference {
  /** Assinatura recorrente (mensal). */
  subscriptionId: string | null;
  /** Parcelamento do anual; no anual em 1x, o id da própria cobrança. */
  chargeId: string | null;
  /** Id local enviado como externalReference na criação. */
  externalReference: string | null;
}

/** Como achar a assinatura local a que o evento se refere. */
export function asaasReferenceOf(payload: AsaasWebhookPayload): AsaasReference {
  if (payload.event.startsWith('SUBSCRIPTION_')) {
    return { subscriptionId: payload.subscription?.id ?? null, chargeId: null, externalReference: null };
  }
  const payment = payload.payment ?? {};
  return {
    subscriptionId: payment.subscription ?? null,
    chargeId: payment.subscription ? null : (payment.installment ?? payment.id ?? null),
    externalReference: payment.externalReference ?? null,
  };
}

function dueDateOf(dueDate: string | undefined, now: Date): Date {
  return dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? new Date(`${dueDate}T03:00:00.000Z`) : now;
}

function plusDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Fim do acesso pago por uma cobrança mensal com vencimento `dueDate` ("AAAA-MM-DD"). */
export function paidThrough(dueDate: string | undefined, now: Date): Date {
  return plusDays(addMonths(dueDateOf(dueDate, now), 1), GRACE_DAYS);
}

/** Fim do ano pago, a partir de qualquer parcela (a n-ésima vence n-1 meses depois da 1ª). */
export function yearlyPaidThrough(dueDate: string | undefined, installmentNumber: number | null | undefined, now: Date): Date {
  const n = installmentNumber && installmentNumber > 0 ? installmentNumber : 1;
  return plusDays(addMonths(dueDateOf(dueDate, now), 12 - (n - 1)), GRACE_DAYS);
}

const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH']);
const REVOKE_EVENTS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']);
const INVOICE_EVENTS = new Set(['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_RESTORED']);
const ENDED_EVENTS = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']);

/** null = o evento não muda nada (ignorado, mas registrado). */
export function applyAsaasEvent(state: LocalSubscriptionState, payload: AsaasWebhookPayload, now: Date): SubscriptionPatch | null {
  const { event, payment } = payload;
  const yearly = state.billingCycle === BillingCycle.YEARLY;

  if (PAID_EVENTS.has(event)) {
    const end = yearly ? yearlyPaidThrough(payment?.dueDate, payment?.installmentNumber, now) : paidThrough(payment?.dueDate, now);
    // No anual, a parcela paga devolve o ano mesmo depois do corte por atraso.
    const keep = state.currentPeriodEnd && state.currentPeriodEnd > end ? state.currentPeriodEnd : end;
    return {
      // Pagou depois de cancelar: o acesso pago vale, mas a recorrência
      // continua encerrada.
      status: state.status === SubscriptionStatus.CANCELED ? SubscriptionStatus.CANCELED : SubscriptionStatus.ACTIVE,
      currentPeriodEnd: keep,
      invoiceUrl: null,
    };
  }

  if (event === 'PAYMENT_OVERDUE') {
    if (state.status === SubscriptionStatus.CANCELED) return null;
    if (state.status === SubscriptionStatus.PENDING) return null;
    if (!yearly) return { status: SubscriptionStatus.PAST_DUE };
    const tolerance = plusDays(now, YEARLY_OVERDUE_TOLERANCE_DAYS);
    const end = state.currentPeriodEnd && state.currentPeriodEnd < tolerance ? state.currentPeriodEnd : tolerance;
    return { status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: end };
  }

  if (REVOKE_EVENTS.has(event)) {
    return { status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: now };
  }

  if (INVOICE_EVENTS.has(event)) {
    const open = payment?.status === 'PENDING' || payment?.status === 'OVERDUE';
    return open && payment?.invoiceUrl ? { invoiceUrl: payment.invoiceUrl } : null;
  }

  if (ENDED_EVENTS.has(event)) {
    if (state.status === SubscriptionStatus.CANCELED) return null;
    return { status: SubscriptionStatus.CANCELED, canceledAt: state.canceledAt ?? now };
  }

  return null;
}
