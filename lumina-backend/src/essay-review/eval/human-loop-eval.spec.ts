import { describe, expect, it } from 'vitest';
import { COMPETENCY_IDS, CompetencyId } from '../../essay-correction/knowledge';
import { aggregateReviewSamples, evaluateHumanLoop, HumanLoopSample, splitHumanLoopSamples } from './human-loop-eval';

function sample(index: number, shift = 40): HumanLoopSample {
  const base = 40 + (index % 4) * 40;
  const ai = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, base])) as Record<CompetencyId, number>;
  const human = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, Math.min(200, base + shift)])) as Record<CompetencyId, number>;
  return { essayId: `essay-${index}`, ai, human };
}

describe('avaliação held-out do aprendizado humano', () => {
  it('separa treino e teste por redação, sem vazamento', () => {
    const samples = Array.from({ length: 12 }, (_, index) => sample(index));
    const split = splitHumanLoopSamples(samples, 0.3);
    expect(split.train.length).toBeGreaterThan(0);
    expect(split.test.length).toBeGreaterThan(0);
    expect(split.disjoint).toBe(true);
    const trainIds = new Set(split.train.map((item) => item.essayId));
    expect(split.test.some((item) => trainIds.has(item.essayId))).toBe(false);
  });

  it('reduz o MAE no teste quando o viés aprendido no treino é consistente', () => {
    const samples = Array.from({ length: 12 }, (_, index) => sample(index));
    const report = evaluateHumanLoop(samples, 0.3);
    expect(report.baseline.totalMae).toBe(200);
    expect(report.calibrated.totalMae).toBe(0);
    expect(report.improvement.totalMae).toBe(200);
    expect(report.split.disjoint).toBe(true);
  });

  it('agrega avaliações repetidas da mesma redação antes de dividir', () => {
    const details = COMPETENCY_IDS.map((competency) => ({ competency, aiScore: 80, humanScore: 120 }));
    const samples = aggregateReviewSamples([
      { essayId: 'essay-a', details },
      { essayId: 'essay-a', details },
      { essayId: 'essay-b', details: COMPETENCY_IDS.map((competency) => ({ competency, aiScore: 40, humanScore: 80 })) },
    ]);
    expect(samples).toHaveLength(2);
    expect(samples[0].ai.C1).toBe(80);
    expect(samples[1].human.C5).toBe(80);
  });
});
