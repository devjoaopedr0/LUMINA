/**
 * Gerador de provas (item 38). Funções puras: cotas por dificuldade,
 * versões (ordem das questões e das alternativas) e o gabarito de cada uma.
 */
import { shuffle } from './list-generator';

export const EXAM_RULES = {
  maxSections: 8,
  maxPerSection: 45,
  maxTotal: 90,
  maxVersions: 4,
} as const;

export type Difficulty = 'FACIL' | 'MEDIA' | 'DIFICIL';
export const DIFFICULTIES: Difficulty[] = ['FACIL', 'MEDIA', 'DIFICIL'];

/** Divide `count` pelas porcentagens (maiores restos), somando exatamente `count`. */
export function difficultyQuotas(count: number, mix: Record<Difficulty, number>): Record<Difficulty, number> {
  const total = DIFFICULTIES.reduce((s, d) => s + Math.max(0, mix[d] ?? 0), 0);
  if (total <= 0) throw new Error('Mistura de dificuldade vazia.');
  const raw = DIFFICULTIES.map((d) => ({ d, exact: (count * Math.max(0, mix[d] ?? 0)) / total }));
  const out = Object.fromEntries(raw.map((r) => [r.d, Math.floor(r.exact)])) as Record<Difficulty, number>;
  let left = count - DIFFICULTIES.reduce((s, d) => s + out[d], 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left <= 0) break;
    out[r.d]++;
    left--;
  }
  return out;
}

/** "A", "B", "C", "D". */
export function versionLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

export interface ItemAlternative {
  position: number;
  text: string;
}

/** Embaralha as alternativas, renumera 1..n e devolve a nova posição da correta. */
export function permuteAlternatives(alternatives: ItemAlternative[], correctPosition: number, random: () => number = Math.random) {
  const ordered = [...alternatives].sort((a, b) => a.position - b.position);
  const shuffled = shuffle(ordered, random);
  const renumbered = shuffled.map((a, i) => ({ position: i + 1, text: a.text }));
  const newCorrect = shuffled.findIndex((a) => a.position === correctPosition) + 1;
  if (newCorrect < 1) throw new Error('Alternativa correta não encontrada.');
  return { alternatives: renumbered, correctPosition: newCorrect };
}

export interface BaseItem {
  questionId: string;
  stem: string;
  subject: string;
  alternatives: ItemAlternative[];
  correctPosition: number;
}

/**
 * Itens de cada versão. A versão A mantém a ordem e as alternativas da prévia;
 * as outras embaralham a ordem das questões e, se pedido, as alternativas.
 * Cada versão tem o próprio gabarito (correctPosition por item).
 */
export function buildVersions(base: BaseItem[], versions: number, shuffleAlternatives: boolean, random: () => number = Math.random) {
  return Array.from({ length: versions }, (_, v) => {
    const order = v === 0 ? base : shuffle(base, random);
    const items = order.map((item, i) => {
      const alt = v > 0 && shuffleAlternatives ? permuteAlternatives(item.alternatives, item.correctPosition, random) : { alternatives: item.alternatives, correctPosition: item.correctPosition };
      return { position: i + 1, questionId: item.questionId, stem: item.stem, subject: item.subject, ...alt };
    });
    return { label: versionLabel(v), items, answerKey: items.map((it) => ({ position: it.position, answer: versionLabel(it.correctPosition - 1) })) };
  });
}
