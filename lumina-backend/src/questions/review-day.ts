/**
 * A revisão espaçada é um DIA de calendário, não um instante.
 *
 * O dia é o de Brasília (o público da Lumina e o mesmo fuso já usado na cota de
 * redação e no histórico de domínio). No banco, a data é gravada como meia-noite
 * UTC desse dia — a convenção de data-calendário da plataforma. Por isso, para
 * saber se venceu, comparamos a DATA gravada com a data de hoje em Brasília, e
 * não o instante com `new Date()`: às 21:00 de Brasília já é o dia seguinte em
 * UTC, e uma revisão marcada para amanhã não pode vencer na véspera.
 */

/** Brasília está 3 horas atrás do UTC (o Brasil não tem horário de verão desde 2019). */
const BRAZIL_UTC_OFFSET_MS = 3 * 3_600_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Data de calendário em Brasília, como "AAAA-MM-DD". */
export function brasiliaDateKey(at: Date): string {
  const local = new Date(at.getTime() - BRAZIL_UTC_OFFSET_MS);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** Soma dias a uma data-calendário "AAAA-MM-DD" sem passar por fuso. */
export function addDaysToDateKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Instante de meia-noite UTC que representa um dia de calendário. É o formato
 * gravado em `reviewScheduledAt`/`nextReviewAt` e o mesmo que o Prisma devolve.
 */
export function reviewDayOn(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Data de revisão a `days` dias do dia de hoje em Brasília (meia-noite UTC). */
export function reviewDay(now: Date, days = 0): Date {
  return reviewDayOn(addDaysToDateKey(brasiliaDateKey(now), days));
}

/** O dia de hoje em Brasília, como data-calendário gravável. */
export function reviewToday(now = new Date()): Date {
  return reviewDay(now, 0);
}

/** Data-calendário de uma data agendada (a parte UTC de um date-only anchor). */
export function scheduledDateKey(scheduledAt: Date): string {
  return scheduledAt.toISOString().slice(0, 10);
}

/**
 * A revisão vence quando o dia agendado é hoje ou anterior no calendário de
 * Brasília. `null` significa "sem data" e não é tratado aqui como vencido por
 * acidente; quem decide o que fazer com entradas antigas é a fila.
 */
export function isReviewDayDue(scheduledAt: Date | null | undefined, now = new Date()): boolean {
  if (!scheduledAt) return false;
  return scheduledDateKey(scheduledAt) <= brasiliaDateKey(now);
}
