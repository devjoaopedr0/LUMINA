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
 *  3. θ vira nota pela régua da área (ENEM_SCALE): nota = centro +
 *     inclinação·θ, limitada ao piso e ao teto que a prova teve.
 *
 * Calibração (C3 — docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md, "Calibração"): a
 * discriminação, o deslocamento de dificuldade e a régua de cada área foram
 * ajustados para a relação acertos → nota de uma prova de 45 questões
 * (11 fáceis, 25 médias, 9 difíceis, acertando primeiro as mais fáceis) bater
 * com a do ENEM 2025: notas por número de acertos dos microdados e as notas
 * mínima e máxima de cada área. Erro médio do ajuste: 11 pontos em Matemática,
 * 5 em Linguagens, menos de 1 em Humanas. Natureza só tinha mínima e máxima: o
 * deslocamento dela é o de Matemática. Refazer o ajuste a cada edição nova.
 */

/**
 * Dificuldade (parâmetro b) de cada nível cadastrado, na escala do ENEM, em
 * que θ = 0 é o candidato médio — e o candidato médio acerta bem menos da
 * metade da prova. Por isso até a questão "fácil" fica em b = 0.
 */
export const DIFFICULTY_B: Record<QuestionDifficulty, number> = { FACIL: 0, MEDIA: 1, DIFICIL: 2 };
/**
 * Deslocamento de dificuldade por área: muda a FORMA da curva acertos → nota
 * (onde ela sobe mais rápido). Ajustado aos dados do ENEM 2025 junto com a
 * régua; sozinho, não quer dizer que uma área é mais fácil que a outra.
 */
const AREA_B_SHIFT: Record<StudyArea, number> = { LINGUAGENS: -0.65, HUMANAS: -0.6, NATUREZA: -0.2, MATEMATICA: -0.2 };
/** Discriminação (parâmetro a) — igual para todas; 0,8 foi o que melhor
 *  reproduziu o ENEM 2025 (testados 0,6 a 1,4). */
export const DISCRIMINATION = 0.8;
export const SCALING = 1.7;
const DEFAULT_ALTERNATIVES = 5;

/**
 * Régua de cada área: nota = center + slope·θ, entre min e max — as notas
 * mínima e máxima da área no ENEM 2025. `center` é a nota de θ = 0, que não é
 * a média nacional (a média de 2025 ficou perto de 530 em Linguagens e
 * Matemática, 517 em Humanas e 495 em Natureza): é só o ponto em que a reta
 * ajustada corta θ = 0.
 */
export const ENEM_SCALE: Record<StudyArea, { min: number; center: number; slope: number; max: number }> = {
  LINGUAGENS: { min: 309, center: 542, slope: 100, max: 795 },
  HUMANAS: { min: 321, center: 574, slope: 112, max: 856 },
  NATUREZA: { min: 309, center: 557, slope: 122, max: 859 },
  MATEMATICA: { min: 313, center: 605, slope: 146, max: 980 },
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

/** θ na régua da área, entre o piso e o teto que a prova teve. */
export function thetaToScore(area: StudyArea, theta: number): number {
  const { min, center, slope, max } = ENEM_SCALE[area];
  return Math.round(Math.max(min, Math.min(max, center + slope * theta)));
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
