/** Endpoint que cria a variação no servidor. */
export const SIMILAR_QUESTION_ENDPOINT = '/ai/questions/similar';

/**
 * O cliente envia só a questão de referência. Enunciado, alternativas,
 * gabarito, disciplina e dificuldade são carregados no servidor — o navegador
 * não consegue induzir a IA a criar uma questão com dados inventados.
 */
export function buildSimilarQuestionPayload(questionId: string): string {
  const id = questionId.trim();
  if (!id) throw new Error('Escolha uma questão de referência.');
  return JSON.stringify({ questionId: id });
}
