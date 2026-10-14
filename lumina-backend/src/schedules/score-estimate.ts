import { QuestionDifficulty, StudyArea } from '@prisma/client';
import { ENEM_SCALE, triScore } from './enem-tri';

/**
 * Estimativa da nota do ENEM do aluno, pelo desempenho nas questões do app —
 * as avulsas e, principalmente, as dos simulados (um simulado modelo ENEM
 * traz 45 questões por área de uma vez).
 *
 * Cada área recebe uma nota estilo TRI (enem-tri.ts): o mesmo modelo da
 * prova, com os parâmetros das questões vindos da dificuldade cadastrada. É
 * uma APROXIMAÇÃO, e a tela diz isso; por isso sai sempre em FAIXA, mais
 * larga quanto menos questões o aluno respondeu.
 *
 * Com poucas questões numa área não há estimativa para ela: melhor "responda
 * mais N" do que um número sem base.
 */

/** Piso e teto de cada área (a régua completa está em enem-tri.ts). */
export const AREA_SCALE: Record<StudyArea, { min: number; max: number }> = ENEM_SCALE;

export const AREA_ORDER: StudyArea[] = [
  StudyArea.LINGUAGENS,
  StudyArea.HUMANAS,
  StudyArea.NATUREZA,
  StudyArea.MATEMATICA,
];

/** Menos que isso numa área e a estimativa dela não é mostrada. */
export const MIN_QUESTIONS_PER_AREA = 10;
/** Com menos áreas estimadas que isso, não há média. */
export const MIN_AREAS_FOR_AVERAGE = 2;

export interface AreaAnswer {
  isCorrect: boolean;
  difficulty: QuestionDifficulty;
  /** Número de alternativas da questão (acerto no chute). */
  alternatives?: number;
}

export interface AreaEstimate {
  area: StudyArea;
  answered: number;
  correct: number;
  /** Acerto simples, 0-100 (o que o aluno reconhece). */
  accuracy: number | null;
  /** Nota estimada e faixa; null enquanto faltam questões. */
  estimate: number | null;
  low: number | null;
  high: number | null;
  /** Quantas questões faltam para a área ter estimativa. */
  missing: number;
}

export function estimateArea(area: StudyArea, answers: AreaAnswer[]): AreaEstimate {
  const answered = answers.length;
  const correct = answers.filter((answer) => answer.isCorrect).length;
  const accuracy = answered > 0 ? Math.round((100 * correct) / answered) : null;
  if (answered < MIN_QUESTIONS_PER_AREA) {
    return { area, answered, correct, accuracy, estimate: null, low: null, high: null, missing: MIN_QUESTIONS_PER_AREA - answered };
  }

  const { score, low, high } = triScore(area, answers);
  return { area, answered, correct, accuracy, estimate: score, low, high, missing: 0 };
}

export interface ScoreEstimate {
  areas: (AreaEstimate & { label: string })[];
  /** Redação: média das últimas correções concluídas (0-1000). */
  essay: { score: number | null; corrections: number };
  /** Média estimada do ENEM. null enquanto não há pelo menos duas áreas. */
  average: {
    estimate: number;
    low: number;
    high: number;
    /** Quantas das 5 notas (4 áreas + redação) entraram na média. */
    parts: number;
    complete: boolean;
  } | null;
  /** Meta pela nota de corte do Sisu, quando o perfil permite calcular. */
  target: { score: number; course: string | null; university: string | null; year: number | null } | null;
  /** Meta menos a média estimada: positivo = falta; negativo = já passou. */
  gap: number | null;
  /** Frase pronta para a tela e para a LuminIA. */
  message: string;
}

const ESSAY_MARGIN = 40;

export function buildScoreEstimate(input: {
  answersByArea: Partial<Record<StudyArea, AreaAnswer[]>>;
  areaLabels: Record<StudyArea, string>;
  essayScores: number[];
  target: ScoreEstimate['target'];
}): ScoreEstimate {
  const areas = AREA_ORDER.map((area) => ({
    ...estimateArea(area, input.answersByArea[area] ?? []),
    label: input.areaLabels[area],
  }));
  const essayScore = input.essayScores.length
    ? Math.round(input.essayScores.reduce((sum, score) => sum + score, 0) / input.essayScores.length)
    : null;

  const estimated = areas.filter((area) => area.estimate !== null);
  let average: ScoreEstimate['average'] = null;
  if (estimated.length >= MIN_AREAS_FOR_AVERAGE) {
    const parts = [
      ...estimated.map((area) => ({ estimate: area.estimate!, low: area.low!, high: area.high! })),
      ...(essayScore !== null
        ? [{ estimate: essayScore, low: Math.max(0, essayScore - ESSAY_MARGIN), high: Math.min(1000, essayScore + ESSAY_MARGIN) }]
        : []),
    ];
    const mean = (pick: (part: (typeof parts)[number]) => number) =>
      Math.round(parts.reduce((sum, part) => sum + pick(part), 0) / parts.length);
    average = {
      estimate: mean((part) => part.estimate),
      low: mean((part) => part.low),
      high: mean((part) => part.high),
      parts: parts.length,
      complete: parts.length === AREA_ORDER.length + 1,
    };
  }

  const gap = average && input.target ? Math.round((input.target.score - average.estimate) * 10) / 10 : null;

  let message: string;
  if (!average) {
    const missing = areas.filter((area) => area.estimate === null);
    message =
      `Ainda não dá para estimar a sua nota: é preciso pelo menos ${MIN_QUESTIONS_PER_AREA} questões respondidas em ${MIN_AREAS_FOR_AVERAGE} áreas. ` +
      `Faltam ${missing.map((area) => `${area.missing} em ${area.label}`).join(', ')}.`;
  } else {
    const range = `entre ${average.low} e ${average.high}`;
    const basis = average.complete ? '' : ` (com ${average.parts} das 5 notas)`;
    const versusTarget =
      gap === null
        ? ''
        : gap > 0
          ? ` Faltam cerca de ${Math.round(gap)} pontos para a meta de ${input.target!.score}.`
          : ` Isso já alcança a meta de ${input.target!.score}.`;
    message = `Pelo seu desempenho nas questões, sua média no ENEM hoje ficaria em torno de ${average.estimate}, ${range}${basis}.${versusTarget}`;
  }

  return { areas, essay: { score: essayScore, corrections: input.essayScores.length }, average, target: input.target, gap, message };
}
