import type { AnswerSheetQuestion } from '@/lib/api';

/** A questão precisa de conferência? Branco e dupla marcação nítidos não: valem como erro, como no Enem. */
export function needsReview(q: AnswerSheetQuestion): boolean {
  return q.status === 'AMBIGUOUS' || q.confidence < 0.75;
}
