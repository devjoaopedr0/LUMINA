import { BadRequestException } from '@nestjs/common';

/**
 * Regras de data compartilhadas pelos formulários (cronograma, simulados,
 * perfil, gabaritos, planos).
 *
 * "Hoje" é o dia civil no Brasil. Para não recusar um aluno que ainda está
 * no "ontem" do horário de Brasília (Acre e oeste do Amazonas, UTC−5), o dia
 * de referência é o do fuso mais a oeste do país: quem está a leste já está
 * nesse dia ou no seguinte, então nunca é bloqueado sem motivo.
 */
const WESTERNMOST_BR_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Data civil (meia-noite UTC) de "hoje" no Brasil. */
export function brazilToday(now: Date = new Date()): Date {
  const local = new Date(now.getTime() - WESTERNMOST_BR_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** "2026-11-16" ou ISO completo → meia-noite UTC do dia informado. */
export function dateOnly(value: string | Date): Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00.000Z`);
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / DAY_MS);
}

/** 16/11/2026 */
export function formatBr(date: Date): string {
  const d = dateOnly(date);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Recusa data (só o dia) anterior a hoje. */
export function assertNotPastDay(value: string | Date, field: string, now: Date = new Date()): Date {
  const day = dateOnly(value);
  if (day < brazilToday(now)) throw new BadRequestException(`${field} não pode ser anterior a hoje (${formatBr(brazilToday(now))}).`);
  return day;
}

/** Recusa instante (data e hora) que já passou. Tolerância de 1 minuto para o relógio do aparelho. */
export function assertFutureInstant(value: string | Date, field: string, now: Date = new Date()): Date {
  const at = new Date(value);
  if (at.getTime() < now.getTime() - 60_000) throw new BadRequestException(`${field} precisa ser uma data futura.`);
  return at;
}

/** Recusa data (só o dia) posterior a hoje. */
export function assertNotFutureDay(value: string | Date, field: string, now: Date = new Date()): Date {
  const day = dateOnly(value);
  // "Hoje" mais adiantado do país: o do fuso mais a leste (Fernando de Noronha, UTC−2).
  const east = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const latestToday = new Date(Date.UTC(east.getUTCFullYear(), east.getUTCMonth(), east.getUTCDate()));
  if (day > latestToday) throw new BadRequestException(`${field} não pode ser uma data futura.`);
  return day;
}

export const MIN_STUDENT_AGE = 8;
export const MAX_STUDENT_AGE = 100;

/** Nascimento plausível: no passado e entre 8 e 100 anos. */
export function assertBirthDate(value: string, now: Date = new Date()): Date {
  const birth = dateOnly(value);
  const today = brazilToday(now);
  if (birth > today) throw new BadRequestException('A data de nascimento não pode ser no futuro.');
  const age = today.getUTCFullYear() - birth.getUTCFullYear() - (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate()) ? 1 : 0);
  if (age < MIN_STUDENT_AGE || age > MAX_STUDENT_AGE) {
    throw new BadRequestException(`Confira a data de nascimento: a idade precisa ficar entre ${MIN_STUDENT_AGE} e ${MAX_STUDENT_AGE} anos.`);
  }
  return birth;
}
