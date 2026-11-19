/** Engajamento do Lumina Groups (etapa 3): placar opcional, metas e conquistas. */

export type RankingMetric = 'consistency' | 'hours' | 'streak';
export type RankingPeriod = 7 | 30;
export type GoalMetric = 'GROUP_MINUTES' | 'GROUP_STUDY_DAYS';
export type GoalStatus = 'ACTIVE' | 'REACHED' | 'ENDED' | 'UPCOMING';

export interface RankingEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isMe: boolean;
  position: number;
  value: number;
  activeDays: number;
  cappedMinutes: number;
  longestStreak: number;
}

export interface GroupGoal {
  id: string;
  title: string;
  metric: GoalMetric;
  target: number;
  startDate: string;
  endDate: string;
  createdBy: string;
  value: number;
  percent: number;
  reached: boolean;
  status: GoalStatus;
  contributors: number;
  myContribution: number | null;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  earned: boolean;
}

export interface GroupEngagement {
  rules: { dailyCapHours: number; minMinutesPerDay: number; maxActiveGoals: number; goalMaxDays: number };
  me: { rankingOptIn: boolean; iAmMinor: boolean };
  canManageGoals: boolean;
  ranking: { metric: RankingMetric; period: RankingPeriod; participantCount: number; entries: RankingEntry[] };
  goals: GroupGoal[];
  achievements: Achievement[];
}

export interface GoalPayload {
  title: string;
  metric: GoalMetric;
  target: number;
  days: number;
}

export const METRIC_LABEL: Record<RankingMetric, string> = {
  consistency: 'Constância',
  hours: 'Horas',
  streak: 'Maior sequência',
};

export const METRIC_HINT: Record<RankingMetric, string> = {
  consistency: 'Dias com estudo no período. É o placar padrão: ritmo vale mais que maratona.',
  hours: 'Horas estudadas no período, contando no máximo 10 h por dia.',
  streak: 'Maior sequência de dias seguidos com estudo nos últimos 60 dias.',
};

/** "43%", "12 h 30 min", "5 dias". */
export function formatRankingValue(metric: RankingMetric, value: number): string {
  if (metric === 'consistency') return `${value}%`;
  if (metric === 'streak') return value === 1 ? '1 dia' : `${value} dias`;
  return formatMinutes(value);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Progresso da meta em texto: "6 h de 20 h", "4 de 30 dias". */
export function goalProgressText(goal: Pick<GroupGoal, 'metric' | 'value' | 'target'>): string {
  if (goal.metric === 'GROUP_MINUTES') return `${formatMinutes(goal.value)} de ${formatMinutes(goal.target)}`;
  return `${goal.value} de ${goal.target} dias`;
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  ACTIVE: 'Em andamento',
  REACHED: 'Meta cumprida',
  ENDED: 'Encerrada',
  UPCOMING: 'Começa em breve',
};

/** "18/11 a 24/11". */
export function goalPeriod(startDate: string, endDate: string): string {
  const fmt = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
  return `${fmt(startDate)} a ${fmt(endDate)}`;
}

/** Formulário → payload. Horas viram minutos; valores fora da faixa viram erro. */
export function goalPayloadFromForm(data: { get(name: string): FormDataEntryValue | null }): GoalPayload | { error: string } {
  const title = String(data.get('title') ?? '').trim();
  const metric = data.get('metric') === 'GROUP_STUDY_DAYS' ? 'GROUP_STUDY_DAYS' : 'GROUP_MINUTES';
  const amount = Number(data.get('target'));
  const days = Number(data.get('days'));
  if (title.length < 3) return { error: 'Dê um nome à meta (pelo menos 3 letras).' };
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Informe quanto o grupo quer alcançar.' };
  if (!Number.isInteger(days) || days < 1 || days > 31) return { error: 'A meta dura de 1 a 31 dias.' };
  const target = metric === 'GROUP_MINUTES' ? Math.round(amount * 60) : Math.round(amount);
  return { title, metric, target, days };
}

/** Sugestões prontas (desafio da semana). */
export const GOAL_SUGGESTIONS: Array<{ title: string; metric: GoalMetric; amount: number; days: number }> = [
  { title: 'Desafio da semana: 20 h juntos', metric: 'GROUP_MINUTES', amount: 20, days: 7 },
  { title: 'Todo mundo no ritmo: 30 dias de estudo somados', metric: 'GROUP_STUDY_DAYS', amount: 30, days: 7 },
];
