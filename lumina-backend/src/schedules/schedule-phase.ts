import { StudyActivityType } from '@prisma/client';

/**
 * Fases do cronograma pela proximidade da prova (cronograma adaptativo,
 * fase 3 — ver docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §7).
 *
 * A fase é função pura das datas, então é calculada na hora em vez de ficar
 * gravada em `StudySchedule` (o design previa um campo `currentPhase`
 * "recalculado a cada geração" — guardado, ele ficaria desatualizado entre
 * uma geração e outra, e mudar a data da prova exigiria regravar).
 */
export type SchedulePhase = 'BASE' | 'CONSOLIDACAO' | 'PREPARACAO';

const CONSOLIDACAO_FROM = 0.5;
const PREPARACAO_FROM = 0.8;
const DAY_MS = 86_400_000;

/** `date` é o dia da sessão sendo gerada — um dia futuro já nasce na fase
 *  em que ele vai cair, não na fase de hoje. */
export function computeSchedulePhase(startDate: Date, examDate: Date, date: Date): SchedulePhase {
  const totalDays = (examDate.getTime() - startDate.getTime()) / DAY_MS;
  // Prova no próprio dia de início (ou antes): não há reta para dividir.
  if (totalDays <= 0) return 'PREPARACAO';
  const elapsed = (date.getTime() - startDate.getTime()) / DAY_MS / totalDays;
  if (elapsed >= PREPARACAO_FROM) return 'PREPARACAO';
  if (elapsed >= CONSOLIDACAO_FROM) return 'CONSOLIDACAO';
  return 'BASE';
}

/** Proporção do tempo do dia por tipo de atividade em cada fase (§7). É um
 *  alvo, não uma trava: quando não há tópico elegível para um tipo, o tempo
 *  vai para os outros. */
export const PHASE_MIX: Record<SchedulePhase, Record<StudyActivityType, number>> = {
  BASE: { TEORIA: 0.5, QUESTOES: 0.35, REVISAO: 0.15, SIMULADO: 0, REDACAO: 0 },
  CONSOLIDACAO: { TEORIA: 0.15, QUESTOES: 0.5, REVISAO: 0.35, SIMULADO: 0, REDACAO: 0 },
  PREPARACAO: { TEORIA: 0.05, QUESTOES: 0.35, REVISAO: 0.3, SIMULADO: 0.3, REDACAO: 0 },
};

export const PHASE_LABEL: Record<SchedulePhase, string> = {
  BASE: 'Base',
  CONSOLIDACAO: 'Consolidação',
  PREPARACAO: 'Preparação',
};
