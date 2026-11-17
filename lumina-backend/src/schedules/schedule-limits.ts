import { addDays, brazilToday, daysBetween } from '../common/date-rules';
import { ACTIVITY_DURATION_MINUTES } from './schedule-priority';

/**
 * Limites de datas do cronograma.
 *
 * - Início: não pode ser antes de hoje (ver brazilToday).
 * - Fim: tem um prazo máximo definido pela gama de conteúdos escolhida. Cada
 *   assunto precisa de um ciclo completo (teoria, questões e três revisões
 *   espaçadas); somando os assuntos das matérias escolhidas e dividindo pelo
 *   tempo semanal do aluno, sai quanto tempo o conteúdo ocupa. O prazo
 *   máximo é esse tempo com folga de 50% (simulados, redação e revisões
 *   extras), com no mínimo 4 semanas e no máximo 24 meses. Depois disso o
 *   cronograma ficaria repetindo conteúdo sem plano.
 */
export const REVIEWS_PER_TOPIC = 3;
export const TOPIC_CYCLE_MINUTES =
  ACTIVITY_DURATION_MINUTES.TEORIA + ACTIVITY_DURATION_MINUTES.QUESTOES + REVIEWS_PER_TOPIC * ACTIVITY_DURATION_MINUTES.REVISAO;
export const CONTENT_SLACK = 1.5;
export const MIN_SCHEDULE_DAYS = 28;
export const MAX_SCHEDULE_DAYS = 730;

export interface SubjectContent {
  /** Assuntos do currículo da matéria; null quando a matéria não é dividida em assuntos. */
  topics: number | null;
  /** Horas-alvo que o aluno informou para a matéria. */
  targetHours: number;
}

export interface ScheduleLimits {
  /** Primeiro dia aceito para o início (hoje). */
  minStart: Date;
  /** Último dia aceito para o fim, a partir do início informado. */
  maxEnd: Date;
  topics: number;
  contentMinutes: number;
  weeklyMinutes: number;
  /** Dias que o conteúdo ocupa sem folga, no ritmo semanal informado. */
  contentDays: number;
}

export function scheduleLimits(start: Date, subjects: SubjectContent[], weeklyMinutes: number, now: Date = new Date()): ScheduleLimits {
  const topics = subjects.reduce((sum, s) => sum + (s.topics ?? 0), 0);
  const contentMinutes = subjects.reduce(
    (sum, s) => sum + (s.topics !== null && s.topics > 0 ? s.topics * TOPIC_CYCLE_MINUTES : Math.max(0, s.targetHours) * 60),
    0,
  );
  const contentDays = weeklyMinutes > 0 ? Math.ceil((contentMinutes / weeklyMinutes) * 7) : MAX_SCHEDULE_DAYS;
  const span = Math.min(MAX_SCHEDULE_DAYS, Math.max(MIN_SCHEDULE_DAYS, Math.ceil(contentDays * CONTENT_SLACK)));
  return { minStart: brazilToday(now), maxEnd: addDays(start, span), topics, contentMinutes, weeklyMinutes, contentDays };
}

/** Minutos por semana a partir dos dias de estudo e do tempo de cada dia. */
export function weeklyMinutes(minutesByWeekday: Map<number, number>): number {
  return [...minutesByWeekday.values()].reduce((sum, m) => sum + m, 0);
}

export function scheduleSpanDays(start: Date, end: Date): number {
  return daysBetween(start, end);
}
