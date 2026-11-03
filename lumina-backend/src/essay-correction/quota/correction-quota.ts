/**
 * Cota mensal de correções de redação por IA.
 *
 * O mês é o do calendário no fuso de Brasília (o Brasil não tem horário de
 * verão desde 2019, então a virada é sempre 00:00 de Brasília = 03:00 UTC).
 * Só conta correção que chamou o modelo: se a IA falhou, ou a nota veio de
 * regra objetiva/modelo estatístico (sem custo de API), o crédito volta.
 */

export const DEFAULT_MONTHLY_CORRECTION_LIMIT = 4;
const TIME_ZONE = 'America/Sao_Paulo';
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export interface CorrectionQuota {
  limit: number;
  used: number;
  remaining: number;
  /** "AAAA-MM", no fuso de Brasília. */
  period: string;
  /** Quando a cota renova (1º dia do mês seguinte, 00:00 de Brasília). */
  resetsAt: string;
}

/** Limite configurado em ESSAY_CORRECTION_MONTHLY_LIMIT (inteiro positivo); senão, 4. */
export function monthlyCorrectionLimit(raw = process.env.ESSAY_CORRECTION_MONTHLY_LIMIT): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MONTHLY_CORRECTION_LIMIT;
}

/** Mês da cota ("AAAA-MM") de um instante, no fuso de Brasília. */
export function quotaPeriod(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(at);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

/** Instante em que o período começa (00:00 de Brasília do dia 1º). */
export function periodStart(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

/** Instante em que o período seguinte começa (00:00 de Brasília do dia 1º). */
export function quotaResetsAt(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 3, 0, 0));
}

export function buildQuota(limit: number, used: number, period: string): CorrectionQuota {
  return { limit, used, remaining: Math.max(0, limit - used), period, resetsAt: quotaResetsAt(period).toISOString() };
}

/** "Você já usou as 4 correções de novembro. Elas renovam em 1º de dezembro." */
export function quotaExceededMessage(quota: CorrectionQuota): string {
  const month = Number(quota.period.slice(5, 7));
  const plural = quota.limit === 1 ? 'a correção' : `as ${quota.limit} correções`;
  return `Você já usou ${plural} por IA de ${MONTHS[month - 1]}. Elas renovam em 1º de ${MONTHS[month % 12]}.`;
}
