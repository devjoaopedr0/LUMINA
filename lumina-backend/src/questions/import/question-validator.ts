import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { NormalizedQuestion } from '../domain/question-types';

/** Regras de negócio validadas antes de qualquer inserção no banco. Questões
 * inválidas nunca entram silenciosamente — o importador as conta no relatório
 * como "inválidas", com os motivos. */
export class QuestionValidator {
  private static readonly MAX_ALTERNATIVES = 6;
  private static readonly MIN_ALTERNATIVES = 2;

  /** Retorna a lista de erros (vazia = válida). */
  validate(question: NormalizedQuestion): string[] {
    const errors: string[] = [];

    if (!question.stem || question.stem.length < 5) {
      errors.push('Enunciado (stem) é obrigatório com pelo menos 5 caracteres.');
    }
    if (!question.subject) {
      errors.push('Disciplina (subject) é obrigatória.');
    }
    if (!question.difficulty || !Object.values(QuestionDifficulty).includes(question.difficulty)) {
      errors.push('Dificuldade inválida (use FACIL, MEDIA ou DIFICIL).');
    }
    if (!question.sourceType || !Object.values(QuestionSourceType).includes(question.sourceType)) {
      errors.push('Origem (sourceType) inválida.');
    }
    if (!question.sourceName) {
      errors.push('Nome da fonte (sourceName) é obrigatório.');
    }
    if (question.year !== null && (question.year < 1970 || question.year > 2100)) {
      errors.push('Ano deve estar entre 1970 e 2100.');
    }

    const alternativeErrors = this.validateAlternatives(question.alternatives);
    errors.push(...alternativeErrors);

    return errors;
  }

  private validateAlternatives(
    alternatives: { text: string; isCorrect: boolean }[],
  ): string[] {
    const errors: string[] = [];

    if (alternatives.length < QuestionValidator.MIN_ALTERNATIVES) {
      errors.push(`A questão precisa de pelo menos ${QuestionValidator.MIN_ALTERNATIVES} alternativas.`);
    }
    if (alternatives.length > QuestionValidator.MAX_ALTERNATIVES) {
      errors.push(`A questão pode ter no máximo ${QuestionValidator.MAX_ALTERNATIVES} alternativas.`);
    }
    if (alternatives.some((alternative) => !alternative.text)) {
      errors.push('Todas as alternativas precisam de texto.');
    }

    const correctCount = alternatives.filter((alternative) => alternative.isCorrect).length;
    if (correctCount !== 1) {
      errors.push('É obrigatório indicar exatamente uma alternativa correta.');
    }

    return errors;
  }
}
