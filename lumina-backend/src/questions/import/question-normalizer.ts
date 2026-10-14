import {
  ExternalQuestion,
  ExternalQuestionOption,
  NormalizedQuestion,
} from '../domain/question-types';

/**
 * Contrato dos importadores: qualquer fonte (JSON, CSV, futuramente APIs e
 * datasets) precisa saber converter seu formato específico no
 * ExternalQuestion — o formato neutro do Lumina. O resultado é um array
 * (o source pode conter N questões de uma vez).
 */
export interface QuestionNormalizer {
  normalize(raw: unknown): ExternalQuestion[];
}

/**
 * Converte uma questão no formato neutro (ExternalQuestion) para o formato
 * interno (NormalizedQuestion), resolvendo a resposta correta a partir de
 * qualquer uma das três convenções aceitas:
 *
 *   1. options[i].correct = true/false (flag por alternativa);
 *   2. correctLetter = 'C' (letra da correta);
 *   3. correctOptionIndex = 2 (índice 0-based da correta).
 *
 * Se nenhuma correta for indicada, todas as alternativas ficam marcadas como
 * incorretas — o QuestionValidator reporta isso como questão inválida (o
 * gabarito nunca é "inventado" aqui).
 */
export function toNormalizedQuestion(external: ExternalQuestion): NormalizedQuestion {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  let correctIndex: number | null = null;

  const flaggedIndex = external.options.findIndex((option) => option.correct === true);
  if (flaggedIndex >= 0) {
    correctIndex = flaggedIndex;
  } else if (external.correctLetter) {
    const letterIndex = letters.indexOf(external.correctLetter.toUpperCase());
    if (letterIndex >= 0) correctIndex = letterIndex;
  } else if (external.correctOptionIndex !== undefined) {
    correctIndex = external.correctOptionIndex;
  }

  return {
    sourceType: external.sourceType,
    sourceName: external.sourceName.trim(),
    sourceId: external.sourceId?.trim() || null,
    exam: external.exam?.trim() || '',
    year: external.year ?? null,
    examNumber: external.examNumber ?? null,
    subject: external.subject.trim(),
    topic: external.topic?.trim() || '',
    difficulty: external.difficulty,
    stem: external.stem.trim(),
    alternatives: external.options.map((option: ExternalQuestionOption, index: number) => ({
      text: option.text.trim(),
      isCorrect: correctIndex === index,
      // A explicação do distrator é opcional e só aparece depois que o aluno
      // responde; por isso ela não pode "corrigir" a alternativa marcada.
      explanation: option.explanation?.trim() || null,
    })),
    explanation: external.explanation?.trim() || null,
    imageUrl: external.imageUrl?.trim() || null,
    sourcePdf: external.sourcePdf,
  };
}
