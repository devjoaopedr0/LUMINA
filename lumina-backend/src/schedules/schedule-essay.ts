import { StudyEssayFrequency } from '@prisma/client';

/**
 * Rotina de redação (cronograma adaptativo, fase 5 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §9). Redação não entra na divisão
 * diária por matéria: é UMA atividade por semana (ou a cada duas), num ciclo
 * fixo de três etapas.
 */
export interface EssayStep {
  title: string;
  description: string;
}

export const ESSAY_CYCLE: EssayStep[] = [
  {
    title: 'Redação — Repertório',
    description: 'Leia e anote dados, autores e fatos para usar como repertório sociocultural.',
  },
  {
    title: 'Redação — Estrutura e produção',
    description: 'Planeje introdução, desenvolvimento e proposta de intervenção e escreva uma redação completa.',
  },
  {
    title: 'Redação — Competências e correção',
    description: 'Releia a última redação pelas 5 competências do ENEM e envie para correção.',
  },
];

const DAY_MS = 86_400_000;

/** Semana do cronograma (0 = a que começa no dia de início) em que `date` cai. */
export function scheduleWeekIndex(startDate: Date, date: Date): number {
  return Math.floor((date.getTime() - startDate.getTime()) / DAY_MS / 7);
}

/**
 * Etapa de redação da semana, ou null quando a semana não tem redação
 * (rotina quinzenal, semana ímpar). Sem frequência definida vale semanal.
 */
export function essayStepForWeek(
  weekIndex: number,
  frequency: StudyEssayFrequency | null,
): EssayStep | null {
  if (weekIndex < 0) return null;
  if (frequency === StudyEssayFrequency.BIWEEKLY) {
    if (weekIndex % 2 === 1) return null;
    return ESSAY_CYCLE[(weekIndex / 2) % ESSAY_CYCLE.length];
  }
  return ESSAY_CYCLE[weekIndex % ESSAY_CYCLE.length];
}

/**
 * Dia da redação dentro da semana: o dia com mais tempo de estudo; em caso
 * de empate, o último (redação pede um bloco longo, e fim de semana costuma
 * ser onde ele cabe).
 */
export function pickEssaySession<T extends { date: Date; scheduledMinutes: number }>(
  weekSessions: T[],
): T | null {
  let best: T | null = null;
  for (const session of weekSessions) {
    if (session.scheduledMinutes <= 0) continue;
    if (
      !best ||
      session.scheduledMinutes > best.scheduledMinutes ||
      (session.scheduledMinutes === best.scheduledMinutes && session.date > best.date)
    ) {
      best = session;
    }
  }
  return best;
}
