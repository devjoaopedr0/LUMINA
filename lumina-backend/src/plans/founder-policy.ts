/**
 * Benefício de fundador (campanha de lançamento, combinada em 11/11/2026):
 *
 * - só alunos independentes (STUDENT_INDEPENDENT); instituições e alunos
 *   vinculados a uma instituição ficam de fora;
 * - até 100 vagas, por ordem de cadastro;
 * - cada fundador ganha Premium sem cobrança por no máximo 4 meses;
 * - a campanha vale por 6 meses (cadastros até 11/05/2027).
 *
 * Os números são configuráveis por variável de ambiente; a concessão já
 * feita não muda quando a configuração muda (fica gravada com o prazo).
 */
import { AccountType } from '@prisma/client';

export interface FounderPolicy {
  slots: number;
  grantMonths: number;
  /** Cadastros a partir deste instante entram na campanha. */
  campaignStartsAt: Date;
  /** Cadastros até este instante (exclusivo) entram na campanha. */
  campaignEndsAt: Date;
}

export const DEFAULT_FOUNDER_POLICY: FounderPolicy = {
  slots: 100,
  grantMonths: 4,
  campaignStartsAt: new Date('2026-11-11T03:00:00.000Z'),
  campaignEndsAt: new Date('2027-05-11T03:00:00.000Z'),
};

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function date(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function founderPolicyFromEnv(env: Record<string, string | undefined> = process.env): FounderPolicy {
  return {
    slots: positiveInt(env.FOUNDER_STUDENT_SLOTS, DEFAULT_FOUNDER_POLICY.slots),
    grantMonths: Math.max(1, positiveInt(env.FOUNDER_GRANT_MONTHS, DEFAULT_FOUNDER_POLICY.grantMonths)),
    campaignStartsAt: date(env.FOUNDER_CAMPAIGN_STARTS_AT, DEFAULT_FOUNDER_POLICY.campaignStartsAt),
    campaignEndsAt: date(env.FOUNDER_CAMPAIGN_ENDS_AT, DEFAULT_FOUNDER_POLICY.campaignEndsAt),
  };
}

export function isCampaignOpen(policy: FounderPolicy, now: Date): boolean {
  return now >= policy.campaignStartsAt && now < policy.campaignEndsAt;
}

/** Quem pode receber o benefício, antes de olhar as vagas. */
export function isFounderEligible(accountType: AccountType, policy: FounderPolicy, now: Date): boolean {
  return accountType === AccountType.STUDENT_INDEPENDENT && isCampaignOpen(policy, now);
}

/** Soma meses de calendário; no fim do mês, cai no último dia do mês alvo. */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function founderGrantEndsAt(policy: FounderPolicy, grantedAt: Date): Date {
  return addMonths(grantedAt, policy.grantMonths);
}
