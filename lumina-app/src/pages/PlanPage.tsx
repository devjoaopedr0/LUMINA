import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Crown, ExternalLink, Gift, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ApiError, apiBillingCancel, apiBillingCheckout, apiBillingMe, type BillingMe, type CheckoutBillingType } from '@/lib/api';
import type { BillingCycle } from '@/lib/plans';
import { getAccessToken } from '@/lib/auth';
import {
  BILLING_TYPE_LABEL,
  CYCLE_LABEL,
  FEATURE_LABEL,
  PLAN_COMPARISON,
  billingStatusText,
  formatDate,
  formatPrice,
  installmentText,
  maskCpfCnpj,
  planOriginText,
  usageRatio,
  usageText,
} from '@/lib/plans';

const token = () => getAccessToken() ?? '';

export function PlanPage() {
  const [me, setMe] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [billingType, setBillingType] = useState<CheckoutBillingType>('UNDEFINED');
  const [cycle, setCycle] = useState<BillingCycle | null>(null);
  const [installments, setInstallments] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setMe(await apiBillingMe(token()));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível carregar seu plano.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A primeira cobrança pode levar alguns segundos para ser gerada no Asaas.
  useEffect(() => {
    if (me?.billing?.status !== 'PENDING' || me.billing.invoiceUrl) return;
    const timer = window.setTimeout(() => void load(), 5000);
    return () => window.clearTimeout(timer);
  }, [me, load]);

  async function subscribe(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const chosen = selectedCycle ?? 'YEARLY';
      const { subscription } = await apiBillingCheckout(
        token(),
        chosen === 'YEARLY' ? { cpfCnpj, cycle: chosen, installments: selectedInstallments } : { cpfCnpj, cycle: chosen, billingType },
      );
      await load();
      if (subscription.invoiceUrl) window.open(subscription.invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível criar a assinatura.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    setCanceling(true);
    setError('');
    try {
      const result = await apiBillingCancel(token());
      setConfirmCancel(false);
      await load();
      if (result.refunded) setNotice('Plano anual cancelado. O estorno no cartão pode levar até 10 dias úteis.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível cancelar.');
    } finally {
      setCanceling(false);
    }
  }

  const billing = me?.billing ?? null;
  const offer = me?.checkout ?? null;
  // O anual é a oferta principal: vem selecionado quando está configurado.
  const selectedCycle: BillingCycle | null = cycle ?? offer?.recommended ?? null;
  const maxInstallments = offer?.yearly?.maxInstallments ?? 12;
  const selectedInstallments = installments ?? maxInstallments;
  const canSubscribe =
    !!me?.isStudent && !!offer?.available && (!billing || billing.status === 'CANCELED' || billing.status === 'PENDING' || !!me.renewal?.canRenew);
  const paying = billing && billing.status !== 'CANCELED';
  const priceLabel =
    selectedCycle === 'YEARLY' && offer?.yearly
      ? installmentText(offer.yearly.priceCents, selectedInstallments)
      : offer?.monthly
        ? `${formatPrice(offer.monthly.priceCents)}/mês`
        : '';

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold">
          <ArrowLeft size={16} />Voltar à visão geral
        </Link>

        <header className="my-8">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
            <Crown size={20} />Planos
          </span>
          <h1 className="mt-3 text-3xl font-bold">Meu plano</h1>
          <p className="mt-3 max-w-3xl text-graphite-500">
            Veja o que está incluído no seu plano, quanto você já usou e, se quiser, assine o Premium.
            O pagamento acontece na página segura do Asaas: a Lumina não recebe dados do seu cartão.
          </p>
        </header>

        {error ? (
          <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            {notice}
          </p>
        ) : null}

        {loading ? (
          <p role="status" className="rounded-xl bg-white p-6 text-sm text-graphite-500">
            Carregando seu plano…
          </p>
        ) : null}

        {me ? (
          <div className="space-y-6">
            <Card className="bg-white p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-graphite-400">Plano atual</p>
                  <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold">
                    {me.tier !== 'FREE' ? <Crown className="h-6 w-6 text-primary-700" /> : null}
                    {me.tierLabel}
                  </h2>
                  <p className="mt-2 text-sm text-graphite-500">{planOriginText(me)}</p>
                </div>
                {me.source === 'FOUNDER' ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary-700">
                    <Gift className="h-4 w-4" />Fundador
                  </span>
                ) : null}
              </div>

              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {me.usage.map((usage) => (
                  <li key={usage.feature} className="rounded-xl border border-surface-line p-4">
                    <p className="text-sm font-semibold">{FEATURE_LABEL[usage.feature]}</p>
                    <p className="mt-1 text-xs text-graphite-500">{usageText(usage)}</p>
                    {usage.limit ? (
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-line"
                        role="progressbar"
                        aria-label={FEATURE_LABEL[usage.feature]}
                        aria-valuemin={0}
                        aria-valuemax={usage.limit}
                        aria-valuenow={usage.used}
                      >
                        <div
                          className={`h-full rounded-full ${usageRatio(usage) >= 1 ? 'bg-red-500' : 'bg-primary'}`}
                          style={{ width: `${Math.round(usageRatio(usage) * 100)}%` }}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>

            {billing ? (
              <Card className="bg-white p-6 sm:p-8">
                <h2 className="text-xl font-bold">Assinatura Premium</h2>
                <p className="mt-2 text-sm text-graphite-500">{billingStatusText(billing)}</p>
                {billing.priceCents ? (
                  <p className="mt-1 text-sm text-graphite-500">
                    {billing.billingCycle === 'YEARLY'
                      ? `${CYCLE_LABEL.YEARLY}: ${installmentText(billing.priceCents, billing.installmentCount ?? 1)}.`
                      : `${formatPrice(billing.priceCents)} por mês.`}
                  </p>
                ) : null}
                {me.renewal?.canRenew ? (
                  <p className="mt-3 rounded-xl bg-primary/10 p-3 text-sm">
                    Seu Premium termina em {formatDate(me.renewal.endsAt)}. Renove abaixo para não perder o acesso.
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3">
                  {billing.invoiceUrl && billing.status !== 'CANCELED' ? (
                    <a
                      href={billing.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-graphite"
                    >
                      Pagar cobrança <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  {paying && !confirmCancel ? (
                    <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                      Cancelar assinatura
                    </Button>
                  ) : null}
                </div>
                {confirmCancel ? (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    <p>
                      {billing.billingCycle === 'YEARLY'
                        ? billing.status === 'PENDING'
                          ? 'A cobrança do plano anual ainda não paga será removida.'
                          : 'Nos 7 primeiros dias o plano anual é estornado por inteiro e o Premium acaba na hora. Depois disso não há cobrança a cancelar: o anual não renova sozinho.'
                        : `A recorrência será encerrada e cobranças em aberto serão removidas.${billing.currentPeriodEnd ? ` O que já foi pago continua valendo até ${formatDate(billing.currentPeriodEnd)}.` : ''}`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button variant="secondary" size="sm" onClick={() => void cancel()} disabled={canceling}>
                        {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Confirmar cancelamento
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} disabled={canceling}>
                        Manter assinatura
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card className="bg-white p-6 sm:p-8">
              <h2 className="text-xl font-bold">Gratuito × Premium</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-surface-line text-xs uppercase tracking-wider text-graphite-400">
                      <th className="py-3 pr-4 font-semibold">Recurso</th>
                      <th className="py-3 pr-4 font-semibold">Gratuito</th>
                      <th className="py-3 font-semibold">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLAN_COMPARISON.map((row) => (
                      <tr key={row.feature} className="border-b border-surface-line last:border-0">
                        <td className="py-3 pr-4 font-medium">{FEATURE_LABEL[row.feature]}</td>
                        <td className="py-3 pr-4 text-graphite-500">{row.free}</td>
                        <td className="py-3 font-semibold">{row.premium}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {me.founderCampaign.open && me.tier === 'FREE' ? (
                <p className="mt-5 flex items-start gap-2 rounded-xl bg-primary/10 p-4 text-sm">
                  <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" />
                  Campanha de fundadores: os primeiros alunos independentes ganham {me.founderCampaign.grantMonths} meses de Premium sem cobrança
                  ({me.founderCampaign.remaining} vagas restantes, até {formatDate(me.founderCampaign.endsAt)}).
                </p>
              ) : null}

              {canSubscribe && offer ? (
                <form onSubmit={(e) => void subscribe(e)} className="mt-6 space-y-5">
                  <fieldset>
                    <legend className="text-sm font-semibold">Escolha o plano</legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {offer.yearly ? (
                        <label
                          className={`relative cursor-pointer rounded-2xl border-2 p-5 transition ${selectedCycle === 'YEARLY' ? 'border-primary bg-primary/5' : 'border-surface-line bg-white'}`}
                        >
                          <input type="radio" name="cycle" value="YEARLY" className="sr-only" checked={selectedCycle === 'YEARLY'} onChange={() => setCycle('YEARLY')} />
                          <span className="absolute -top-3 left-4 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-graphite">
                            Mais escolhido
                          </span>
                          <span className="block text-lg font-bold">Anual</span>
                          <span className="mt-1 block text-2xl font-bold">
                            {offer.yearly.maxInstallments}x de {formatPrice(offer.yearly.installmentCents)}
                          </span>
                          <span className="mt-1 block text-sm text-graphite-500">{formatPrice(offer.yearly.priceCents)} por 12 meses, no cartão</span>
                          {offer.yearly.savingsCents ? (
                            <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                              Economize {formatPrice(offer.yearly.savingsCents)} ({offer.yearly.savingsPercent}%) em relação ao mensal
                            </span>
                          ) : null}
                        </label>
                      ) : null}
                      {offer.monthly ? (
                        <label
                          className={`cursor-pointer rounded-2xl border-2 p-5 transition ${selectedCycle === 'MONTHLY' ? 'border-primary bg-primary/5' : 'border-surface-line bg-white'}`}
                        >
                          <input type="radio" name="cycle" value="MONTHLY" className="sr-only" checked={selectedCycle === 'MONTHLY'} onChange={() => setCycle('MONTHLY')} />
                          <span className="block text-lg font-bold">Mensal</span>
                          <span className="mt-1 block text-2xl font-bold">{formatPrice(offer.monthly.priceCents)}/mês</span>
                          <span className="mt-1 block text-sm text-graphite-500">Renova todo mês; cancele quando quiser</span>
                        </label>
                      ) : null}
                    </div>
                  </fieldset>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">
                      CPF ou CNPJ de quem paga
                      <Input
                        className="mt-2"
                        inputMode="numeric"
                        autoComplete="off"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(maskCpfCnpj(e.target.value))}
                        placeholder="000.000.000-00"
                        required
                      />
                    </label>
                    {selectedCycle === 'YEARLY' && offer.yearly ? (
                      <label className="block text-sm font-semibold">
                        Parcelas no cartão
                        <select
                          className="mt-2 h-12 w-full rounded-xl border border-surface-line bg-white px-4 text-sm"
                          value={selectedInstallments}
                          onChange={(e) => setInstallments(Number(e.target.value))}
                        >
                          {Array.from({ length: maxInstallments }, (_, i) => maxInstallments - i).map((n) => (
                            <option key={n} value={n}>
                              {installmentText(offer.yearly!.priceCents, n)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="block text-sm font-semibold">
                        Forma de pagamento
                        <select
                          className="mt-2 h-12 w-full rounded-xl border border-surface-line bg-white px-4 text-sm"
                          value={billingType}
                          onChange={(e) => setBillingType(e.target.value as CheckoutBillingType)}
                        >
                          {(Object.keys(BILLING_TYPE_LABEL) as CheckoutBillingType[]).map((type) => (
                            <option key={type} value={type}>
                              {BILLING_TYPE_LABEL[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  <Button type="submit" disabled={submitting || !selectedCycle}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                    {me.renewal?.canRenew ? 'Renovar' : 'Assinar'} {selectedCycle ? CYCLE_LABEL[selectedCycle].toLowerCase() : ''}: {priceLabel}
                  </Button>
                  <p className="flex items-start gap-2 text-xs text-graphite-500">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      O CPF/CNPJ vai direto para o Asaas, que emite a cobrança; a Lumina não o guarda.
                      {selectedCycle === 'YEARLY'
                        ? ' O anual é pago no cartão, não renova sozinho e pode ser cancelado com reembolso integral em até 7 dias.'
                        : ' O mensal renova todo mês até você cancelar.'}
                      {me.tier !== 'FREE' && me.accessUntil ? ` Como você já tem Premium, a primeira cobrança vence em ${formatDate(me.accessUntil)}.` : ''}
                    </span>
                  </p>
                </form>
              ) : null}

              {me.isStudent && !me.checkout.available && me.tier === 'FREE' ? (
                <p className="mt-6 flex items-center gap-2 text-sm text-graphite-500">
                  <Check className="h-4 w-4" />A assinatura Premium abre em breve.
                </p>
              ) : null}
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
}
