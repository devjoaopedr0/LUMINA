import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountType, BillingCycle, Prisma, PlanTier, Subscription, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { UserWithProfile } from '../users/users.repository';
import { AsaasClient, asaasConfigFromEnv } from './asaas.client';
import { applyAsaasEvent, asaasReferenceOf, AsaasWebhookPayload } from './asaas-events';
import { AdminGrantDto, CheckoutDto } from './billing.dto';
import { isValidCpfCnpj, onlyDigits } from './cpf-cnpj';
import { Entitlement, EntitlementsService } from './entitlements.service';
import { addMonths } from './founder-policy';
import { FoundersService } from './founders.service';
import { dayPeriod, TIER_LABELS } from './plan-limits';
import { PlanUsageService } from './plan-usage.service';

const OPEN_STATUSES: SubscriptionStatus[] = [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];
const STUDENT_TYPES: AccountType[] = [AccountType.STUDENT_INDEPENDENT, AccountType.STUDENT_INSTITUTION];

/** Arrependimento (CDC, art. 49): reembolso integral do anual nos 7 primeiros dias. */
export const YEARLY_WITHDRAWAL_DAYS = 7;
/** Renovação do anual fica disponível nos últimos 30 dias de acesso. */
export const RENEWAL_WINDOW_DAYS = 30;

/** "29,90" ou "29.90" → 2990; null quando ausente ou inválido. */
export function priceCentsFromEnv(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

export const monthlyPriceCents = () => priceCentsFromEnv(process.env.PLAN_PREMIUM_MONTHLY_PRICE);
export const yearlyPriceCents = () => priceCentsFromEnv(process.env.PLAN_PREMIUM_YEARLY_PRICE);

/** Máximo de parcelas do anual (1 a 12; padrão 12). */
export function maxInstallmentsFromEnv(raw = process.env.PLAN_YEARLY_MAX_INSTALLMENTS): number {
  const value = Number(raw);
  return raw?.trim() && Number.isInteger(value) && value >= 1 ? Math.min(12, value) : 12;
}

export interface CheckoutOffer {
  available: boolean;
  monthly: { priceCents: number } | null;
  yearly: { priceCents: number; maxInstallments: number; installmentCents: number; savingsCents: number | null; savingsPercent: number | null } | null;
  /** Ciclo sugerido na tela: o anual quando existe. */
  recommended: 'YEARLY' | 'MONTHLY' | null;
}

/** Ofertas configuradas; a economia do anual é contra 12 meses do mensal. */
export function checkoutOffer(isStudent: boolean, configured: boolean, monthlyCents: number | null, yearlyCents: number | null, maxInstallments: number): CheckoutOffer {
  const monthly = monthlyCents !== null ? { priceCents: monthlyCents } : null;
  const savings = monthlyCents !== null && yearlyCents !== null ? monthlyCents * 12 - yearlyCents : null;
  const hasSavings = savings !== null && savings > 0;
  const yearly =
    yearlyCents !== null
      ? {
          priceCents: yearlyCents,
          maxInstallments,
          installmentCents: Math.ceil(yearlyCents / maxInstallments),
          savingsCents: hasSavings ? savings : null,
          savingsPercent: hasSavings && monthlyCents ? Math.round((savings / (monthlyCents * 12)) * 100) : null,
        }
      : null;
  const available = isStudent && configured && (monthly !== null || yearly !== null);
  return { available, monthly, yearly, recommended: yearly ? 'YEARLY' : monthly ? 'MONTHLY' : null };
}

/** Comparação em tempo constante do token do webhook. */
export function webhookTokenMatches(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SubscriptionView {
  id: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  billingType: string | null;
  billingCycle: BillingCycle;
  installmentCount: number | null;
  invoiceUrl: string | null;
  priceCents: number | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  founderNumber: number | null;
}

function view(sub: Subscription): SubscriptionView {
  return {
    id: sub.id,
    tier: sub.tier,
    status: sub.status,
    source: sub.source,
    billingType: sub.billingType,
    billingCycle: sub.billingCycle,
    installmentCount: sub.installmentCount,
    invoiceUrl: sub.invoiceUrl,
    priceCents: sub.priceCents,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    canceledAt: sub.canceledAt?.toISOString() ?? null,
    founderNumber: sub.founderNumber,
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly usage: PlanUsageService,
    private readonly founders: FoundersService,
  ) {}

  /** Null quando a cobrança não está configurada (sem chave do Asaas). */
  protected asaas(): AsaasClient | null {
    const config = asaasConfigFromEnv();
    return config ? new AsaasClient(config) : null;
  }

  // ------------------------------------------------------------ aluno

  async me(userId: string, now: Date = new Date()) {
    const entitlement = await this.entitlements.resolve(userId, now);
    let billing = await this.currentAsaasSubscription(userId);
    if (billing && billing.status === SubscriptionStatus.PENDING && !billing.invoiceUrl) {
      billing = await this.refreshInvoiceUrl(billing);
    }
    return {
      tier: entitlement.tier,
      tierLabel: TIER_LABELS[entitlement.tier],
      source: entitlement.source,
      accessUntil: entitlement.accessUntil?.toISOString() ?? null,
      isStudent: entitlement.isStudent,
      access: entitlement.subscription ? view(entitlement.subscription) : null,
      billing: billing ? view(billing) : null,
      usage: await this.usage.usage(userId, entitlement, now),
      checkout: checkoutOffer(
        entitlement.isStudent,
        !!asaasConfigFromEnv(),
        monthlyPriceCents(),
        yearlyPriceCents(),
        maxInstallmentsFromEnv(),
      ),
      renewal: billing ? this.renewalInfo(billing, now) : null,
      founderCampaign: await this.founders.campaign(now),
    };
  }

  async checkout(user: UserWithProfile, dto: CheckoutDto, now: Date = new Date()) {
    if (!STUDENT_TYPES.includes(user.accountType)) {
      throw new ForbiddenException('O Premium individual é para contas de aluno.');
    }
    const cpfCnpj = onlyDigits(dto.cpfCnpj);
    if (!isValidCpfCnpj(cpfCnpj)) throw new BadRequestException('CPF ou CNPJ inválido.');
    const cycle = dto.cycle === 'MONTHLY' ? BillingCycle.MONTHLY : BillingCycle.YEARLY;
    const yearly = cycle === BillingCycle.YEARLY;
    const asaas = this.asaas();
    const priceCents = yearly ? yearlyPriceCents() : monthlyPriceCents();
    if (!asaas || priceCents === null) {
      throw new ServiceUnavailableException(
        yearly ? 'O plano anual ainda não está disponível. Tente o mensal ou volte em breve.' : 'A assinatura ainda não está disponível. Tente novamente em breve.',
      );
    }
    const maxInstallments = maxInstallmentsFromEnv();
    const installments = yearly ? (dto.installments ?? maxInstallments) : null;
    if (installments !== null && (installments < 1 || installments > maxInstallments)) {
      throw new BadRequestException(`Escolha de 1 a ${maxInstallments} parcelas.`);
    }

    const open = await this.currentAsaasSubscription(user.id);
    if (open && (open.status === SubscriptionStatus.ACTIVE || open.status === SubscriptionStatus.PAST_DUE) && !this.renewalInfo(open, now).canRenew) {
      throw new ConflictException('Você já tem o Premium. A renovação abre nos últimos 30 dias do seu plano.');
    }
    if (open?.status === SubscriptionStatus.PENDING) {
      // Mesma escolha: devolve a cobrança em aberto. Escolha diferente: troca.
      if (open.billingCycle === cycle && (!yearly || open.installmentCount === installments)) {
        return { subscription: view(await this.refreshInvoiceUrl(open)) };
      }
      await this.discardPending(open, asaas, now);
    }

    // Quem já tem acesso (fundador, concessão ou plano que está acabando) só
    // paga quando o acesso acaba.
    const entitlement: Entitlement = await this.entitlements.resolve(user.id, now);
    const firstDue = entitlement.tier !== PlanTier.FREE && entitlement.accessUntil && entitlement.accessUntil > now ? entitlement.accessUntil : now;
    const billingType = yearly ? 'CREDIT_CARD' : (dto.billingType ?? 'UNDEFINED');

    const local = await this.prisma.subscription.create({
      data: {
        userId: user.id,
        tier: PlanTier.PREMIUM,
        status: SubscriptionStatus.PENDING,
        source: SubscriptionSource.ASAAS,
        billingCycle: cycle,
        installmentCount: installments,
        billingType,
        priceCents,
      },
    });
    try {
      const previous = await this.prisma.subscription.findFirst({
        where: { userId: user.id, source: SubscriptionSource.ASAAS, providerCustomerId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { providerCustomerId: true },
      });
      const name = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ').trim() || user.email;
      const customerId =
        previous?.providerCustomerId ?? (await asaas.createCustomer({ name, email: user.email, cpfCnpj, externalReference: user.id })).id;

      if (yearly) {
        const count = installments ?? 1;
        const payment = await asaas.createInstallmentPayment({
          customer: customerId,
          installmentCount: count,
          totalValue: priceCents / 100,
          dueDate: dayPeriod(firstDue),
          description: `Lumina Premium anual${count > 1 ? ` em ${count}x` : ''}`,
          externalReference: local.id,
        });
        const saved = await this.prisma.subscription.update({
          where: { id: local.id },
          data: { providerCustomerId: customerId, providerInstallmentId: payment.installment ?? payment.id, invoiceUrl: payment.invoiceUrl ?? null },
        });
        return { subscription: view(saved) };
      }

      const remote = await asaas.createSubscription({
        customer: customerId,
        billingType,
        value: priceCents / 100,
        nextDueDate: dayPeriod(firstDue),
        cycle: 'MONTHLY',
        description: 'Lumina Premium (mensal)',
        externalReference: local.id,
      });
      const saved = await this.prisma.subscription.update({
        where: { id: local.id },
        data: { providerCustomerId: customerId, providerSubscriptionId: remote.id },
      });
      return { subscription: view(await this.refreshInvoiceUrl(saved)) };
    } catch (error) {
      await this.prisma.subscription.delete({ where: { id: local.id } }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Mensal: encerra a recorrência; o que já foi pago vale até o fim.
   * Anual: sem pagamento, remove a cobrança; pago há até 7 dias, estorna tudo
   * (direito de arrependimento); depois disso não há o que cancelar, porque o
   * anual não renova sozinho.
   */
  async cancel(userId: string, now: Date = new Date()) {
    const open = await this.currentAsaasSubscription(userId);
    if (!open) throw new NotFoundException('Você não tem assinatura ativa para cancelar.');
    if (open.status === SubscriptionStatus.CANCELED) throw new ConflictException('Esta assinatura já foi cancelada.');
    const asaas = this.asaas();
    if (!asaas) throw new ServiceUnavailableException('O provedor de pagamento não está configurado.');

    if (open.billingCycle === BillingCycle.YEARLY) {
      if (open.status === SubscriptionStatus.PENDING) {
        return { subscription: view(await this.discardPending(open, asaas, now)) };
      }
      if (now.getTime() - open.createdAt.getTime() > YEARLY_WITHDRAWAL_DAYS * 86_400_000) {
        const until = open.currentPeriodEnd ? ` e vale até ${open.currentPeriodEnd.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : '';
        throw new ConflictException(`O plano anual não renova sozinho${until}. O reembolso integral vale só nos 7 primeiros dias.`);
      }
      if (open.providerInstallmentId) {
        if ((open.installmentCount ?? 1) > 1) await asaas.refundInstallment(open.providerInstallmentId);
        else await asaas.refundPayment(open.providerInstallmentId);
      }
      const refunded = await this.prisma.subscription.update({
        where: { id: open.id },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: now, currentPeriodEnd: now, invoiceUrl: null },
      });
      return { subscription: view(refunded), refunded: true };
    }

    if (open.providerSubscriptionId) await asaas.deleteSubscription(open.providerSubscriptionId);
    const updated = await this.prisma.subscription.update({
      where: { id: open.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: now, invoiceUrl: null },
    });
    return { subscription: view(updated) };
  }

  /** Renovação: o anual (e o mensal cancelado) pode ser renovado no fim do acesso. */
  private renewalInfo(sub: Subscription, now: Date) {
    const end = sub.currentPeriodEnd;
    const paid = sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.PAST_DUE || sub.status === SubscriptionStatus.CANCELED;
    const recurring = sub.billingCycle === BillingCycle.MONTHLY && sub.status !== SubscriptionStatus.CANCELED;
    const canRenew = paid && !recurring && !!end && end.getTime() - now.getTime() <= RENEWAL_WINDOW_DAYS * 86_400_000;
    return { canRenew, endsAt: end?.toISOString() ?? null };
  }

  /** Desfaz uma cobrança ainda não paga, no Asaas e aqui. */
  private async discardPending(sub: Subscription, asaas: AsaasClient | null, now: Date): Promise<Subscription> {
    if (asaas) {
      if (sub.providerSubscriptionId) await asaas.deleteSubscription(sub.providerSubscriptionId);
      else if (sub.providerInstallmentId) {
        if ((sub.installmentCount ?? 1) > 1) await asaas.deleteInstallment(sub.providerInstallmentId);
        else await asaas.deletePayment(sub.providerInstallmentId);
      }
    }
    return this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: now, invoiceUrl: null },
    });
  }

  // ------------------------------------------------------------ webhook

  async handleAsaasWebhook(token: string | undefined, payload: AsaasWebhookPayload, now: Date = new Date()) {
    if (!webhookTokenMatches(token, process.env.ASAAS_WEBHOOK_TOKEN?.trim())) {
      throw new UnauthorizedException('Token do webhook inválido.');
    }
    if (!payload?.id || !payload?.event) throw new BadRequestException('Evento sem id ou tipo.');

    // Grava antes de processar: o Asaas entrega "pelo menos uma vez".
    let event = await this.prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider: 'ASAAS', eventId: payload.id } },
    });
    if (event?.processedAt) return { received: true, duplicate: true };
    if (!event) {
      try {
        event = await this.prisma.paymentWebhookEvent.create({
          data: { provider: 'ASAAS', eventId: payload.id, type: payload.event.slice(0, 60), payload: payload as unknown as Prisma.InputJsonValue },
        });
      } catch (error) {
        // Entrega simultânea do mesmo evento: a outra requisição processa.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { received: true, duplicate: true };
        throw error;
      }
    }

    const markDone = (note: string | null) =>
      this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processedAt: now, error: note } });

    try {
      const ref = asaasReferenceOf(payload);
      const local = await this.findLocal(ref);
      if (!local) {
        const label = ref.subscriptionId ?? ref.chargeId ?? ref.externalReference;
        await markDone(label ? `assinatura ${label} desconhecida` : null);
        return { received: true };
      }
      const patch = applyAsaasEvent(local, payload, now);
      if (patch) await this.prisma.subscription.update({ where: { id: local.id }, data: patch });
      await markDone(null);
      return { received: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { error: message.slice(0, 500) } }).catch(() => undefined);
      this.logger.error(`Webhook ${payload.id} (${payload.event}) falhou: ${message}`);
      // 500 faz o Asaas reenviar; o evento continua gravado sem processedAt.
      throw new HttpException('Falha ao processar o evento.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ------------------------------------------------------------ admin

  private async assertAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { accountType: true } });
    if (admin?.accountType !== AccountType.ADMIN) throw new ForbiddenException('Só a administração da Lumina gerencia planos.');
  }

  async adminList(adminId: string) {
    await this.assertAdmin(adminId);
    const rows = await this.prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { user: { select: { email: true } }, institution: { select: { name: true } } },
    });
    return {
      founderCampaign: await this.founders.campaign(),
      subscriptions: rows.map((row) => ({ ...view(row), email: row.user?.email ?? null, institution: row.institution?.name ?? null, note: row.note })),
    };
  }

  async adminGrant(adminId: string, dto: AdminGrantDto, now: Date = new Date()) {
    await this.assertAdmin(adminId);
    const currentPeriodEnd = dto.endsAt ? new Date(dto.endsAt) : dto.months ? addMonths(now, dto.months) : null;
    if (currentPeriodEnd && currentPeriodEnd <= now) throw new BadRequestException('A data de fim precisa estar no futuro.');

    if (dto.institutionId) {
      const institution = await this.prisma.institution.findUnique({ where: { id: dto.institutionId }, select: { id: true } });
      if (!institution) throw new NotFoundException('Instituição não encontrada.');
      const created = await this.prisma.subscription.create({
        data: { institutionId: institution.id, tier: PlanTier.INSTITUTIONAL, status: SubscriptionStatus.ACTIVE, source: SubscriptionSource.MANUAL, currentPeriodEnd, note: dto.note.trim() },
      });
      return view(created);
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email!.trim().toLowerCase() }, select: { id: true, accountType: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (!STUDENT_TYPES.includes(user.accountType)) throw new BadRequestException('O Premium individual é só para contas de aluno.');
    const created = await this.prisma.subscription.create({
      data: { userId: user.id, tier: PlanTier.PREMIUM, status: SubscriptionStatus.ACTIVE, source: SubscriptionSource.MANUAL, currentPeriodEnd, note: dto.note.trim() },
    });
    return view(created);
  }

  /** Revoga concessão manual ou de fundador. Assinatura paga se cancela pelo aluno ou no Asaas. */
  async adminRevoke(adminId: string, subscriptionId: string, now: Date = new Date()) {
    await this.assertAdmin(adminId);
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Concessão não encontrada.');
    if (sub.source === SubscriptionSource.ASAAS) throw new BadRequestException('Assinatura paga: cancele pela conta do aluno ou no Asaas.');
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: now, currentPeriodEnd: now },
    });
    return view(updated);
  }

  // ------------------------------------------------------------ internos

  /** Assinatura local do evento: pela assinatura, pelo parcelamento/cobrança ou pela referência. */
  private async findLocal(ref: ReturnType<typeof asaasReferenceOf>): Promise<Subscription | null> {
    if (ref.subscriptionId) return this.prisma.subscription.findUnique({ where: { providerSubscriptionId: ref.subscriptionId } });
    if (ref.chargeId) {
      const byCharge = await this.prisma.subscription.findUnique({ where: { providerInstallmentId: ref.chargeId } });
      if (byCharge) return byCharge;
    }
    if (ref.externalReference && /^[0-9a-f-]{36}$/i.test(ref.externalReference)) {
      const byReference = await this.prisma.subscription.findUnique({ where: { id: ref.externalReference } });
      if (byReference?.source === SubscriptionSource.ASAAS) return byReference;
    }
    return null;
  }

  /** Assinatura paga mais recente ainda aberta (ou cancelada com acesso). */
  private async currentAsaasSubscription(userId: string): Promise<Subscription | null> {
    const open = await this.prisma.subscription.findFirst({
      where: { userId, source: SubscriptionSource.ASAAS, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (open) return open;
    return this.prisma.subscription.findFirst({
      where: { userId, source: SubscriptionSource.ASAAS, status: SubscriptionStatus.CANCELED, currentPeriodEnd: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Busca o link da cobrança em aberto (a 1ª pode demorar a ser gerada). */
  private async refreshInvoiceUrl(sub: Subscription): Promise<Subscription> {
    const asaas = this.asaas();
    const installmentId = sub.billingCycle === BillingCycle.YEARLY && (sub.installmentCount ?? 1) > 1 ? sub.providerInstallmentId : null;
    if (!asaas || (!sub.providerSubscriptionId && !installmentId)) return sub;
    try {
      const payments = sub.providerSubscriptionId
        ? await asaas.listSubscriptionPayments(sub.providerSubscriptionId)
        : await asaas.listInstallmentPayments(installmentId as string);
      const openPayment = payments.find((p) => (p.status === 'PENDING' || p.status === 'OVERDUE') && p.invoiceUrl);
      if (!openPayment?.invoiceUrl || openPayment.invoiceUrl === sub.invoiceUrl) return sub;
      return await this.prisma.subscription.update({ where: { id: sub.id }, data: { invoiceUrl: openPayment.invoiceUrl } });
    } catch (error) {
      this.logger.warn(`Link da cobrança indisponível (${sub.id}): ${error instanceof Error ? error.message : error}`);
      return sub;
    }
  }
}
