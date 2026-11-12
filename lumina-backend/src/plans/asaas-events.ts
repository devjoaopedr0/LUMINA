/**
 * Efeito de cada webhook do Asaas sobre a assinatura local. Função pura:
 * o serviço busca a assinatura, aplica o patch e grava.
 *
 * Regras:
 * - pagamento confirmado/recebido: ativa e estende o acesso até o vencimento
 *   + 1 mês + 3 dias de folga (boleto e PIX podem levar dias para compensar a
 *   cobrança seguinte); nunca encurta um período já pago;
 * - cobrança vencida: PAST_DUE, mas o acesso já pago continua até o fim;
 * - estorno ou chargeback: corta o acesso na hora;
 * - assinatura removida/inativada no Asaas: CANCELED, acesso pago mantido;
 * - cobrança criada/atualizada: guarda o link da cobrança em aberto.
 */
import { SubscriptionStatus } from '@prisma/client';
import { addMonths } from './founder-policy';

export const GRACE_DAYS = 3;

export interface AsaasWebhookPayload {
  id: string;
  event: string;
  payment?: {
    id?: string;
    subscription?: string | null;
    status?: string;
    dueDate?: string;
    invoiceUrl?: string | null;
  };
  subscription?: { id?: string };
}

export interface LocalSubscriptionState {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  invoiceUrl: string | null;
}

export type SubscriptionPatch = Partial<LocalSubscriptionState>;

/** Id da assinatura do Asaas a que o evento se refere, se houver. */
export function asaasSubscriptionIdOf(payload: AsaasWebhookPayload): string | null {
  if (payload.event.startsWith('SUBSCRIPTION_')) return payload.subscription?.id ?? null;
  return payload.payment?.subscription ?? null;
}

/** Fim do acesso pago por uma cobrança com vencimento `dueDate` ("AAAA-MM-DD"). */
export function paidThrough(dueDate: string | undefined, now: Date): Date {
  const base = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? new Date(`${dueDate}T03:00:00.000Z`) : now;
  const end = addMonths(base, 1);
  end.setUTCDate(end.getUTCDate() + GRACE_DAYS);
  return end;
}

const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH']);
const REVOKE_EVENTS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']);
const INVOICE_EVENTS = new Set(['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_RESTORED']);
const ENDED_EVENTS = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']);

/** null = o evento não muda nada (ignorado, mas registrado). */
export function applyAsaasEvent(state: LocalSubscriptionState, payload: AsaasWebhookPayload, now: Date): SubscriptionPatch | null {
  const { event, payment } = payload;

  if (PAID_EVENTS.has(event)) {
    const end = paidThrough(payment?.dueDate, now);
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
    return { status: state.status === SubscriptionStatus.PENDING ? SubscriptionStatus.PENDING : SubscriptionStatus.PAST_DUE };
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
