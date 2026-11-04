/**
 * Conferência de respostas contra um gabarito — função pura, sem banco.
 *
 * Regras:
 * - questão anulada (gabarito sem resposta) não conta no percentual;
 * - item ainda não validado (gabarito sugerido/comunitário) aparece como
 *   "pendente" e também não conta: não dá para afirmar acerto ou erro;
 * - em branco conta como erro no percentual (como no vestibular), mas é
 *   mostrado à parte;
 * - nas questões de língua estrangeira (Enem, 1º dia, 1–5) vale o item da
 *   língua escolhida.
 *
 * Percentual de acerto não é nota TRI: a TRI precisa dos parâmetros de cada
 * item, que a banca não publica junto com o gabarito.
 */

export type CheckStatus = 'CORRECT' | 'WRONG' | 'BLANK' | 'PENDING' | 'ANNULLED';

export interface GradingItem {
  number: number;
  language: string;
  answer: number | null;
  area: string | null;
  validated: boolean;
  /** Concordância (0–1) no gabarito comunitário. */
  confidence?: number | null;
  /** Questão do banco ligada a este item (para a LuminIA explicar). */
  questionId?: string | null;
}

export interface QuestionResult {
  number: number;
  /** Língua do item usado (Enem 1º dia); vazio quando não há versões. */
  language: string;
  area: string | null;
  selected: number | null;
  answer: number | null;
  status: CheckStatus;
  /** Questão do banco ligada a este item; nulo quando ainda não há vínculo. */
  questionId: string | null;
  /** Só nos pendentes do comunitário: concordância da resposta mais votada. */
  agreement?: number | null;
}

export interface AreaResult {
  area: string;
  correct: number;
  wrong: number;
  blank: number;
  scored: number;
  percent: number;
}

export interface GradingResult {
  questions: QuestionResult[];
  correct: number;
  wrong: number;
  blank: number;
  pending: number;
  annulled: number;
  total: number;
  answered: number;
  /** Acertos sobre as questões que contam (sem anuladas nem pendentes). */
  percent: number;
  byArea: AreaResult[];
  /**
   * Estimativa com os itens pendentes (comunitário): quantas respostas batem
   * com a mais votada. Nunca entra no resultado oficial.
   */
  provisional: { matches: number; differs: number; blank: number };
}

export class GradingError extends Error {}

export const LANGUAGES = ['INGLES', 'ESPANHOL'] as const;

/** Área do Enem pela numeração oficial (1º dia: 1–45 LC, 46–90 CH; 2º dia: 91–135 CN, 136–180 MT). */
export function enemArea(number: number): string | null {
  if (number >= 1 && number <= 45) return 'Linguagens, Códigos e suas Tecnologias';
  if (number <= 90) return 'Ciências Humanas e suas Tecnologias';
  if (number <= 135) return 'Ciências da Natureza e suas Tecnologias';
  if (number <= 180) return 'Matemática e suas Tecnologias';
  return null;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** Números do gabarito (uma vez cada) e se algum exige a escolha da língua. */
export function keyNumbers(items: GradingItem[]): { numbers: number[]; needsLanguage: boolean } {
  const numbers = [...new Set(items.map((i) => i.number))].sort((a, b) => a - b);
  return { numbers, needsLanguage: items.some((i) => i.language !== '') };
}

export function gradeAnswers(items: GradingItem[], answers: Record<string, number | null | undefined>, language?: string | null): GradingResult {
  const { numbers, needsLanguage } = keyNumbers(items);
  if (needsLanguage && !LANGUAGES.includes((language ?? '') as (typeof LANGUAGES)[number])) {
    throw new GradingError('Escolha a língua estrangeira (inglês ou espanhol) para conferir as questões de língua.');
  }
  const known = new Set(numbers.map(String));
  const extra = Object.keys(answers).filter((k) => !known.has(k));
  if (extra.length) throw new GradingError(`Questões fora do gabarito: ${extra.slice(0, 5).join(', ')}.`);

  const questions: QuestionResult[] = numbers.map((number) => {
    const forNumber = items.filter((i) => i.number === number);
    const item = forNumber.find((i) => i.language === (language ?? '')) ?? forNumber.find((i) => i.language === '') ?? forNumber[0];
    const raw = answers[String(number)];
    if (raw !== null && raw !== undefined && (!Number.isInteger(raw) || raw < 1 || raw > 5)) throw new GradingError(`Resposta inválida na questão ${number}.`);
    const selected = raw ?? null;
    let status: CheckStatus;
    if (item.answer === null) status = 'ANNULLED';
    else if (!item.validated) status = 'PENDING';
    else if (selected === null) status = 'BLANK';
    else status = selected === item.answer ? 'CORRECT' : 'WRONG';
    return {
      number,
      language: item.language,
      area: item.area,
      selected,
      answer: item.answer,
      status,
      questionId: item.questionId ?? null,
      ...(status === 'PENDING' ? { agreement: item.confidence ?? null } : {}),
    };
  });

  const count = (s: CheckStatus, list = questions) => list.filter((q) => q.status === s).length;
  const areas = [...new Set(questions.map((q) => q.area ?? 'Geral'))];
  const byArea = areas.map((area) => {
    const list = questions.filter((q) => (q.area ?? 'Geral') === area);
    const correct = count('CORRECT', list);
    const wrong = count('WRONG', list);
    const blank = count('BLANK', list);
    const scored = correct + wrong + blank;
    return { area, correct, wrong, blank, scored, percent: pct(correct, scored) };
  });
  const correct = count('CORRECT');
  const wrong = count('WRONG');
  const blank = count('BLANK');
  return {
    questions,
    correct,
    wrong,
    blank,
    pending: count('PENDING'),
    annulled: count('ANNULLED'),
    total: questions.length,
    answered: questions.filter((q) => q.selected !== null).length,
    percent: pct(correct, correct + wrong + blank),
    byArea,
    provisional: {
      matches: questions.filter((q) => q.status === 'PENDING' && q.selected !== null && q.selected === q.answer).length,
      differs: questions.filter((q) => q.status === 'PENDING' && q.selected !== null && q.selected !== q.answer).length,
      blank: questions.filter((q) => q.status === 'PENDING' && q.selected === null).length,
    },
  };
}

/** "A".."E" → 1..5; "X"/"ANULADA"/vazio → null (anulada). */
export function letterToPosition(letter: string | null | undefined): number | null {
  const v = (letter ?? '').trim().toUpperCase();
  const i = ['A', 'B', 'C', 'D', 'E'].indexOf(v);
  return i >= 0 ? i + 1 : null;
}
