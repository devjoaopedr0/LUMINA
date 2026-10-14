import assert from 'node:assert/strict';
import {
  ACERTOS_PARA_DOMINAR,
  contarFiltrosAtivos,
  dataLocal,
  diasEntre,
  descreverEvolucao,
  descreverRevisao,
  ERROR_REASONS,
  FILTROS_VAZIOS,
  filtrosParaApi,
  formatarData,
  lerEvolucao,
  opcoesRevisao,
  rotuloMotivo,
  SEM_MOTIVO,
  somarDias,
  type FiltrosCaderno,
} from '../src/lib/error-notebook.ts';
import {
  CLASSE_DIFICULDADE,
  origemDaQuestao,
  positionLetter,
  ROTULO_DIFICULDADE,
} from '../src/lib/question-labels.ts';
import { positionLetter as positionLetterDaTranscricao } from '../src/lib/question-transcription.ts';
import type { ErrorNotebookEntry, ErrorNotebookStatus } from '../src/lib/api.ts';

/**
 * Regras de leitura do caderno de erros (itens 12 e 13) sem navegador: os
 * rótulos do motivo, os atalhos de revisão e a frase que traduz a linha do
 * tempo. São exatamente as decisões que o typecheck não pega e que a interface
 * mostra ao aluno como se fossem verdade — por isso a trava fica aqui.
 */

const entrada = (overrides: Partial<ErrorNotebookEntry> = {}): ErrorNotebookEntry => ({
  questionId: 'question-1',
  subject: 'Matemática',
  topic: 'Funções exponenciais',
  difficulty: 'MEDIA',
  exam: 'ENEM',
  year: 2023,
  examNumber: 47,
  stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
  reason: null,
  notes: null,
  status: 'ABERTA',
  wrongAttempts: 1,
  correctStreak: 0,
  evolution: 'E',
  reviewScheduledAt: null,
  due: false,
  firstWrongAt: '2026-09-20T10:00:00.000Z',
  lastWrongAt: '2026-09-20T10:00:00.000Z',
  resolvedAt: null,
  ...overrides,
});

const HOJE = new Date(2026, 8, 26, 9, 30); // 26/09/2026, 09:30 no fuso do navegador

// --- Motivo do erro (item 13) -------------------------------------------------
// Todo motivo da lista tem rótulo e todo rótulo é distinto: nenhum motivo pode
// aparecer sem nome na interface.
assert.equal(ERROR_REASONS.length, 8);
for (const motivo of ERROR_REASONS) {
  assert.ok(rotuloMotivo(motivo).length > 3, `motivo ${motivo} sem rótulo`);
}
assert.equal(new Set(ERROR_REASONS.map(rotuloMotivo)).size, ERROR_REASONS.length);

// "Sem motivo" é escolha visível, não campo em branco: o que não foi
// classificado aparece com nome, para o aluno ver o que falta.
assert.equal(rotuloMotivo(null), 'Sem motivo');
assert.equal(rotuloMotivo(''), 'Sem motivo');
assert.equal(rotuloMotivo(undefined), 'Sem motivo');
assert.equal(rotuloMotivo('CHUTE'), 'Chute');
// Valor fora do vocabulário mostra o que veio, em vez de mentir com um rótulo.
assert.equal(rotuloMotivo('MOTIVO_INVENTADO'), 'MOTIVO_INVENTADO');

// O recorte "Sem motivo" do resumo usa um valor que não é um motivo do enum: é o
// filtro que pergunta justamente pelas entradas sem classificação.
assert.equal(SEM_MOTIVO, 'SEM_MOTIVO');
assert.ok(!ERROR_REASONS.includes(SEM_MOTIVO as never));
assert.deepEqual(filtrosParaApi({ ...FILTROS_VAZIOS, motivo: SEM_MOTIVO }, 1), {
  page: 1,
  limit: 20,
  reason: 'SEM_MOTIVO',
});

assert.equal(ACERTOS_PARA_DOMINAR, 2);

// --- Atalhos de revisão -------------------------------------------------------
assert.deepEqual(opcoesRevisao(HOJE), [
  { label: 'Hoje', value: '2026-09-26' },
  { label: 'Amanhã', value: '2026-09-27' },
  { label: 'Em 3 dias', value: '2026-09-29' },
  { label: 'Em 1 semana', value: '2026-10-03' },
]);

// Fim de mês e virada de ano: somar dias tem de virar o calendário, não 31.
assert.equal(dataLocal(somarDias(new Date(2026, 8, 30), 3)), '2026-10-03');
assert.equal(dataLocal(somarDias(new Date(2026, 11, 31), 1)), '2027-01-01');
assert.equal(dataLocal(new Date(2026, 0, 5)), '2026-01-05');

// A revisão é um dia de calendário, não um instante: a comparação não tem fuso
// no meio (o servidor grava à meia-noite UTC do dia escolhido).
assert.equal(diasEntre('2026-09-27', '2026-09-26'), 1);
assert.equal(diasEntre('2026-09-26', '2026-09-26'), 0);
assert.equal(diasEntre('2026-09-20', '2026-09-26'), -6);
assert.equal(diasEntre('2026-03-01', '2026-02-28'), 1);
assert.equal(formatarData('2026-09-27T00:00:00.000Z'), '27/09/2026');

assert.equal(descreverRevisao(entrada(), HOJE), 'Sem revisão marcada');
assert.equal(
  descreverRevisao(entrada({ reviewScheduledAt: '2026-09-26T00:00:00.000Z', due: true }), HOJE),
  'Revisão para hoje',
);
assert.equal(
  descreverRevisao(entrada({ reviewScheduledAt: '2026-09-25T00:00:00.000Z', due: true }), HOJE),
  'Revisão vencida ontem',
);
assert.equal(
  descreverRevisao(entrada({ reviewScheduledAt: '2026-09-20T00:00:00.000Z', due: true }), HOJE),
  'Revisão vencida em 20/09/2026',
);
assert.equal(
  descreverRevisao(entrada({ reviewScheduledAt: '2026-09-27T00:00:00.000Z', due: false }), HOJE),
  'Revisar amanhã',
);
assert.equal(
  descreverRevisao(entrada({ reviewScheduledAt: '2026-10-01T00:00:00.000Z', due: false }), HOJE),
  'Revisar em 5 dias',
);
assert.equal(
  descreverRevisao(entrada({ reviewScheduledAt: '2026-12-31T00:00:00.000Z', due: false }), HOJE),
  'Revisar em 31/12/2026',
);

// --- Linha do tempo -----------------------------------------------------------
assert.deepEqual(lerEvolucao('EAA'), [
  { marca: 'E', ordem: 1, titulo: 'Tentativa 1: errou' },
  { marca: 'A', ordem: 2, titulo: 'Tentativa 2: acertou' },
  { marca: 'A', ordem: 3, titulo: 'Tentativa 3: acertou' },
]);
// Uma sequência vazia é uma entrada sem tentativa, não um erro na leitura.
assert.deepEqual(lerEvolucao(''), []);

const aberta = (overrides: Partial<ErrorNotebookEntry> = {}) =>
  entrada({ status: 'ABERTA' as ErrorNotebookStatus, ...overrides });
const dominada = (overrides: Partial<ErrorNotebookEntry> = {}) =>
  entrada({ status: 'DOMINADA' as ErrorNotebookStatus, resolvedAt: '2026-09-26T10:00:00.000Z', ...overrides });

assert.equal(
  descreverEvolucao(aberta({ evolution: 'E' })),
  '1 tentativa registrada, sem acerto ainda.',
);
assert.equal(
  descreverEvolucao(aberta({ evolution: 'EE' })),
  '2 tentativas registradas, sem acerto ainda.',
);
assert.equal(
  descreverEvolucao(aberta({ evolution: 'EA', correctStreak: 1 })),
  'Em recuperação: 1 de 2 acertos seguidos (2 tentativas).',
);
assert.equal(
  descreverEvolucao(dominada({ evolution: 'EAA', correctStreak: 2 })),
  'Dominada — 2 acertos seguidos depois do erro, em 3 tentativas.',
);
// Errar de novo reabre: a contagem volta a zero e a frase deixa de prometer
// progresso.
assert.equal(
  descreverEvolucao(aberta({ evolution: 'EAAE', correctStreak: 0 })),
  '4 tentativas registradas, sem acerto ainda.',
);

// --- Filtros ------------------------------------------------------------------
const apertar = (mudanca: Partial<FiltrosCaderno>): FiltrosCaderno => ({
  ...FILTROS_VAZIOS,
  ...mudanca,
});

// A situação padrão é a fila aberta — a API já aplica, então não vai no filtro.
assert.equal(contarFiltrosAtivos(FILTROS_VAZIOS), 0);
assert.deepEqual(filtrosParaApi(FILTROS_VAZIOS, 1), { page: 1, limit: 20 });
assert.equal(contarFiltrosAtivos(apertar({ materia: 'Matemática' })), 1);
assert.equal(
  contarFiltrosAtivos(
    apertar({ materia: 'Matemática', assunto: 'Logaritmos', motivo: 'CHUTE', dificuldade: 'DIFICIL', soVencidas: true }),
  ),
  5,
);
assert.deepEqual(
  filtrosParaApi(
    apertar({ situacao: 'TODAS', materia: 'Matemática', assunto: 'Logaritmos', motivo: 'CHUTE', dificuldade: 'DIFICIL', soVencidas: true }),
    3,
    10,
  ),
  {
    page: 3,
    limit: 10,
    status: 'TODAS',
    subject: 'Matemática',
    topic: 'Logaritmos',
    reason: 'CHUTE',
    difficulty: 'DIFICIL',
    due: 'true',
  },
);
// Situação dominada é um filtro explícito; a vazia nunca viaja.
assert.deepEqual(filtrosParaApi(apertar({ situacao: 'DOMINADA' }), 1), {
  page: 1,
  limit: 20,
  status: 'DOMINADA',
});

// --- Rótulos de questão (compartilhados com o banco de questões) --------------
assert.equal(positionLetter(1), 'A');
assert.equal(positionLetter(5), 'E');
assert.equal(positionLetter(7), '7');
// A mesma convenção de letra na transcrição da busca web: é a mesma posição.
assert.equal(positionLetterDaTranscricao, positionLetter);

assert.equal(ROTULO_DIFICULDADE.FACIL, 'Fácil');
assert.equal(ROTULO_DIFICULDADE.MEDIA, 'Média');
assert.equal(ROTULO_DIFICULDADE.DIFICIL, 'Difícil');
for (const dificuldade of ['FACIL', 'MEDIA', 'DIFICIL'] as const) {
  assert.ok(CLASSE_DIFICULDADE[dificuldade].length > 10, 'classe de dificuldade vazia');
}

assert.equal(origemDaQuestao({ exam: 'ENEM', year: 2023, examNumber: 47 }), 'ENEM · 2023 · questão 47');
assert.equal(origemDaQuestao({ exam: 'ENEM', year: 2023, examNumber: null }), 'ENEM · 2023');
// Questão autoral: sem exame, ano ou número, a linha de procedência some em vez
// de mostrar um separador sozinho.
assert.equal(origemDaQuestao({ exam: '', year: null, examNumber: null }), '');
assert.equal(origemDaQuestao({ exam: 'ENEM', year: 0, examNumber: 0 }), 'ENEM');

console.log('caderno de erros: 8 motivos, revisão, linha do tempo e filtros conferidos.');
