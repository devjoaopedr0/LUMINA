import type { TopicPriorityTerms } from './schedule-priority';

/**
 * Pesos da prioridade pelo ganho real de domínio (calibração C4 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md, "Calibração").
 *
 * A prioridade (§4) soma cinco termos com pesos chutados. Dois deles dizem o
 * que VALE estudar (incidência na prova e o objetivo do aluno) e não se medem
 * pelo aprendizado: ficam fixos. Os outros três (baixo domínio, nunca
 * estudado, tempo parado) são apostas sobre ONDE estudar rende mais — e isso
 * dá para conferir: depois de cada tarefa concluída, quanto o domínio do
 * tópico subiu.
 *
 *  - Para cada termo de aprendizado, a correlação entre o valor dele quando a
 *    tarefa foi feita e o ganho de domínio nos dias seguintes. Correlação
 *    negativa ou nula vira zero: o termo não está apontando para ganho.
 *  - O peso somado dos três (0,65) não muda; ele é redividido na proporção
 *    das correlações. A prioridade continua na mesma escala.
 *  - Só com MIN_STUDENTS alunos e MIN_SAMPLES tarefas; o ajuste é encolhido
 *    (n / (n + MIN_SAMPLES)) em direção aos pesos padrão, e cada peso fica
 *    entre metade e uma vez e meia o padrão.
 *  - Termo sem variação nas amostras (todas as tarefas de tópico novo, por
 *    exemplo) não tem como ser comparado: sem calibração.
 */

export interface PriorityWeights {
  baixoDominio: number;
  incidencia: number;
  naoEstudado: number;
  recencia: number;
  pesoObjetivo: number;
}

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  baixoDominio: 0.35,
  incidencia: 0.25,
  naoEstudado: 0.15,
  recencia: 0.15,
  pesoObjetivo: 0.1,
};

/** Os termos que medem onde estudar rende — os únicos calibrados. */
export const LEARNING_TERMS = ['baixoDominio', 'naoEstudado', 'recencia'] as const;
type LearningTerm = (typeof LEARNING_TERMS)[number];

export const MIN_STUDENTS = 10;
export const MIN_SAMPLES = 200;
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 1.5;

export interface PriorityGainSample {
  userId: string;
  terms: Pick<TopicPriorityTerms, 'baixoDominio' | 'naoEstudado' | 'recencia'>;
  /** Domínio depois da janela menos o domínio antes da tarefa (-100 a 100). */
  gain: number;
}

export interface PriorityCalibration {
  weights: PriorityWeights;
  samples: number;
  students: number;
  /** Correlação de cada termo com o ganho; null quando não houve calibração. */
  correlations: Record<LearningTerm, number> | null;
}

function termValue(sample: PriorityGainSample, term: LearningTerm): number {
  const value = sample.terms[term];
  return typeof value === 'boolean' ? (value ? 100 : 0) : value;
}

function correlation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
    varY += (ys[i] - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

export function calibratePriorityWeights(samples: PriorityGainSample[]): PriorityCalibration {
  const students = new Set(samples.map((sample) => sample.userId)).size;
  const uncalibrated = { weights: { ...DEFAULT_PRIORITY_WEIGHTS }, samples: samples.length, students, correlations: null };
  if (students < MIN_STUDENTS || samples.length < MIN_SAMPLES) return uncalibrated;

  const gains = samples.map((sample) => sample.gain);
  const correlations = {} as Record<LearningTerm, number>;
  for (const term of LEARNING_TERMS) {
    const r = correlation(samples.map((sample) => termValue(sample, term)), gains);
    if (r === null) return uncalibrated;
    correlations[term] = r;
  }

  const budget = LEARNING_TERMS.reduce((sum, term) => sum + DEFAULT_PRIORITY_WEIGHTS[term], 0);
  const positive = LEARNING_TERMS.reduce((sum, term) => sum + Math.max(0, correlations[term]), 0);
  // Nenhum termo aponta para ganho: não há o que redividir.
  if (positive === 0) return { ...uncalibrated, correlations };

  const shrink = samples.length / (samples.length + MIN_SAMPLES);
  const shrunk = {} as Record<LearningTerm, number>;
  for (const term of LEARNING_TERMS) {
    const base = DEFAULT_PRIORITY_WEIGHTS[term];
    const target = (budget * Math.max(0, correlations[term])) / positive;
    shrunk[term] = base + shrink * (target - base);
  }
  // Cada peso fica dentro dos limites e a soma volta para o total dos três:
  // todos são multiplicados pelo mesmo fator e presos aos limites, com o
  // fator achado por bisseção (a soma só cresce com ele). Os limites somados
  // (0,325 a 0,975) sempre comportam o total.
  const clampedAt = (factor: number, term: LearningTerm) => {
    const base = DEFAULT_PRIORITY_WEIGHTS[term];
    return Math.min(MAX_FACTOR * base, Math.max(MIN_FACTOR * base, shrunk[term] * factor));
  };
  const sumAt = (factor: number) => LEARNING_TERMS.reduce((sum, term) => sum + clampedAt(factor, term), 0);
  let low = 0;
  let high = 1;
  while (sumAt(high) < budget) high *= 2;
  for (let i = 0; i < 60; i++) {
    const middle = (low + high) / 2;
    if (sumAt(middle) < budget) low = middle;
    else high = middle;
  }
  const weights = { ...DEFAULT_PRIORITY_WEIGHTS };
  for (const term of LEARNING_TERMS) weights[term] = Math.round(clampedAt(high, term) * 1000) / 1000;

  return { weights, samples: samples.length, students, correlations };
}
