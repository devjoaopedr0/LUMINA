import { describe, expect, it } from 'vitest';
import {
  ERROR_REVIEW_FIRST_CORRECT_INTERVAL_DAYS,
  ERROR_REVIEW_WRONG_INTERVAL_DAYS,
  errorReviewDay,
  nextErrorReviewAt,
} from './review-schedule';

/**
 * O relógio da revisão é a decisão mais fácil de errar sem ninguém perceber:
 * uma data no passado some da fila, uma no futuro prende a questão por dias.
 * Estes testes fixam o contrato do caderno de erros.
 */
describe('revisão espaçada do caderno de erros', () => {
  const now = new Date('2026-11-06T18:42:13.000Z');

  it('erro reagenda para o dia seguinte à meia-noite UTC', () => {
    const next = nextErrorReviewAt(now, 'WRONG', 0, 2);

    expect(next?.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(ERROR_REVIEW_WRONG_INTERVAL_DAYS).toBe(1);
  });

  it('primeiro acerto empurra a revisão para três dias depois', () => {
    const next = nextErrorReviewAt(now, 'CORRECT', 1, 2);

    expect(next?.toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(ERROR_REVIEW_FIRST_CORRECT_INTERVAL_DAYS).toBe(3);
  });

  it('dois acertos seguidos encerram a revisão', () => {
    expect(nextErrorReviewAt(now, 'CORRECT', 2, 2)).toBeNull();
  });

  it('a data é o dia, não o instante em que o aluno respondeu', () => {
    const late = new Date('2026-11-06T23:59:59.999Z');

    expect(errorReviewDay(late, 1).toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });
});
