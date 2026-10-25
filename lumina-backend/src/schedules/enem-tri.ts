import { QuestionDifficulty, StudyArea } from '@prisma/client';

/**
 * Nota "estilo TRI" de um conjunto de respostas de uma área do ENEM.
 *
 * É o mesmo MODELO da prova (logístico de três parâmetros, o 3PL), com uma
 * diferença que precisa ficar clara: o ENEM calibra os parâmetros de cada
 * questão em pré-testes com milhares de alunos; aqui eles vêm da dificuldade
 * cadastrada da questão (fácil, média, difícil). Então o comportamento é o da
 * TRI — acertar as difíceis errando as fáceis vale menos do que o mesmo
 * número de acertos coerentes, e a nota não é proporcional aos acertos — mas
 * o número é uma aproximação, não a nota oficial.
 *
 * Passos:
 *  1. cada questão tem probabilidade de acerto
 *       P(θ) = c + (1 − c) / (1 + e^(−1,7·a·(θ − b)))
 *     b = dificuldade, a = discriminação, c = acerto no chute (1/alternativas);
 *  2. a proficiência θ do aluno é estimada por EAP (média da distribuição a
 *     posteriori, com priori normal padrão) — funciona mesmo com tudo certo
 *     ou tudo errado, onde a máxima verossimilhança não tem solução;
 *  3. θ vira nota na régua da área (ENEM_SCALE): θ = 0 é a média da área e
 *     θ = ±3 são o teto e o piso que a prova costuma ter.
 */

/**
 * Dificuldade (parâmetro b) de cada nível cadastrado, na escala do ENEM, em
 * que θ = 0 é o candidato médio — e o candidato médio acerta bem menos da
 * metade da prova. Por isso até a questão "fácil" fica em b = 0.
 */
export const DIFFICULTY_B: Record<QuestionDifficulty, number> = { FACIL: 0, MEDIA: 1, DIFICIL: 2 };
/**
 * Ajuste por área: as provas de Natureza e Matemática são mais difíceis para
 * o candidato médio (ele acerta menos questões nelas), então o mesmo número de
 * acertos vale mais nota. Valores escolhidos para a relação acertos → nota
 * ficar parecida com a das edições recentes; não são calibração oficial.
 */
const AREA_B_SHIFT: Record<StudyArea, number> = { LINGUAGENS: 0, HUMANAS: 0.1, NATUREZA: 0.5, MATEMATICA: 0.6 };
/** Discriminação (parâmetro a) — igual para todas, por falta de calibração. */
export const DISCRIMINATION = 1.1;
export const SCALING = 1.7;
const DEFAULT_ALTERNATIVES = 5;

/**
 * Régua de cada área: piso, média e teto aproximados das edições recentes do
 * ENEM (o INEP divulga a cada ano; variam alguns pontos). Conferir e ajustar
 * quando sair edição nova.
 */
export const ENEM_SCALE: Record<StudyArea, { min: number; mean: number; max: number }> = {
  LINGUAGENS: { min: 290, mean: 520, max: 820 },
  HUMANAS: { min: 290, mean: 520, max: 820 },
  NATUREZA: { min: 315, mean: 495, max: 870 },
  MATEMATICA: { min: 320, mean: 530, max: 960 },
};

const THETA_LIMIT = 3;
const THETA_STEP = 0.05;
const THETA_GRID = Array.from(
  { length: Math.round((2 * THETA_LIMIT) / THETA_STEP) + 1 },
  (_, index) => -THETA_LIMIT + index * THETA_STEP,
);

export interface TriItem {
  isCorrect: boolean;
  difficulty: QuestionDifficulty;
  /** Número de alternativas da questão (define o acerto no chute). */
  alternatives?: number;
  /** Ajuste do b pelo acerto real dos alunos (questions/question-calibration.ts). */
  bOffset?: number;
}

function probability(theta: number, item: TriItem, area: StudyArea): number {
  const guess = 1 / (item.alternatives && item.alternatives > 1 ? item.alternatives : DEFAULT_ALTERNATIVES);
  const b = DIFFICULTY_B[item.difficulty] + AREA_B_SHIFT[area] + (item.bOffset ?? 0);
  return guess + (1 - guess) / (1 + Math.exp(-SCALING * DISCRIMINATION * (theta - b)));
}

/** Proficiência (θ) e a incerteza dela, por EAP com priori normal padrão. */
export function estimateTheta(area: StudyArea, items: TriItem[]): { theta: number; sd: number } {
  // Em log para não zerar com muitas questões.
  const logPosterior = THETA_GRID.map((theta) => {
    let log = -(theta * theta) / 2;
    for (const item of items) {
      const p = probability(theta, item, area);
      log += Math.log(item.isCorrect ? p : 1 - p);
    }
    return log;
  });
  const peak = Math.max(...logPosterior);
  const weights = logPosterior.map((log) => Math.exp(log - peak));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const theta = THETA_GRID.reduce((sum, value, index) => sum + value * weights[index], 0) / total;
  const variance =
    THETA_GRID.reduce((sum, value, index) => sum + (value - theta) ** 2 * weights[index], 0) / total;
  return { theta, sd: Math.sqrt(variance) };
}

/** θ na régua da área: 0 é a média; +3 o teto; −3 o piso. */
export function thetaToScore(area: StudyArea, theta: number): number {
  const { min, mean, max } = ENEM_SCALE[area];
  const clamped = Math.max(-THETA_LIMIT, Math.min(THETA_LIMIT, theta));
  const perTheta = clamped >= 0 ? (max - mean) / THETA_LIMIT : (mean - min) / THETA_LIMIT;
  return Math.round(mean + clamped * perTheta);
}

export interface TriScore {
  /** Nota na régua da área. */
  score: number;
  /** Faixa de um desvio-padrão da proficiência: estreita com mais questões. */
  low: number;
  high: number;
}

export function triScore(area: StudyArea, items: TriItem[]): TriScore {
  const { theta, sd } = estimateTheta(area, items);
  return {
    score: thetaToScore(area, theta),
    low: thetaToScore(area, theta - sd),
    high: thetaToScore(area, theta + sd),
  };
}
