/**
 * Prática da tarefa do cronograma: em vez de só marcar "Concluir", o aluno
 * responde um bloco de questões do tópico e a tarefa se conclui com o
 * resultado. As respostas passam pela tentativa normal de questão, que já
 * atualiza o domínio do tópico — aqui só se escolhe o que perguntar e se
 * conta o que foi respondido.
 */

/** Quantas questões entram num bloco de prática. */
export const PRACTICE_QUESTIONS_PER_TASK = 10;

/** As tentativas do bloco contam se foram feitas nesta janela antes de a
 *  tarefa ser concluída — cobre quem começa, para e volta no mesmo dia. */
export const PRACTICE_WINDOW_HOURS = 12;

interface PracticeCandidate {
  progress?: { attempts: number; correctAttempts: number; incorrectAttempts: number } | null;
}

/**
 * Ordem do bloco: primeiro o que o aluno nunca respondeu (é o que mais diz
 * sobre o domínio), depois o que ele mais erra, por último o que já acerta.
 * Dentro de cada grupo fica a ordem em que as questões vieram.
 */
export function pickPracticeQuestions<T extends PracticeCandidate>(
  pool: T[],
  limit = PRACTICE_QUESTIONS_PER_TASK,
): T[] {
  const rank = (question: T) => {
    const progress = question.progress;
    if (!progress || progress.attempts === 0) return 0;
    return progress.incorrectAttempts >= progress.correctAttempts ? 1 : 2;
  };
  const errorRate = (question: T) => {
    const progress = question.progress;
    return progress && progress.attempts > 0 ? progress.incorrectAttempts / progress.attempts : 0;
  };
  return pool
    .map((question, index) => ({ question, index }))
    .sort(
      (a, b) =>
        rank(a.question) - rank(b.question) ||
        errorRate(b.question) - errorRate(a.question) ||
        a.index - b.index,
    )
    .slice(0, limit)
    .map((entry) => entry.question);
}

/** Resultado do bloco: a ÚLTIMA resposta de cada questão é a que vale (o
 *  aluno pode ter respondido de novo depois de errar). */
export function summarizePractice(
  attempts: { questionId: string; isCorrect: boolean; createdAt: Date }[],
): { answered: number; correct: number } {
  const latest = new Map<string, { isCorrect: boolean; createdAt: Date }>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.questionId);
    if (!current || attempt.createdAt > current.createdAt) latest.set(attempt.questionId, attempt);
  }
  const results = [...latest.values()];
  return { answered: results.length, correct: results.filter((attempt) => attempt.isCorrect).length };
}
