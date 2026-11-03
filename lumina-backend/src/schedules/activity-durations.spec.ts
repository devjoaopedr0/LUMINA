import { describe, expect, it } from 'vitest';
import { MIN_SAMPLES, personalDurations, type DurationSample } from './activity-durations';
import { ACTIVITY_DURATION_MINUTES } from './schedule-priority';

const samples = (activityType: DurationSample['activityType'], actual: number[], scheduled = 40): DurationSample[] =>
  actual.map((actualMinutes) => ({ activityType, scheduledMinutes: scheduled, actualMinutes }));

describe('duração das atividades no ritmo do aluno', () => {
  it('sem tarefas medidas suficientes, vale a duração padrão', () => {
    expect(personalDurations([])).toEqual(ACTIVITY_DURATION_MINUTES);
    expect(personalDurations(samples('TEORIA', Array(MIN_SAMPLES - 1).fill(70))).TEORIA).toBe(ACTIVITY_DURATION_MINUTES.TEORIA);
  });

  it('quem leva mais tempo ganha tarefa mais longa; quem é rápido, mais curta — só no tipo medido', () => {
    const slow = personalDurations(samples('TEORIA', Array(12).fill(56)));
    expect(slow.TEORIA).toBeGreaterThan(40);
    expect(slow.QUESTOES).toBe(ACTIVITY_DURATION_MINUTES.QUESTOES);

    const fast = personalDurations(samples('QUESTOES', Array(12).fill(28)));
    expect(fast.QUESTOES).toBeLessThan(40);
    expect(fast.QUESTOES % 5).toBe(0);
  });

  it('a mediana ignora a tarefa esquecida aberta, e medições absurdas ficam de fora', () => {
    const withOutlier = personalDurations(samples('TEORIA', [40, 40, 40, 40, 40, 115]));
    expect(withOutlier.TEORIA).toBe(40);
    // 1 minuto em 40 (abriu e fechou) não conta: sobram só 3 medições.
    expect(personalDurations(samples('TEORIA', [1, 1, 1, 60, 60, 60])).TEORIA).toBe(40);
  });

  it('o ajuste fica entre 75% e 150% da duração padrão', () => {
    expect(personalDurations(samples('TEORIA', Array(100).fill(115))).TEORIA).toBe(60);
    expect(personalDurations(samples('REVISAO', Array(100).fill(5), 20)).REVISAO).toBe(15);
  });

  it('mais tarefas medidas, mais perto do ritmo observado', () => {
    const few = personalDurations(samples('TEORIA', Array(4).fill(60))).TEORIA;
    const many = personalDurations(samples('TEORIA', Array(40).fill(60))).TEORIA;
    expect(few).toBeLessThan(many);
    expect(many).toBe(60);
  });
});
