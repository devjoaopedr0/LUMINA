import assert from 'node:assert/strict';
import {
  descreverDesempenhoDoCartao,
  FILTROS_FLASHCARDS,
  filtrarFlashcards,
  MAX_FLASHCARD_PDF_BYTES,
  NOTAS,
  ROTULO_FONTE,
  ROTULO_NOTA,
  validarArquivoPdf,
} from '../src/lib/flashcards.ts';
import type { Flashcard } from '../src/lib/api.ts';

/**
 * Recortes da tela de flashcards (item 32). A fila e o agendamento são do
 * servidor; aqui se prova que "para hoje" e "novos" não se confundem e que a
 * interface não inventa retenção para um cartão nunca revisado.
 */

const cartao = (overrides: Partial<Flashcard>): Flashcard => ({
  id: 'card-1',
  source: 'MANUAL',
  front: 'Frente',
  back: 'Verso',
  subjectId: null,
  subject: null,
  topicId: null,
  topic: null,
  sourceQuestionId: null,
  reviewCount: 0,
  correctCount: 0,
  accuracy: null,
  streak: 0,
  intervalDays: 0,
  easeFactor: 2.5,
  nextReviewAt: '2026-11-09T00:00:00.000Z',
  lastReviewedAt: null,
  due: true,
  createdAt: '2026-11-09T12:00:00.000Z',
  updatedAt: '2026-11-09T12:00:00.000Z',
  ...overrides,
});

const novo = cartao({ id: 'novo' });
const vencido = cartao({ id: 'vencido', reviewCount: 2, correctCount: 1, accuracy: 50, due: true });
const adiado = cartao({ id: 'adiado', reviewCount: 1, correctCount: 1, accuracy: 100, due: false });

assert.equal(FILTROS_FLASHCARDS.length, 3);
assert.equal(ROTULO_FONTE.MANUAL, 'Criado por você');
assert.equal(ROTULO_FONTE.ERROR_NOTEBOOK, 'Veio do caderno de erros');
assert.equal(ROTULO_NOTA.AGAIN, 'Não lembrei');
assert.equal(NOTAS.map((nota) => nota.value).join(','), 'AGAIN,HARD,GOOD,EASY');

assert.deepEqual(
  filtrarFlashcards([novo, vencido, adiado], 'TODOS').map((card) => card.id),
  ['novo', 'vencido', 'adiado'],
);
assert.deepEqual(
  filtrarFlashcards([novo, vencido, adiado], 'VENCIDOS').map((card) => card.id),
  ['novo', 'vencido'],
);
assert.deepEqual(
  filtrarFlashcards([novo, vencido, adiado], 'NOVOS').map((card) => card.id),
  ['novo'],
);

assert.equal(descreverDesempenhoDoCartao(novo), 'Ainda não revisado');
assert.equal(descreverDesempenhoDoCartao(adiado), '1 revisão · 100% de lembrança');
assert.equal(descreverDesempenhoDoCartao(vencido), '2 revisões · 50% de lembrança');

assert.equal(validarArquivoPdf({ name: 'resumo.pdf', type: 'application/pdf', size: 1024 }), null);
assert.equal(
  validarArquivoPdf({ name: 'resumo.pdf', type: '', size: 1024 }),
  null,
  'extensão .pdf basta quando o navegador não informa o mime',
);
assert.equal(
  validarArquivoPdf({ name: 'foto.png', type: 'image/png', size: 1024 }),
  'Escolha um arquivo PDF.',
);
assert.equal(
  validarArquivoPdf({ name: 'grande.pdf', type: 'application/pdf', size: MAX_FLASHCARD_PDF_BYTES + 1 }),
  'O PDF passa do limite de 8 MB.',
);

console.log('flashcards: checks ok');
