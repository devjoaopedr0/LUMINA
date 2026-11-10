import { FlashcardRating } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { decideFlashcardReview } from './flashcard-review';

const NOW = new Date('2026-11-09T15:00:00.000Z');

function state(overrides: Partial<Parameters<typeof decideFlashcardReview>[1]> = {}) {
  return {
    intervalDays: 0,
    easeFactor: 2.5,
    streak: 0,
    reviewCount: 0,
    correctCount: 0,
    ...overrides,
  };
}

describe('decideFlashcardReview', () => {
  it('começa em um dia no primeiro GOOD', () => {
    const result = decideFlashcardReview(NOW, state(), FlashcardRating.GOOD);
    expect(result.intervalDays).toBe(1);
    expect(result.streak).toBe(1);
    expect(result.correctCount).toBe(1);
    expect(result.nextReviewAt.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('passa para três dias no segundo GOOD e depois cresce pelo fator', () => {
    const second = decideFlashcardReview(
      NOW,
      state({ intervalDays: 1, streak: 1, reviewCount: 1, correctCount: 1 }),
      FlashcardRating.GOOD,
    );
    expect(second.intervalDays).toBe(3);
    expect(second.streak).toBe(2);

    const third = decideFlashcardReview(
      NOW,
      state({ intervalDays: 3, streak: 2, reviewCount: 2, correctCount: 2 }),
      FlashcardRating.GOOD,
    );
    expect(third.intervalDays).toBe(8);
    expect(third.streak).toBe(3);
  });

  it('AGAIN volta amanhã, zera a sequência e reduz a facilidade', () => {
    const result = decideFlashcardReview(
      NOW,
      state({ intervalDays: 10, easeFactor: 2.5, streak: 4, reviewCount: 5, correctCount: 4 }),
      FlashcardRating.AGAIN,
    );
    expect(result.intervalDays).toBe(1);
    expect(result.streak).toBe(0);
    expect(result.easeFactor).toBe(2.3);
    expect(result.correctCount).toBe(4);
    expect(result.remembered).toBe(false);
  });

  it('HARD lembra, mas zera a sequência e cresce pouco', () => {
    const result = decideFlashcardReview(
      NOW,
      state({ intervalDays: 10, easeFactor: 2.5, streak: 3, reviewCount: 4, correctCount: 3 }),
      FlashcardRating.HARD,
    );
    expect(result.intervalDays).toBe(12);
    expect(result.streak).toBe(0);
    expect(result.easeFactor).toBe(2.35);
    expect(result.correctCount).toBe(4);
    expect(result.remembered).toBe(true);
  });

  it('EASY tem primeiro intervalo maior e aumenta a facilidade', () => {
    const first = decideFlashcardReview(NOW, state(), FlashcardRating.EASY);
    expect(first.intervalDays).toBe(4);
    expect(first.easeFactor).toBe(2.65);

    const next = decideFlashcardReview(
      NOW,
      state({ intervalDays: 4, easeFactor: 2.65, streak: 1, reviewCount: 1, correctCount: 1 }),
      FlashcardRating.EASY,
    );
    expect(next.intervalDays).toBe(15);
  });

  it('mantém a facilidade entre 1,3 e 3,0', () => {
    const low = decideFlashcardReview(
      NOW,
      state({ easeFactor: 1.4 }),
      FlashcardRating.AGAIN,
    );
    expect(low.easeFactor).toBe(1.3);

    const high = decideFlashcardReview(
      NOW,
      state({ easeFactor: 2.95 }),
      FlashcardRating.EASY,
    );
    expect(high.easeFactor).toBe(3);
  });

  it('usa o dia de Brasília mesmo perto da virada em UTC', () => {
    // 02:00 UTC do dia 10 ainda é 23:00 do dia 9 em Brasília.
    const result = decideFlashcardReview(
      new Date('2026-11-10T02:00:00.000Z'),
      state(),
      FlashcardRating.GOOD,
    );
    expect(result.nextReviewAt.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });
});
