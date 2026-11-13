import { BillingCycle, PlanTier, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { applyAsaasEvent, asaasReferenceOf, paidThrough, yearlyPaidThrough } from './asaas-events';
import { AsaasClient, asaasConfigFromEnv } from './asaas.client';
import { checkoutOffer, maxInstallmentsFromEnv, priceCentsFromEnv, webhookTokenMatches } from './billing.service';
import { isValidCnpj, isValidCpf, isValidCpfCnpj } from './cpf-cnpj';
import { bestAccess, grantsAccess } from './entitlements.service';
import { addMonths, founderGrantEndsAt, founderPolicyFromEnv, isFounderEligible } from './founder-policy';
import { dayPeriod, FREE_LIMITS, limitExceededMessage, periodResetsAt, snapshot } from './plan-limits';
import { PlanLimitExceededException, PlanUsageService } from './plan-usage.service';

const NOW = new Date('2026-11-11T15:00:00.000Z');

describe('limites do plano', () => {
  it('o gratuito é o "mais restrito" combinado', () => {
    expect(FREE_LIMITS.ESSAY_CORRECTION).toEqual({ window: 'month', limit: 2 });
    expect(FREE_LIMITS.SIMULATION).toEqual({ window: 'month', limit: 2 });
    expect(FREE_LIMITS.LUMINIA_MESSAGE).toEqual({ window: 'day', limit: 10 });
    expect(FREE_LIMITS.FLASHCARD_AI).toEqual({ window: 'month', limit: 0 });
  });

  it('usa o dia de Brasília e renova à meia-noite de Brasília', () => {
    // 01:00 UTC de 12/11 ainda é 11/11 em Brasília.
    expect(dayPeriod(new Date('2026-11-12T01:00:00.000Z'))).toBe('2026-11-11');
    expect(periodResetsAt('day', '2026-11-30').toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(periodResetsAt('month', '2026-12').toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('explica o limite e aponta o Premium no plano gratuito', () => {
    const usage = snapshot('LUMINIA_MESSAGE', FREE_LIMITS.LUMINIA_MESSAGE, 10, '2026-11-11');
    expect(usage.remaining).toBe(0);
    expect(limitExceededMessage(PlanTier.FREE, usage)).toBe(
      'Você já usou as 10 mensagens para a LuminIA de hoje no plano Gratuito. O limite renova amanhã. Com o Premium o limite é bem maior: veja em "Meu plano".',
    );
    const blocked = snapshot('FLASHCARD_AI', FREE_LIMITS.FLASHCARD_AI, 0, '2026-11');
    expect(limitExceededMessage(PlanTier.FREE, blocked)).toContain('não inclui geração de flashcards por IA');
  });
});

describe('benefício de fundador', () => {
  const policy = founderPolicyFromEnv({});

  it('padrão: 100 vagas, 4 meses, campanha de 6 meses', () => {
    expect(policy.slots).toBe(100);
    expect(policy.grantMonths).toBe(4);
    expect(policy.campaignEndsAt.toISOString()).toBe('2027-05-11T03:00:00.000Z');
  });

  it('só aluno independente, só dentro da campanha', () => {
    expect(isFounderEligible('STUDENT_INDEPENDENT', policy, NOW)).toBe(true);
    expect(isFounderEligible('STUDENT_INSTITUTION', policy, NOW)).toBe(false);
    expect(isFounderEligible('TEACHER', policy, NOW)).toBe(false);
    expect(isFounderEligible('DIRECTOR', policy, NOW)).toBe(false);
    expect(isFounderEligible('STUDENT_INDEPENDENT', policy, new Date('2027-05-11T03:00:00.000Z'))).toBe(false);
    expect(isFounderEligible('STUDENT_INDEPENDENT', policy, new Date('2026-11-10T12:00:00.000Z'))).toBe(false);
  });

  it('dura no máximo 4 meses e respeita o fim do mês', () => {
    expect(founderGrantEndsAt(policy, NOW).toISOString()).toBe('2027-03-11T15:00:00.000Z');
    expect(addMonths(new Date('2026-10-31T12:00:00.000Z'), 4).toISOString()).toBe('2027-02-28T12:00:00.000Z');
  });

  it('configuração vazia ou inválida cai no padrão', () => {
    const custom = founderPolicyFromEnv({ FOUNDER_STUDENT_SLOTS: '', FOUNDER_GRANT_MONTHS: 'x', FOUNDER_CAMPAIGN_ENDS_AT: '2027-01-01T00:00:00.000Z' });
    expect(custom.slots).toBe(100);
    expect(custom.grantMonths).toBe(4);
    expect(custom.campaignEndsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('CPF/CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCpfCnpj('52998224725')).toBe(true);
    expect(isValidCpfCnpj('123')).toBe(false);
  });
});

describe('acesso por assinatura', () => {
  const base = { source: SubscriptionSource.ASAAS, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z') };

  it('pendente nunca dá acesso; cancelada vale até o fim do período pago', () => {
    expect(grantsAccess({ ...base, status: SubscriptionStatus.PENDING }, NOW)).toBe(false);
    expect(grantsAccess({ ...base, status: SubscriptionStatus.CANCELED }, NOW)).toBe(true);
    expect(grantsAccess({ ...base, currentPeriodEnd: new Date('2026-11-01T00:00:00.000Z') }, NOW)).toBe(false);
  });

  it('sem prazo só vale para concessão manual ativa', () => {
    expect(grantsAccess({ ...base, currentPeriodEnd: null }, NOW)).toBe(false);
    expect(grantsAccess({ ...base, source: SubscriptionSource.MANUAL, currentPeriodEnd: null }, NOW)).toBe(true);
  });

  it('escolhe a que dura mais', () => {
    const short = { ...base, currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z') };
    const long = { ...base, currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z') };
    expect(bestAccess([short, long], NOW)).toBe(long);
    const forever = { ...base, source: SubscriptionSource.MANUAL, currentPeriodEnd: null };
    expect(bestAccess([long, forever], NOW)).toBe(forever);
  });
});

describe('webhooks do Asaas', () => {
  const pending = { status: SubscriptionStatus.PENDING, billingCycle: BillingCycle.MONTHLY, currentPeriodEnd: null, canceledAt: null, invoiceUrl: 'https://www.asaas.com/i/1' };
  const active = { ...pending, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: new Date('2026-12-14T03:00:00.000Z') };

  it('acha a assinatura, o parcelamento ou a cobrança do evento', () => {
    expect(asaasReferenceOf({ id: 'e1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', subscription: 'sub_1' } })).toEqual({ subscriptionId: 'sub_1', chargeId: null, externalReference: null });
    expect(asaasReferenceOf({ id: 'e2', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_2' } }).subscriptionId).toBe('sub_2');
    expect(asaasReferenceOf({ id: 'e3', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_3', installment: 'ins_3', externalReference: 'x' } })).toEqual({ subscriptionId: null, chargeId: 'ins_3', externalReference: 'x' });
    // Anual em 1x: cobrança simples, sem parcelamento.
    expect(asaasReferenceOf({ id: 'e4', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_4' } }).chargeId).toBe('pay_4');
  });

  it('mensal: pagamento ativa até vencimento + 1 mês + 3 dias e limpa o link', () => {
    const patch = applyAsaasEvent(pending, { id: 'e', event: 'PAYMENT_CONFIRMED', payment: { dueDate: '2026-11-11' } }, NOW);
    expect(patch).toEqual({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: paidThrough('2026-11-11', NOW), invoiceUrl: null });
    expect(paidThrough('2026-11-11', NOW).toISOString()).toBe('2026-12-14T03:00:00.000Z');
  });

  it('pagamento nunca encurta um período já pago', () => {
    const paid = { ...active, currentPeriodEnd: new Date('2027-06-01T00:00:00.000Z') };
    const patch = applyAsaasEvent(paid, { id: 'e', event: 'PAYMENT_RECEIVED', payment: { dueDate: '2026-11-11' } }, NOW);
    expect(patch?.currentPeriodEnd?.toISOString()).toBe('2027-06-01T00:00:00.000Z');
  });

  it('mensal: vencida vira PAST_DUE; estorno corta o acesso; remoção cancela', () => {
    expect(applyAsaasEvent(active, { id: 'e', event: 'PAYMENT_OVERDUE', payment: {} }, NOW)).toEqual({ status: SubscriptionStatus.PAST_DUE });
    expect(applyAsaasEvent(pending, { id: 'e', event: 'PAYMENT_OVERDUE', payment: {} }, NOW)).toBeNull();
    expect(applyAsaasEvent(active, { id: 'e', event: 'PAYMENT_REFUNDED', payment: {} }, NOW)).toEqual({ status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: NOW });
    expect(applyAsaasEvent(active, { id: 'e', event: 'SUBSCRIPTION_DELETED', subscription: { id: 's' } }, NOW)).toEqual({ status: SubscriptionStatus.CANCELED, canceledAt: NOW });
  });

  it('anual: qualquer parcela paga garante 12 meses a partir da 1ª parcela', () => {
    const yearlyPending = { ...pending, billingCycle: BillingCycle.YEARLY };
    const first = applyAsaasEvent(yearlyPending, { id: 'e', event: 'PAYMENT_CONFIRMED', payment: { dueDate: '2026-11-11', installmentNumber: 1 } }, NOW);
    expect(first?.currentPeriodEnd?.toISOString()).toBe('2027-11-14T03:00:00.000Z');
    // A 3ª parcela vence 2 meses depois da 1ª: o fim do ano é o mesmo.
    expect(yearlyPaidThrough('2027-01-11', 3, NOW).toISOString()).toBe('2027-11-14T03:00:00.000Z');
  });

  it('anual: parcela vencida dá 7 dias de tolerância; pagar devolve o ano', () => {
    const yearlyActive = { ...active, billingCycle: BillingCycle.YEARLY, currentPeriodEnd: new Date('2027-11-14T03:00:00.000Z') };
    const overdue = applyAsaasEvent(yearlyActive, { id: 'e', event: 'PAYMENT_OVERDUE', payment: { installmentNumber: 4 } }, NOW);
    expect(overdue).toEqual({ status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: new Date('2026-11-18T15:00:00.000Z') });
    const back = applyAsaasEvent(
      { ...yearlyActive, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: overdue!.currentPeriodEnd! },
      { id: 'e', event: 'PAYMENT_RECEIVED', payment: { dueDate: '2027-02-11', installmentNumber: 4 } },
      NOW,
    );
    expect(back).toMatchObject({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: new Date('2027-11-14T03:00:00.000Z') });
  });

  it('cobrança criada guarda o link; evento desconhecido não muda nada', () => {
    expect(applyAsaasEvent(pending, { id: 'e', event: 'PAYMENT_CREATED', payment: { status: 'PENDING', invoiceUrl: 'https://www.asaas.com/i/2' } }, NOW)).toEqual({ invoiceUrl: 'https://www.asaas.com/i/2' });
    expect(applyAsaasEvent(pending, { id: 'e', event: 'PAYMENT_BANK_SLIP_VIEWED', payment: {} }, NOW)).toBeNull();
  });

  it('token do webhook confere em tempo constante e exige configuração', () => {
    expect(webhookTokenMatches('abc', 'abc')).toBe(true);
    expect(webhookTokenMatches('abd', 'abc')).toBe(false);
    expect(webhookTokenMatches('abc', undefined)).toBe(false);
    expect(webhookTokenMatches(undefined, 'abc')).toBe(false);
  });
});

describe('ofertas de checkout', () => {
  it('anual é o recomendado e mostra a economia contra 12 meses do mensal', () => {
    const offer = checkoutOffer(true, true, 2990, 29900, 12);
    expect(offer.recommended).toBe('YEARLY');
    expect(offer.yearly).toEqual({ priceCents: 29900, maxInstallments: 12, installmentCents: 2492, savingsCents: 5980, savingsPercent: 17 });
  });

  it('sem anual configurado, cai no mensal; sem economia não inventa desconto', () => {
    expect(checkoutOffer(true, true, 2990, null, 12)).toMatchObject({ recommended: 'MONTHLY', yearly: null });
    expect(checkoutOffer(true, true, 1000, 15000, 12).yearly).toMatchObject({ savingsCents: null, savingsPercent: null });
    expect(checkoutOffer(false, true, 2990, 29900, 12).available).toBe(false);
  });

  it('parcelas: padrão 12, nunca acima de 12', () => {
    expect(maxInstallmentsFromEnv(undefined)).toBe(12);
    expect(maxInstallmentsFromEnv('6')).toBe(6);
    expect(maxInstallmentsFromEnv('24')).toBe(12);
    expect(maxInstallmentsFromEnv('0')).toBe(12);
  });
});

describe('configuração do Asaas', () => {
  it('sem chave não há cobrança; sandbox é o padrão', () => {
    expect(asaasConfigFromEnv({})).toBeNull();
    expect(asaasConfigFromEnv({ ASAAS_API_KEY: 'k' })?.baseUrl).toBe('https://api-sandbox.asaas.com/v3');
    expect(asaasConfigFromEnv({ ASAAS_API_KEY: 'k', ASAAS_ENVIRONMENT: 'production' })?.baseUrl).toBe('https://api.asaas.com/v3');
  });

  it('preço em reais vira centavos', () => {
    expect(priceCentsFromEnv('29.90')).toBe(2990);
    expect(priceCentsFromEnv('19,9')).toBe(1990);
    expect(priceCentsFromEnv('')).toBeNull();
    expect(priceCentsFromEnv('0')).toBeNull();
  });

  it('manda access_token e User-Agent e repassa a mensagem de erro do Asaas', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ code: 'invalid_cpfCnpj', description: 'O CPF/CNPJ informado é inválido.' }] }), { status: 400 }),
    );
    const client = new AsaasClient({ apiKey: 'chave', baseUrl: 'https://api-sandbox.asaas.com/v3', userAgent: 'Lumina/1.0' }, fetchImpl as unknown as typeof fetch);
    await expect(client.createCustomer({ name: 'A', email: 'a@b.c', cpfCnpj: '1', externalReference: 'u' })).rejects.toThrow('O CPF/CNPJ informado é inválido.');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api-sandbox.asaas.com/v3/customers');
    expect(init.headers).toMatchObject({ access_token: 'chave', 'User-Agent': 'Lumina/1.0', 'Content-Type': 'application/json' });
  });
});

describe('PlanUsageService', () => {
  function make(limit: number | null, returned: { count: number }[] = [{ count: 1 }]) {
    const rule = { window: 'day' as const, limit };
    const entitlements = {
      resolve: vi.fn().mockResolvedValue({ tier: PlanTier.FREE, limits: { ...FREE_LIMITS, LUMINIA_MESSAGE: rule } }),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue(returned),
      planUsage: {
        upsert: vi.fn().mockResolvedValue({ count: 7 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { service: new PlanUsageService(prisma as any, entitlements as any), prisma };
  }

  it('consome dentro do limite com um único comando SQL', async () => {
    const { service, prisma } = make(10, [{ count: 4 }]);
    const usage = await service.consume('user-1', 'LUMINIA_MESSAGE', NOW);
    expect(usage).toMatchObject({ used: 4, remaining: 6, period: '2026-11-11' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('lança 429 com o uso quando o SQL não incrementa (limite atingido)', async () => {
    const { service } = make(10, []);
    const error = await service.consume('user-1', 'LUMINIA_MESSAGE', NOW).catch((e) => e);
    expect(error).toBeInstanceOf(PlanLimitExceededException);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ code: 'PLAN_LIMIT', usage: { used: 10, remaining: 0 } });
  });

  it('limite zero bloqueia sem gravar; sem limite só conta', async () => {
    const blocked = make(0);
    await expect(blocked.service.consume('user-1', 'LUMINIA_MESSAGE', NOW)).rejects.toBeInstanceOf(PlanLimitExceededException);
    expect(blocked.prisma.$queryRaw).not.toHaveBeenCalled();

    const unlimited = make(null);
    await expect(unlimited.service.consume('user-1', 'LUMINIA_MESSAGE', NOW)).resolves.toMatchObject({ used: 7, remaining: null });
  });

  it('devolve o crédito quando a operação falha', async () => {
    const { service, prisma } = make(10, [{ count: 3 }]);
    await expect(service.withQuota('user-1', 'LUMINIA_MESSAGE', async () => { throw new Error('IA fora'); })).rejects.toThrow('IA fora');
    expect(prisma.planUsage.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', feature: 'LUMINIA_MESSAGE', period: dayPeriod(), count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  });
});
