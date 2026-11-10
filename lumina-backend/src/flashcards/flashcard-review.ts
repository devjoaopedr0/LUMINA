import { FlashcardRating } from '@prisma/client';
import { reviewDay } from '../questions/review-day';

/**
 * Relógio de revisão dos flashcards (item 32).
 *
 * É um SM-2 simplificado: a nota diz quanto esforço o aluno precisou para
 * lembrar, o intervalo cresce com o sucesso e recua no esquecimento, e o fator
 * de facilidade ajusta o crescimento. As regras ficam aqui, puras, para que o
 * serviço só persista a decisão e o teste não dependa de banco.
 *
 * A data segue a convenção da plataforma: dia-calendário de Brasília gravado
 * como meia-noite UTC. Assim "vence hoje" não muda às 21:00 de Brasília.
 */

export interface FlashcardReviewState {
  intervalDays: number;
  easeFactor: number;
  streak: number;
  reviewCount: number;
  correctCount: number;
}

export interface FlashcardReviewDecision extends FlashcardReviewState {
  remembered: boolean;
  nextReviewAt: Date;
}

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

function clampEase(value: number): number {
  return Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, value)) * 100) / 100;
}

/**
 * Decide o próximo intervalo e a próxima data.
 *
 * - AGAIN: não lembrou. Volta amanhã, zera a sequência de acertos e reduz a
 *   facilidade.
 * - HARD: lembrou com dificuldade. Intervalo cresce pouco, zera a sequência e
 *   reduz a facilidade.
 * - GOOD: lembrou. Primeiro dia, três dias e depois cresce pelo fator.
 * - EASY: lembrou sem esforço. Primeiro intervalo maior e crescimento extra.
 */
export function decideFlashcardReview(
  now: Date,
  current: FlashcardReviewState,
  rating: FlashcardRating,
): FlashcardReviewDecision {
  const remembered = rating !== FlashcardRating.AGAIN;
  let easeFactor = current.easeFactor;
  let intervalDays: number;
  let streak: number;

  switch (rating) {
    case FlashcardRating.AGAIN:
      easeFactor = clampEase(easeFactor - 0.2);
      intervalDays = 1;
      streak = 0;
      break;
    case FlashcardRating.HARD:
      easeFactor = clampEase(easeFactor - 0.15);
      intervalDays = Math.max(1, Math.round(current.intervalDays * 1.2));
      streak = 0;
      break;
    case FlashcardRating.EASY:
      easeFactor = clampEase(easeFactor + 0.15);
      intervalDays =
        current.intervalDays <= 0
          ? 4
          : Math.max(2, Math.round(current.intervalDays * easeFactor * 1.3));
      streak = current.streak + 1;
      break;
    case FlashcardRating.GOOD:
    default:
      intervalDays =
        current.intervalDays <= 0
          ? 1
          : current.intervalDays === 1
            ? 3
            : Math.max(2, Math.round(current.intervalDays * easeFactor));
      streak = current.streak + 1;
      break;
  }

  return {
    intervalDays,
    easeFactor,
    streak,
    reviewCount: current.reviewCount + 1,
    correctCount: current.correctCount + (remembered ? 1 : 0),
    remembered,
    nextReviewAt: reviewDay(now, intervalDays),
  };
}
