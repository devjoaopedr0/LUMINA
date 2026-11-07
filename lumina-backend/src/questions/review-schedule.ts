/**
 * Regras de revisão espaçada do caderno de erros.
 *
 * O tópico já tem o próprio relógio em `TopicMastery` (3 dias iniciais,
 * dobrando até 30, e erro resetando para 1). Aqui fica o relógio da questão
 * específica: o aluno errou, volta amanhã; acertou uma vez, volta em três
 * dias; acertou duas seguidas, a questão está dominada e sai da fila.
 *
 * A data é sempre o começo do dia em UTC, como as demais datas de revisão da
 * plataforma. Isso evita que "vence hoje" dependa da hora em que o aluno
 * abriu a tela.
 */

export const ERROR_REVIEW_WRONG_INTERVAL_DAYS = 1;
export const ERROR_REVIEW_FIRST_CORRECT_INTERVAL_DAYS = 3;

export type ErrorReviewOutcome = 'WRONG' | 'CORRECT';

/** Próximo dia de revisão à meia-noite UTC. */
export function errorReviewDay(now: Date, days: number): Date {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

/**
 * Próxima revisão de uma questão do caderno conforme o desempenho.
 *
 * - erro: volta amanhã;
 * - primeiro acerto: volta em três dias;
 * - `masteredStreak` acertos seguidos: não há mais revisão agendada (null).
 *
 * O limite de acertos vem de `ERROR_NOTEBOOK_MASTERED_STREAK`; recebê-lo como
 * parâmetro mantém esta função pura e testável sem importar o DTO.
 */
export function nextErrorReviewAt(
  now: Date,
  outcome: ErrorReviewOutcome,
  correctStreak: number,
  masteredStreak: number,
): Date | null {
  if (outcome === 'WRONG') {
    return errorReviewDay(now, ERROR_REVIEW_WRONG_INTERVAL_DAYS);
  }
  if (correctStreak >= masteredStreak) return null;
  return errorReviewDay(now, ERROR_REVIEW_FIRST_CORRECT_INTERVAL_DAYS);
}
