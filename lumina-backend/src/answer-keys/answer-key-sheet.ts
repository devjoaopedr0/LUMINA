import { LOW_CONFIDENCE, QuestionReading } from '../simulations/omr/omr';
import { buildSheetLayout, encodeSheetCode, SheetLayout } from '../simulations/omr/sheet-layout';

/**
 * Cartão-resposta da Lumina para conferir um gabarito. Usa o mesmo layout e a
 * mesma leitura óptica do scanner de simulados, com o código 0: o scanner de
 * simulados sorteia códigos a partir de 1, então um cartão de gabarito nunca é
 * confundido com a folha de um aluno num simulado.
 */
export const ANSWER_KEY_SHEET_CODE = 0;

export function answerKeySheetLayout(numbers: number[], needsLanguage: boolean): SheetLayout {
  if (!numbers.length) throw new Error('Gabarito sem questões.');
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (!contiguous) throw new Error('O cartão impresso só funciona com questões em sequência.');
  return buildSheetLayout(numbers.map(() => 5), {
    showInstitution: false,
    institutionName: null,
    instructions: [
      'Marque uma única alternativa por questão, preenchendo a bolha inteira com caneta preta ou azul escura.',
      'Fotografe a folha inteira, com os quatro quadrados pretos aparecendo. Você confere a leitura antes de corrigir.',
    ],
    phrase: null,
    bookletColors: [],
    foreignLanguage: needsLanguage,
    firstQuestionNumber: numbers[0],
  });
}

export const answerKeySheetBits = () => encodeSheetCode(ANSWER_KEY_SHEET_CODE);

export interface SheetAnswer {
  number: number;
  selected: number | null;
  status: QuestionReading['status'];
  confidence: number;
  /** Duvidosa: o aluno precisa olhar antes de corrigir. */
  review: boolean;
}

/** Leitura → respostas pelo número impresso (91, 92… no 2º dia). */
export function readingToAnswers(layout: SheetLayout, questions: QuestionReading[]): SheetAnswer[] {
  return questions.map((q) => {
    const display = layout.questions.find((l) => l.number === q.number)?.displayNumber ?? q.number;
    const review = q.status === 'AMBIGUOUS' || q.status === 'MULTIPLE' || q.confidence < LOW_CONFIDENCE;
    // Dupla marcação fica em branco (anula, como no Enem), mas sinalizada.
    return { number: display, selected: q.status === 'MULTIPLE' ? null : q.selected, status: q.status, confidence: q.confidence, review };
  });
}
