import type {
  Flashcard,
  FlashcardRating,
  FlashcardSource,
} from './api';

/** Vocabulário e recortes da tela de flashcards, sem React: os checks do app
 *  carregam este módulo direto, como fazem os outros módulos folha. */

export type FiltroFlashcards = 'TODOS' | 'VENCIDOS' | 'NOVOS';

/** Mesmo limite do backend; a checagem local evita upload inútil. */
export const MAX_FLASHCARD_PDF_BYTES = 8 * 1024 * 1024;

export function validarArquivoPdf(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Escolha um arquivo PDF.';
  if (file.size > MAX_FLASHCARD_PDF_BYTES) return 'O PDF passa do limite de 8 MB.';
  return null;
}

export const FILTROS_FLASHCARDS: Array<{ value: FiltroFlashcards; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'VENCIDOS', label: 'Para hoje' },
  { value: 'NOVOS', label: 'Novos' },
];

export const ROTULO_FONTE: Record<FlashcardSource, string> = {
  MANUAL: 'Criado por você',
  ERROR_NOTEBOOK: 'Veio do caderno de erros',
  AI: 'Gerado pela LuminIA',
};

export const ROTULO_NOTA: Record<FlashcardRating, string> = {
  AGAIN: 'Não lembrei',
  HARD: 'Lembrei com esforço',
  GOOD: 'Lembrei',
  EASY: 'Foi fácil',
};

export const NOTAS: Array<{ value: FlashcardRating; className: string }> = [
  { value: 'AGAIN', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' },
  { value: 'HARD', className: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { value: 'GOOD', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { value: 'EASY', className: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' },
];

export function filtrarFlashcards(cards: Flashcard[], filtro: FiltroFlashcards): Flashcard[] {
  if (filtro === 'VENCIDOS') return cards.filter((card) => card.due);
  if (filtro === 'NOVOS') return cards.filter((card) => card.reviewCount === 0);
  return cards;
}

/** Texto curto do rodapé do cartão: sem revisão ainda é diferente de zero
 *  acertos, e a tela não pode tratar os dois como a mesma coisa. */
export function descreverDesempenhoDoCartao(card: Pick<Flashcard, 'reviewCount' | 'accuracy'>): string {
  if (card.reviewCount === 0) return 'Ainda não revisado';
  return `${card.reviewCount} ${card.reviewCount === 1 ? 'revisão' : 'revisões'} · ${
    card.accuracy ?? 0
  }% de lembrança`;
}
