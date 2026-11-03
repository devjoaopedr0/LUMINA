import { StudyActivityType } from '@prisma/client';
import { ACTIVITY_DURATION_MINUTES } from './schedule-priority';

/**
 * Duração de cada tipo de atividade no ritmo do aluno (calibração C2 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md, "Calibração").
 *
 * As durações fixas (Teoria 40 min, Revisão 20...) são chutes. Quem sempre
 * leva uma hora numa teoria de 40 minutos fica com o dia atrasado; quem resolve
 * em 25 deixa tempo sem uso. Aqui o tempo medido nas tarefas concluídas ajusta
 * a duração de cada tipo, com cuidado:
 *
 *  - vale a MEDIANA da razão medido/agendado — uma tarefa esquecida aberta não
 *    puxa tudo;
 *  - só a partir de MIN_SAMPLES tarefas medidas do tipo, e o ajuste é
 *    encolhido (n / (n + MIN_SAMPLES)) em direção à duração padrão;
 *  - a duração fica entre 75% e 150% da padrão e em múltiplos de 5 minutos;
 *  - medições absurdas (menos de 20% ou mais de 3x o agendado) ficam de fora.
 */

export const MIN_SAMPLES = 4;
const MIN_RATIO = 0.2;
const MAX_RATIO = 3;
const MIN_FACTOR = 0.75;
const MAX_FACTOR = 1.5;

export interface DurationSample {
  activityType: StudyActivityType;
  scheduledMinutes: number;
  /** Tempo medido na tarefa (cronômetro da tarefa ou duração do simulado). */
  actualMinutes: number;
}

export type ActivityDurations = Record<StudyActivityType, number>;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function personalDurations(samples: DurationSample[]): ActivityDurations {
  const durations = { ...ACTIVITY_DURATION_MINUTES };
  for (const type of Object.values(StudyActivityType)) {
    const ratios = samples
      .filter((sample) => sample.activityType === type && sample.scheduledMinutes > 0)
      .map((sample) => sample.actualMinutes / sample.scheduledMinutes)
      .filter((ratio) => ratio >= MIN_RATIO && ratio <= MAX_RATIO);
    if (ratios.length < MIN_SAMPLES) continue;
    const weight = ratios.length / (ratios.length + MIN_SAMPLES);
    const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, 1 + weight * (median(ratios) - 1)));
    durations[type] = Math.round((ACTIVITY_DURATION_MINUTES[type] * factor) / 5) * 5;
  }
  return durations;
}
