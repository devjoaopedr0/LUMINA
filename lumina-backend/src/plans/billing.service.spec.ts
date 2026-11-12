import { Prisma, PlanTier, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import { FoundersService } from './founders.service';

const NOW = new Date('2026-11-11T15:00:00.000Z');

function makePrisma() {
  return {
    user: { findUnique: vi.fn() },
    subscription: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: 'local-1', invoiceUrl: null, providerSubscriptionId: null, founderNumber: null, canceledAt: null, currentPeriodEnd: null, ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: 'local-1', tier: 'PREMIUM', status: 'PENDING', source: 'ASAAS', billingType: null, invoiceUrl: null, priceCents: 2990, currentPeriodEnd: null, canceledAt: null, founderNumber: null, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _max: { founderNumber: null } }),
    },
    paymentWebhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'event-row-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (cb: any) => cb(undefined)),
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>, asaas: any = null) {
  const entitlements = { resolve: vi.fn().mockResolvedValue({ tier: PlanTier.FREE, accessUntil: null, isStudent: true }) };
  const service = new BillingService(prisma as any, entitlements as any, {} as any, { campaign: vi.fn() } as any);
  vi.spyOn(service as any, 'asaas').mockReturnValue(asaas);
  return { service, entitlements };
}

describe('BillingService.handleAsaasWebhook', () => {
  beforeEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = 'segredo-do-webhook';
  });
  afterEach(() => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
  });

  it('recusa token errado antes de gravar qualquer coisa', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    await expect(service.handleAsaasWebhook('outro', { id: 'evt_1', event: 'PAYMENT_RECEIVED' }, NOW)).rejects.toThrow('Token do webhook inválido.');
    expect(prisma.paymentWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('grava o evento, ativa a assinatura e marca como processado', async () => {
    const prisma = makePrisma();
    prisma.subscription.findUnique.mockResolvedValue({ id: 'local-1', status: SubscriptionStatus.PENDING, currentPeriodEnd: null, canceledAt: null, invoiceUrl: 'https://www.asaas.com/i/1' });
    const { service } = makeService(prisma);
    const result = await service.handleAsaasWebhook(
      'segredo-do-webhook',
      { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_1', dueDate: '2026-11-11' } },
      NOW,
    );
    expect(result).toEqual({ received: true });
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({ where: { providerSubscriptionId: 'sub_1' } });
    expect(prisma.subscription.update.mock.calls[0][0].data).toMatchObject({ status: SubscriptionStatus.ACTIVE, invoiceUrl: null });
    expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({ where: { id: 'event-row-1' }, data: { processedAt: NOW, error: null } });
  });

  it('evento repetido já processado não faz nada (idempotência)', async () => {
    const prisma = makePrisma();
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({ id: 'event-row-1', processedAt: NOW });
    const { service } = makeService(prisma);
    const result = await service.handleAsaasWebhook('segredo-do-webhook', { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_1' } }, NOW);
    expect(result).toEqual({ received: true, duplicate: true });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('entrega simultânea do mesmo evento: a segunda vê a chave única e para', async () => {
    const prisma = makePrisma();
    prisma.paymentWebhookEvent.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'test' }));
    const { service } = makeService(prisma);
    const result = await service.handleAsaasWebhook('segredo-do-webhook', { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_1' } }, NOW);
    expect(result).toEqual({ received: true, duplicate: true });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('assinatura desconhecida fica registrada com o motivo', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    await service.handleAsaasWebhook('segredo-do-webhook', { id: 'evt_9', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_x' } }, NOW);
    expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({ where: { id: 'event-row-1' }, data: { processedAt: NOW, error: 'assinatura sub_x desconhecida' } });
  });
});

describe('BillingService.checkout', () => {
  const student = { id: 'user-1', email: 'aluna@exemplo.com', accountType: 'STUDENT_INDEPENDENT', profile: { firstName: 'Ana', lastName: 'Lima' } } as any;

  beforeEach(() => {
    process.env.PLAN_PREMIUM_MONTHLY_PRICE = '29.90';
  });
  afterEach(() => {
    delete process.env.PLAN_PREMIUM_MONTHLY_PRICE;
  });

  it('cria cliente e assinatura no Asaas e devolve o link da cobrança', async () => {
    const prisma = makePrisma();
    const asaas = {
      createCustomer: vi.fn().mockResolvedValue({ id: 'cus_1' }),
      createSubscription: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'ACTIVE' }),
      listSubscriptionPayments: vi.fn().mockResolvedValue([{ id: 'pay_1', status: 'PENDING', invoiceUrl: 'https://www.asaas.com/i/1' }]),
    };
    const { service } = makeService(prisma, asaas);
    const result = await service.checkout(student, { cpfCnpj: '529.982.247-25', billingType: 'PIX' }, NOW);

    expect(asaas.createCustomer).toHaveBeenCalledWith({ name: 'Ana Lima', email: 'aluna@exemplo.com', cpfCnpj: '52998224725', externalReference: 'user-1' });
    expect(asaas.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', billingType: 'PIX', value: 29.9, nextDueDate: '2026-11-11', cycle: 'MONTHLY', externalReference: 'local-1' }),
    );
    expect(result.subscription.invoiceUrl).toBe('https://www.asaas.com/i/1');
  });

  it('fundador só começa a pagar quando o benefício acaba', async () => {
    const prisma = makePrisma();
    const asaas = {
      createCustomer: vi.fn().mockResolvedValue({ id: 'cus_1' }),
      createSubscription: vi.fn().mockResolvedValue({ id: 'sub_1' }),
      listSubscriptionPayments: vi.fn().mockResolvedValue([]),
    };
    const { service, entitlements } = makeService(prisma, asaas);
    entitlements.resolve.mockResolvedValue({ tier: PlanTier.PREMIUM, accessUntil: new Date('2027-03-11T15:00:00.000Z'), isStudent: true });
    await service.checkout(student, { cpfCnpj: '52998224725' }, NOW);
    expect(asaas.createSubscription.mock.calls[0][0].nextDueDate).toBe('2027-03-11');
  });

  it('CPF inválido nem chega ao Asaas; sem configuração responde 503', async () => {
    const prisma = makePrisma();
    const asaas = { createCustomer: vi.fn() };
    await expect(makeService(prisma, asaas).service.checkout(student, { cpfCnpj: '111.111.111-11' }, NOW)).rejects.toThrow('CPF ou CNPJ inválido.');
    expect(asaas.createCustomer).not.toHaveBeenCalled();
    await expect(makeService(prisma, null).service.checkout(student, { cpfCnpj: '52998224725' }, NOW)).rejects.toThrow('ainda não está disponível');
  });

  it('se o Asaas falhar, apaga a assinatura local pendente', async () => {
    const prisma = makePrisma();
    const asaas = { createCustomer: vi.fn().mockRejectedValue(new Error('fora do ar')) };
    await expect(makeService(prisma, asaas).service.checkout(student, { cpfCnpj: '52998224725' }, NOW)).rejects.toThrow('fora do ar');
    expect(prisma.subscription.delete).toHaveBeenCalledWith({ where: { id: 'local-1' } });
  });

  it('professor não assina o Premium individual', async () => {
    const prisma = makePrisma();
    await expect(makeService(prisma, {}).service.checkout({ ...student, accountType: 'TEACHER' }, { cpfCnpj: '52998224725' }, NOW)).rejects.toThrow('contas de aluno');
  });
});

describe('FoundersService.claimForNewUser', () => {
  function make(accountType: string, taken = 0) {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ accountType });
    prisma.subscription.count.mockResolvedValue(taken);
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: taken || null } });
    prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
    return { service: new FoundersService(prisma as any), prisma };
  }

  it('aluno independente ganha 4 meses de Premium com o próximo número', async () => {
    const { service, prisma } = make('STUDENT_INDEPENDENT', 41);
    const grant = await service.claimForNewUser('user-1', NOW);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(grant).toMatchObject({
      userId: 'user-1',
      tier: PlanTier.PREMIUM,
      status: SubscriptionStatus.ACTIVE,
      source: SubscriptionSource.FOUNDER,
      founderNumber: 42,
      currentPeriodEnd: new Date('2027-03-11T15:00:00.000Z'),
    });
  });

  it('sem vaga, aluno de instituição ou equipe não ganham', async () => {
    expect(await make('STUDENT_INDEPENDENT', 100).service.claimForNewUser('user-1', NOW)).toBeNull();
    expect(await make('STUDENT_INSTITUTION').service.claimForNewUser('user-1', NOW)).toBeNull();
    expect(await make('TEACHER').service.claimForNewUser('user-1', NOW)).toBeNull();
  });

  it('falha no banco não derruba o cadastro', async () => {
    const { service, prisma } = make('STUDENT_INDEPENDENT');
    prisma.$transaction.mockRejectedValue(new Error('banco fora'));
    await expect(service.claimForNewUser('user-1', NOW)).resolves.toBeNull();
  });
});
