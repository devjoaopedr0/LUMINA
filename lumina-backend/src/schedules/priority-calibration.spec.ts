import { describe, expect, it } from 'vitest';
import {
  calibratePriorityWeights,
  DEFAULT_PRIORITY_WEIGHTS,
  LEARNING_TERMS,
  MIN_SAMPLES,
  MIN_STUDENTS,
  type PriorityGainSample,
} from './priority-calibration';
import { computeTopicPriority } from './schedule-priority';

/** Amostras variadas de MIN_STUDENTS alunos; `gain` decide o ganho de cada uma. */
function samples(count: number, gain: (terms: PriorityGainSample['terms']) => number, students = MIN_STUDENTS): PriorityGainSample[] {
  return Array.from({ length: count }, (_, i) => {
    const terms = {
      baixoDominio: (i * 37) % 101,
      naoEstudado: i % 3 === 0,
      recencia: ((i * 53) % 31) * (100 / 30),
    };
    return { userId: `aluno-${i % students}`, terms, gain: gain(terms) };
  });
}

const learningTotal = (weights: typeof DEFAULT_PRIORITY_WEIGHTS) =>
  LEARNING_TERMS.reduce((sum, term) => sum + weights[term], 0);

describe('pesos da prioridade pelo ganho de domínio (C4)', () => {
  it('sem alunos ou tarefas suficientes, ficam os pesos padrão', () => {
    expect(calibratePriorityWeights([]).weights).toEqual(DEFAULT_PRIORITY_WEIGHTS);
    const fewStudents = calibratePriorityWeights(samples(MIN_SAMPLES * 2, (t) => t.recencia, MIN_STUDENTS - 1));
    expect(fewStudents.weights).toEqual(DEFAULT_PRIORITY_WEIGHTS);
    expect(fewStudents.correlations).toBeNull();
    const fewTasks = calibratePriorityWeights(samples(MIN_SAMPLES - 1, (t) => t.recencia));
    expect(fewTasks.weights).toEqual(DEFAULT_PRIORITY_WEIGHTS);
  });

  it('o termo que acompanha o ganho sobe, os outros descem, e o total de aprendizado não muda', () => {
    const { weights, correlations } = calibratePriorityWeights(samples(2000, (t) => t.recencia / 5));
    expect(correlations!.recencia).toBeGreaterThan(0.9);
    expect(weights.recencia).toBeGreaterThan(DEFAULT_PRIORITY_WEIGHTS.recencia);
    expect(weights.baixoDominio).toBeLessThan(DEFAULT_PRIORITY_WEIGHTS.baixoDominio);
    expect(learningTotal(weights)).toBeCloseTo(learningTotal(DEFAULT_PRIORITY_WEIGHTS), 2);
  });

  it('incidência e objetivo do aluno não são calibrados', () => {
    const { weights } = calibratePriorityWeights(samples(2000, (t) => t.recencia));
    expect(weights.incidencia).toBe(DEFAULT_PRIORITY_WEIGHTS.incidencia);
    expect(weights.pesoObjetivo).toBe(DEFAULT_PRIORITY_WEIGHTS.pesoObjetivo);
  });

  it('nenhum peso sai da faixa de metade a uma vez e meia o padrão', () => {
    const { weights } = calibratePriorityWeights(samples(100_000, (t) => t.recencia));
    for (const term of LEARNING_TERMS) {
      // Folga só do arredondamento em milésimos.
      expect(weights[term]).toBeGreaterThanOrEqual(DEFAULT_PRIORITY_WEIGHTS[term] * 0.5 - 0.001);
      expect(weights[term]).toBeLessThanOrEqual(DEFAULT_PRIORITY_WEIGHTS[term] * 1.5 + 0.001);
    }
  });

  it('com mais tarefas o ajuste anda mais', () => {
    // Sinal em que nenhum peso bate no limite: o baixo domínio pesa menos do
    // que o padrão supõe.
    const gain = (t: PriorityGainSample['terms']) => t.baixoDominio + 0.8 * t.recencia + (t.naoEstudado ? 40 : 0);
    const few = calibratePriorityWeights(samples(MIN_SAMPLES, gain)).weights.baixoDominio;
    const many = calibratePriorityWeights(samples(MIN_SAMPLES * 10, gain)).weights.baixoDominio;
    expect(few).toBeLessThan(DEFAULT_PRIORITY_WEIGHTS.baixoDominio);
    expect(many).toBeLessThan(few);
  });

  it('termo sem variação ou ganho sem relação com nada deixa os pesos padrão', () => {
    const allNew = samples(1000, (t) => t.baixoDominio).map((s) => ({ ...s, terms: { ...s.terms, naoEstudado: true } }));
    expect(calibratePriorityWeights(allNew).weights).toEqual(DEFAULT_PRIORITY_WEIGHTS);
    const noGain = calibratePriorityWeights(samples(1000, () => 5));
    expect(noGain.weights).toEqual(DEFAULT_PRIORITY_WEIGHTS);
  });

  it('a prioridade usa os pesos calibrados', () => {
    const input = {
      masteryScore: 80,
      status: 'PRATICANDO' as const,
      lastStudiedAt: new Date('2026-09-01T00:00:00Z'),
      questionCount: 5,
      maxQuestionCountInSubject: 10,
      targetHours: 4,
      maxTargetHoursInSchedule: 4,
      now: new Date('2026-10-20T00:00:00Z'),
    };
    const { weights } = calibratePriorityWeights(samples(2000, (t) => t.recencia));
    // Tópico parado há muito tempo sobe quando o tempo parado é o que rende.
    expect(computeTopicPriority(input, weights)).toBeGreaterThan(computeTopicPriority(input));
  });
});
