import assert from 'node:assert/strict';
import {
  descreverVencimento,
  detalheDoItem,
  diasAte,
  rotuloOrigem,
  totalPendente,
} from '../src/lib/review-queue.ts';
import type { ReviewQueueItem, ReviewQueueKind } from '../src/lib/api.ts';

/**
 * Regras de leitura da central de revisões (item 31). O servidor decide o que
 * venceu; aqui se prova que a interface traduz o dia sem inventar urgência e
 * que cada origem tem um detalhe próprio.
 */

const HOJE = new Date(2026, 10, 6, 9, 30); // 06/11/2026, 09:30 local

const item = (
  kind: ReviewQueueKind,
  overrides: Partial<ReviewQueueItem> = {},
): ReviewQueueItem => ({
  kind,
  id: 'item-1',
  questionId: kind === 'TOPIC' ? null : 'question-1',
  subjectId: kind === 'TOPIC' ? 'subject-1' : null,
  subject: 'Matemática',
  topicId: kind === 'TOPIC' ? 'topic-1' : null,
  topic: 'Funções',
  dueAt: '2026-11-05T00:00:00.000Z',
  masteryScore: kind === 'TOPIC' ? 62 : null,
  status: kind === 'TOPIC' ? 'PRATICANDO' : null,
  attempts: kind === 'TOPIC' ? 5 : kind === 'MARKED_QUESTION' ? 2 : null,
  correctAttempts: kind === 'TOPIC' ? 3 : kind === 'MARKED_QUESTION' ? 1 : null,
  accuracy: kind === 'TOPIC' ? 60 : kind === 'MARKED_QUESTION' ? 50 : null,
  wrongAttempts: kind === 'ERROR_NOTEBOOK' ? 2 : null,
  correctStreak: kind === 'ERROR_NOTEBOOK' ? 1 : null,
  difficulty: kind === 'TOPIC' ? null : 'MEDIA',
  exam: kind === 'TOPIC' ? null : 'ENEM',
  year: kind === 'TOPIC' ? null : 2023,
  stem: kind === 'TOPIC' ? null : 'Considere a função f(x) = 2^x.',
  lastAttemptAt: null,
  ...overrides,
});

assert.equal(diasAte('2026-11-05T00:00:00.000Z', HOJE), -1);
assert.equal(diasAte('2026-11-06T23:59:59.000Z', HOJE), 0);

assert.equal(descreverVencimento(null, HOJE), 'Sem data');
assert.equal(descreverVencimento('2026-11-05T00:00:00.000Z', HOJE), 'Venceu ontem');
assert.equal(descreverVencimento('2026-11-03T00:00:00.000Z', HOJE), 'Venceu há 3 dias');
assert.equal(descreverVencimento('2026-11-06T00:00:00.000Z', HOJE), 'Vence hoje');
assert.equal(descreverVencimento('2026-11-07T00:00:00.000Z', HOJE), 'Amanhã');
assert.equal(descreverVencimento('2026-11-09T00:00:00.000Z', HOJE), 'Em 3 dias');
assert.equal(descreverVencimento('2026-11-20T00:00:00.000Z', HOJE), 'Em 20/11/2026');

assert.equal(rotuloOrigem('TOPIC'), 'Tópico');
assert.equal(rotuloOrigem('ERROR_NOTEBOOK'), 'Caderno de erros');
assert.equal(rotuloOrigem('MARKED_QUESTION'), 'Marcada por você');

assert.equal(detalheDoItem(item('TOPIC')), 'Domínio 62/100 · 5 tentativas');
assert.equal(
  detalheDoItem(item('ERROR_NOTEBOOK')),
  '2 erros · 1 de 2 acertos seguidos',
);
assert.equal(
  detalheDoItem(item('MARKED_QUESTION')),
  '50% de acertos · 2 tentativas',
);
assert.equal(
  detalheDoItem(item('MARKED_QUESTION', { attempts: 0, accuracy: null })),
  'Ainda não respondida',
);

assert.equal(totalPendente({ due: { total: 3 }, manual: { total: 2 } }), 5);
assert.equal(totalPendente({ due: { total: 0 }, manual: { total: 0 } }), 0);

console.log('revisão espaçada: checks ok');
