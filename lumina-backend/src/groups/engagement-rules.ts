/**
 * Engajamento do Lumina Groups (etapa 3, docs/LUMINA_GROUPS.md §2.5):
 * placar opcional, metas coletivas e conquistas. Funções puras.
 *
 * Saúde antes de horas:
 *  - o placar padrão é o de CONSTÂNCIA (dias com estudo), não horas brutas;
 *  - cada dia conta no máximo 10 h, em qualquer placar ou meta;
 *  - ninguém entra no placar sem ligar (menores incluídos: desligado por padrão);
 *  - nenhuma mensagem do tipo "estude sem parar".
 */
import { dayKey } from './group-rules';

export const ENGAGEMENT_RULES = {
  /** Teto diário que conta no placar e nas metas. */
  dailyCapMinutes: 600,
  /** Um dia "com estudo" pede pelo menos isso (evita contar 1 minuto solto). */
  minMinutesPerDay: 15,
  /** Períodos aceitos no placar. */
  rankingPeriods: [7, 30] as const,
  /** Duração de uma meta coletiva. */
  goalMinDays: 1,
  goalMaxDays: 31,
  /** Metas ativas ao mesmo tempo num grupo. */
  maxActiveGoals: 3,
  /** Janela para a maior sequência. */
  streakLookbackDays: 60,
} as const;

export type RankingMetric = 'consistency' | 'hours' | 'streak';
export type RankingPeriod = (typeof ENGAGEMENT_RULES.rankingPeriods)[number];
export type GoalMetric = 'GROUP_MINUTES' | 'GROUP_STUDY_DAYS';

export interface LogLike {
  userId: string;
  endTime: Date;
  durationMinutes: number;
}

function shiftDay(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Os últimos `days` dias (fuso de Brasília), terminando hoje. */
export function periodKeys(days: number, now: Date): string[] {
  const today = dayKey(now);
  return Array.from({ length: days }, (_, i) => shiftDay(today, -(days - 1 - i)));
}

/** Dias entre duas chaves, inclusive (AAAA-MM-DD). */
export function keysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let k = start; k <= end && out.length < 400; k = shiftDay(k, 1)) out.push(k);
  return out;
}

/** Minutos por dia de cada aluno, já com o teto diário. */
export function minutesByUserDay(logs: LogLike[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const log of logs) {
    if (log.durationMinutes <= 0) continue;
    const days = out.get(log.userId) ?? new Map<string, number>();
    const key = dayKey(log.endTime);
    days.set(key, Math.min(ENGAGEMENT_RULES.dailyCapMinutes, (days.get(key) ?? 0) + log.durationMinutes));
    out.set(log.userId, days);
  }
  return out;
}

export interface PeriodSummary {
  /** Dias com estudo (≥ 15 min) no período. */
  activeDays: number;
  /** Minutos no período, com o teto de 10 h por dia. */
  cappedMinutes: number;
  /** Constância: dias com estudo ÷ dias do período, em %. */
  consistency: number;
}

export function summarize(days: Map<string, number> | undefined, keys: string[]): PeriodSummary {
  let activeDays = 0;
  let cappedMinutes = 0;
  for (const key of keys) {
    const minutes = days?.get(key) ?? 0;
    cappedMinutes += minutes;
    if (minutes >= ENGAGEMENT_RULES.minMinutesPerDay) activeDays++;
  }
  return { activeDays, cappedMinutes, consistency: keys.length ? Math.round((activeDays / keys.length) * 100) : 0 };
}

/** Maior sequência de dias com estudo dentro da janela (até hoje). */
export function longestStreak(days: Map<string, number> | undefined, now: Date): number {
  let best = 0;
  let run = 0;
  for (const key of periodKeys(ENGAGEMENT_RULES.streakLookbackDays, now)) {
    if ((days?.get(key) ?? 0) >= ENGAGEMENT_RULES.minMinutesPerDay) {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

/** Sequência atual (terminando hoje ou ontem). */
export function currentStreak(days: Map<string, number> | undefined, now: Date): number {
  const ok = (key: string) => (days?.get(key) ?? 0) >= ENGAGEMENT_RULES.minMinutesPerDay;
  let key = dayKey(now);
  if (!ok(key)) key = shiftDay(key, -1);
  let n = 0;
  while (ok(key) && n < ENGAGEMENT_RULES.streakLookbackDays) {
    n++;
    key = shiftDay(key, -1);
  }
  return n;
}

export interface RankingEntry {
  userId: string;
  position: number;
  /** Valor do placar escolhido: % de constância, minutos (com teto) ou dias. */
  value: number;
  activeDays: number;
  cappedMinutes: number;
  longestStreak: number;
}

/**
 * Placar só com quem participa. Constância desempata por dias e minutos;
 * empate total divide a posição (1º, 1º, 3º).
 */
export function buildRanking(
  participants: string[],
  byUser: Map<string, Map<string, number>>,
  metric: RankingMetric,
  period: RankingPeriod,
  now: Date,
): RankingEntry[] {
  const keys = periodKeys(period, now);
  const rows = participants.map((userId) => {
    const days = byUser.get(userId);
    const s = summarize(days, keys);
    const streak = longestStreak(days, now);
    const value = metric === 'consistency' ? s.consistency : metric === 'hours' ? s.cappedMinutes : streak;
    return { userId, value, activeDays: s.activeDays, cappedMinutes: s.cappedMinutes, longestStreak: streak };
  });
  const key = (r: (typeof rows)[number]) =>
    metric === 'consistency' ? [r.value, r.activeDays, r.cappedMinutes] : metric === 'hours' ? [r.value, r.activeDays] : [r.value, r.activeDays];
  rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (kb[i] !== ka[i]) return kb[i] - ka[i];
    return 0;
  });
  let position = 0;
  let previous: number[] | null = null;
  return rows.map((row, index) => {
    const k = key(row);
    if (!previous || k.some((v, i) => v !== previous![i])) position = index + 1;
    previous = k;
    return { ...row, position };
  });
}

export interface GoalLike {
  metric: GoalMetric;
  target: number;
  startKey: string;
  endKey: string;
}

/** Progresso de uma meta coletiva, só com quem participa do placar. */
export function goalProgress(
  goal: GoalLike,
  participants: string[],
  byUser: Map<string, Map<string, number>>,
  now: Date,
): { value: number; percent: number; reached: boolean; status: 'ACTIVE' | 'REACHED' | 'ENDED' | 'UPCOMING'; contributors: number } {
  const today = dayKey(now);
  const keys = keysBetween(goal.startKey, goal.endKey < today ? goal.endKey : today);
  let value = 0;
  let contributors = 0;
  for (const userId of participants) {
    const s = summarize(byUser.get(userId), keys);
    const part = goal.metric === 'GROUP_MINUTES' ? s.cappedMinutes : s.activeDays;
    value += part;
    if (part > 0) contributors++;
  }
  const reached = value >= goal.target;
  const status = reached ? 'REACHED' : today < goal.startKey ? 'UPCOMING' : today > goal.endKey ? 'ENDED' : 'ACTIVE';
  return { value, percent: Math.min(100, Math.round((value / Math.max(1, goal.target)) * 100)), reached, status, contributors };
}

export interface AchievementInput {
  roomsJoined: number;
  last7: PeriodSummary;
  currentStreak: number;
  longestStreak: number;
  goalsHelped: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  earned: boolean;
}

/** Conquistas pessoais no grupo. Nada de "horas sem parar": premia constância. */
export function achievements(input: AchievementInput): Achievement[] {
  return [
    { code: 'FIRST_ROOM', title: 'Primeira sala', description: 'Estudou numa sala do grupo.', earned: input.roomsJoined >= 1 },
    { code: 'WEEK_3', title: 'Ritmo começando', description: 'Estudou em 3 dos últimos 7 dias.', earned: input.last7.activeDays >= 3 },
    { code: 'WEEK_7', title: 'Semana completa', description: 'Estudou nos 7 últimos dias.', earned: input.last7.activeDays >= 7 },
    { code: 'STREAK_14', title: 'Duas semanas seguidas', description: 'Chegou a 14 dias seguidos de estudo.', earned: input.longestStreak >= 14 },
    { code: 'TEAM_GOAL', title: 'Meta em equipe', description: 'Ajudou o grupo a cumprir uma meta coletiva.', earned: input.goalsHelped >= 1 },
  ];
}
