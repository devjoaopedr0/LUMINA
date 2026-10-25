import { QuestionDifficulty, StudyArea } from '@prisma/client';
import { DIFFICULTY_B, DISCRIMINATION, SCALING } from '../schedules/enem-tri';

/**
 * Calibração da dificuldade das questões pelo acerto real dos alunos
 * (cronograma adaptativo, calibração C1 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md, "Calibração").
 *
 * A nota estilo TRI (schedules/enem-tri.ts) tira o parâmetro b de cada questão
 * do nível cadastrado (fácil, média, difícil). Isso trata igual duas "médias"
 * que os alunos acertam 80% e 30% das vezes. Aqui o acerto observado ajusta o
 * b de cada questão, com três cuidados:
 *
 *  - A calibração é RELATIVA ao próprio banco: a referência de cada nível é o
 *    acerto de todas as questões daquele nível na mesma área. Os alunos do app
 *    não são a população do ENEM, então o nível cadastrado continua sendo a
 *    âncora da escala; o acerto só diz se a questão é mais fácil ou mais
 *    difícil que as outras do mesmo nível.
 *  - Só conta a PRIMEIRA resposta de cada aluno (refazer depois de ver o
 *    gabarito não mede a questão), e só a partir de MIN_RESPONDENTS alunos
 *    diferentes — com um aluno só, a calibração seria o desempenho dele
 *    rebaixando a própria nota.
 *  - O ajuste é encolhido em direção a zero (n / (n + SHRINK)) e tem teto: com
 *    poucas respostas ele quase não mexe; com muitas, vale o observado.
 */

/** Menos alunos diferentes que isso e a questão fica com o b do nível. */
export const MIN_RESPONDENTS = 5;
/** Respostas somadas que as outras questões do nível precisam ter na área para servir de referência. */
export const MIN_REFERENCE_RESPONSES = 30;
/** Quantas respostas pesam tanto quanto o nível cadastrado. */
const SHRINK = 20;
/** O ajuste nunca passa de um nível inteiro para cima ou para baixo. */
const MAX_OFFSET = 1;
/** A mesma inclinação da nota estilo TRI, para o ajuste sair na escala de b. */
const SLOPE = SCALING * DISCRIMINATION;
const DEFAULT_ALTERNATIVES = 5;

export interface QuestionResponseStats {
  questionId: string;
  area: StudyArea;
  difficulty: QuestionDifficulty;
  alternatives?: number;
  /** Alunos diferentes que responderam (primeira resposta de cada um). */
  respondents: number;
  /** Quantos desses acertaram de primeira. */
  correct: number;
}

export interface QuestionCalibration {
  /** Somado ao b do nível na nota estilo TRI. 0 = sem dado suficiente. */
  offset: number;
  respondents: number;
  /** Acerto de primeira observado, 0-100. */
  accuracy: number;
  /** Nível que o acerto observado sugere; só com base suficiente. */
  suggestedDifficulty: QuestionDifficulty | null;
}

/** Acerto descontado o chute: 0 = só chute, 1 = todo mundo sabe. */
function knowledgeRate(correct: number, respondents: number, alternatives?: number): number {
  const guess = 1 / (alternatives && alternatives > 1 ? alternatives : DEFAULT_ALTERNATIVES);
  // +0,5/+1 evita 0% e 100%, que não têm logit.
  const rate = (correct + 0.5) / (respondents + 1);
  return Math.min(0.98, Math.max(0.02, (rate - guess) / (1 - guess)));
}

const logit = (p: number) => Math.log(p / (1 - p));

function nearestLevel(b: number): QuestionDifficulty {
  return (Object.entries(DIFFICULTY_B) as [QuestionDifficulty, number][]).reduce((best, entry) =>
    Math.abs(entry[1] - b) < Math.abs(best[1] - b) ? entry : best,
  )[0];
}

export function calibrateQuestions(stats: QuestionResponseStats[]): Map<string, QuestionCalibration> {
  // Referência: acerto somado de cada nível em cada área. Cada questão é
  // comparada com as OUTRAS do nível — senão uma questão muito respondida
  // vira a própria referência e nunca sai do lugar.
  const reference = new Map<string, { correct: number; respondents: number; alternatives: number; questions: number }>();
  for (const question of stats) {
    const key = `${question.area}:${question.difficulty}`;
    const group = reference.get(key) ?? { correct: 0, respondents: 0, alternatives: 0, questions: 0 };
    group.correct += question.correct;
    group.respondents += question.respondents;
    group.alternatives += question.alternatives ?? DEFAULT_ALTERNATIVES;
    group.questions += 1;
    reference.set(key, group);
  }

  const result = new Map<string, QuestionCalibration>();
  for (const question of stats) {
    const accuracy = question.respondents > 0 ? Math.round((100 * question.correct) / question.respondents) : 0;
    const group = reference.get(`${question.area}:${question.difficulty}`)!;
    const others = {
      correct: group.correct - question.correct,
      respondents: group.respondents - question.respondents,
      alternatives: Math.round(
        (group.alternatives - (question.alternatives ?? DEFAULT_ALTERNATIVES)) / Math.max(1, group.questions - 1),
      ),
    };
    if (question.respondents < MIN_RESPONDENTS || others.respondents < MIN_REFERENCE_RESPONSES) {
      result.set(question.questionId, { offset: 0, respondents: question.respondents, accuracy, suggestedDifficulty: null });
      continue;
    }
    // Acertam menos que as outras do nível → logit menor → b maior (mais difícil).
    const raw =
      (logit(knowledgeRate(others.correct, others.respondents, others.alternatives)) -
        logit(knowledgeRate(question.correct, question.respondents, question.alternatives))) /
      SLOPE;
    const weight = question.respondents / (question.respondents + SHRINK);
    const offset = Math.round(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, weight * raw)) * 100) / 100;
    const suggested = nearestLevel(DIFFICULTY_B[question.difficulty] + offset);
    result.set(question.questionId, {
      offset,
      respondents: question.respondents,
      accuracy,
      suggestedDifficulty: suggested === question.difficulty ? null : suggested,
    });
  }
  return result;
}
