import { QuestionDifficulty } from '@prisma/client';
import { MAX_HINT_LEVEL, MIN_HINT_LEVEL } from '../dto/question-resolution.dto';

/**
 * Contexto entregue ao provedor de dicas.
 *
 * Repare no que NÃO está aqui: nem o gabarito, nem o texto das alternativas,
 * nem a posição da correta. A dica é útil justamente porque vem antes da
 * resposta, então o provedor trabalha com o enunciado e a classificação — a
 * garantia de que a dica não vaza a resposta é estrutural, não é promessa.
 */
export interface HintRequest {
  /** Enunciado da questão. */
  stem: string;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  /** Quantas alternativas existem (informação pública, já visível na tela). */
  alternativesCount: number;
  /** Nível pedido: 1 = onde revisar, 2 = o que conferir, 3 = como eliminar. */
  level: number;
}

/**
 * Gerador de dicas. A implementação de regras (`study-guide-hint.provider`)
 * funciona sem nenhuma chave externa; um provedor de modelo de linguagem pode
 * ser plugado depois (mesma interface, `name` diferente) sem tocar no serviço.
 */
export interface HintProvider {
  /** Identificador devolvido ao cliente (`rules`, `llm`, ...), para que a
   * interface seja honesta sobre a origem da dica. */
  readonly name: string;

  generate(request: HintRequest): Promise<string>;
}

/**
 * "de Matemática, assunto Funções exponenciais" — ou só "de Matemática",
 * quando a questão não tem assunto. Existe para a dica nunca terminar num
 * "assunto: ." (questão importada sem assunto é comum) e para o provedor e a
 * dica neutra do serviço falarem da questão do mesmo jeito.
 */
export function descricaoDaQuestao(alvo: {
  subject: string;
  topic?: string | null;
}): string {
  const assunto = alvo.topic?.trim();
  return assunto
    ? `de ${alvo.subject}, assunto ${assunto}`
    : `de ${alvo.subject}`;
}

export { MAX_HINT_LEVEL, MIN_HINT_LEVEL };
