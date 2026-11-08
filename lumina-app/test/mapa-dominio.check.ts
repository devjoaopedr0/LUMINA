import assert from 'node:assert/strict';
import type { TopicMasteryEntry, TopicMasteryStatus } from '../src/lib/api.ts';
import {
  MASTERY_BANDS,
  MASTERY_BAND_LABEL,
  MASTERY_HEAT_CLASS,
  MASTERY_STATUS_LABEL,
  dominantMasteryBand,
  filterMastery,
  formatMasteryDate,
  groupMasteryBySubject,
  hasMasteryFilters,
  heatClass,
  heatLevel,
  masteryAccuracy,
  masteryBand,
  masteryReviewLabel,
  summarizeMastery,
} from '../src/lib/topic-mastery.ts';

/**
 * O mapa de domínio transforma dados de tentativas em uma leitura visual.
 * Um erro de faixa, de cor ou de revisão faria o aluno estudar o assunto
 * errado — por isso essas regras ficam fora do componente e são verificadas
 * aqui, sem navegador.
 */

const entrada = (overrides: Partial<TopicMasteryEntry> = {}): TopicMasteryEntry => ({
  id: 'mastery-1',
  subjectId: 'subject-matematica',
  subject: 'Matemática',
  topicId: 'topic-funcoes',
  topic: 'Funções exponenciais',
  masteryScore: 50,
  attempts: 4,
  correctAttempts: 2,
  correctStreak: 1,
  status: 'PRATICANDO',
  lastStudiedAt: '2026-11-05T12:00:00.000Z',
  nextReviewAt: '2026-11-08T00:00:00.000Z',
  due: false,
  ...overrides,
});

// --- Estados → faixas ---------------------------------------------------------
assert.equal(masteryBand('DOMINADO'), 'DOMINADO');
assert.equal(masteryBand('PRATICANDO'), 'EM_PROGRESSO');
assert.equal(masteryBand('APRENDENDO'), 'ATENCAO');
assert.equal(masteryBand('PRECISA_REFORCO'), 'CRITICO');
assert.equal(masteryBand('NAO_ESTUDADO'), 'NAO_ESTUDADO');

// Todo estado do vocabulário tem rótulo e toda faixa tem nome: nada aparece
// como texto cru na tela.
for (const status of Object.keys(MASTERY_STATUS_LABEL) as TopicMasteryStatus[]) {
  assert.ok(MASTERY_STATUS_LABEL[status].length > 3, `status ${status} sem rótulo`);
}
for (const band of MASTERY_BANDS) {
  assert.ok(MASTERY_BAND_LABEL[band].length > 3, `faixa ${band} sem rótulo`);
}

// --- Mapa de calor ------------------------------------------------------------
assert.equal(heatLevel(0), 0);
assert.equal(heatLevel(-10), 0);
assert.equal(heatLevel(Number.NaN), 0);
assert.equal(heatLevel(1), 1);
assert.equal(heatLevel(24), 1);
assert.equal(heatLevel(25), 2);
assert.equal(heatLevel(49), 2);
assert.equal(heatLevel(50), 3);
assert.equal(heatLevel(74), 3);
assert.equal(heatLevel(75), 4);
assert.equal(heatLevel(100), 4);
// Fora da faixa 0–100 não inventa uma cor mais forte.
assert.equal(heatLevel(150), 4);

for (const level of [0, 1, 2, 3, 4] as const) {
  const score = [0, 10, 30, 60, 90][level];
  assert.equal(heatClass(score), MASTERY_HEAT_CLASS[level]);
  assert.ok(MASTERY_HEAT_CLASS[level].includes('bg-'), `nível ${level} sem cor`);
}
assert.equal(new Set(Object.values(MASTERY_HEAT_CLASS)).size, 5);

// --- Acerto, datas e revisão --------------------------------------------------
assert.equal(masteryAccuracy(entrada({ attempts: 0, correctAttempts: 0 })), null);
assert.equal(masteryAccuracy(entrada({ attempts: 3, correctAttempts: 0 })), 0);
assert.equal(masteryAccuracy(entrada({ attempts: 3, correctAttempts: 2 })), 67);
assert.equal(masteryAccuracy(entrada({ attempts: 2, correctAttempts: 2 })), 100);

assert.equal(formatMasteryDate(null), '');
assert.equal(formatMasteryDate('data-invalida'), '');
assert.equal(formatMasteryDate('2026-11-08T00:00:00.000Z'), '08/11/2026');

assert.equal(masteryReviewLabel(entrada({ nextReviewAt: null })), 'Sem revisão agendada');
assert.equal(
  masteryReviewLabel(entrada({ nextReviewAt: '2026-11-07T00:00:00.000Z', due: true })),
  'Revisão pendente',
);
assert.equal(
  masteryReviewLabel(entrada({ nextReviewAt: '2026-11-08T00:00:00.000Z', due: false })),
  'Revisar em 08/11/2026',
);

// --- Resumo -------------------------------------------------------------------
const vazio = summarizeMastery([]);
assert.deepEqual(vazio, {
  total: 0,
  byBand: { DOMINADO: 0, EM_PROGRESSO: 0, ATENCAO: 0, CRITICO: 0, NAO_ESTUDADO: 0 },
  due: 0,
  attempts: 0,
  correctAttempts: 0,
  accuracy: null,
  averageScore: null,
});

const resumo = summarizeMastery([
  entrada({ id: 'a', status: 'DOMINADO', masteryScore: 90, attempts: 5, correctAttempts: 4, due: true }),
  entrada({ id: 'b', status: 'PRATICANDO', masteryScore: 60, attempts: 3, correctAttempts: 2 }),
  entrada({ id: 'c', status: 'APRENDENDO', masteryScore: 30, attempts: 2, correctAttempts: 1 }),
  entrada({ id: 'd', status: 'PRECISA_REFORCO', masteryScore: 20, attempts: 1, correctAttempts: 0 }),
  entrada({ id: 'e', status: 'NAO_ESTUDADO', masteryScore: 0, attempts: 0, correctAttempts: 0 }),
]);
assert.equal(resumo.total, 5);
assert.deepEqual(resumo.byBand, {
  DOMINADO: 1,
  EM_PROGRESSO: 1,
  ATENCAO: 1,
  CRITICO: 1,
  NAO_ESTUDADO: 1,
});
assert.equal(resumo.due, 1);
assert.equal(resumo.attempts, 11);
assert.equal(resumo.correctAttempts, 7);
assert.equal(resumo.accuracy, 64);
// (90 + 60 + 30 + 20 + 0) / 5 = 40
assert.equal(resumo.averageScore, 40);

// A faixa dominante define o selo da matéria; empate mantém a primeira da
// ordem e nunca inventa "dominado" para uma matéria sem dados.
assert.equal(dominantMasteryBand(resumo.byBand), 'DOMINADO');
assert.equal(
  dominantMasteryBand({ DOMINADO: 1, EM_PROGRESSO: 3, ATENCAO: 0, CRITICO: 0, NAO_ESTUDADO: 0 }),
  'EM_PROGRESSO',
);
assert.equal(
  dominantMasteryBand({ DOMINADO: 0, EM_PROGRESSO: 0, ATENCAO: 0, CRITICO: 0, NAO_ESTUDADO: 4 }),
  'NAO_ESTUDADO',
);

// --- Filtros ------------------------------------------------------------------
const linhas = [
  entrada({ id: 'mat', subjectId: 'mat', subject: 'Matemática', topic: 'Funções exponenciais', status: 'PRATICANDO', due: false }),
  entrada({ id: 'mat2', subjectId: 'mat', subject: 'Matemática', topic: 'Logaritmos', status: 'PRECISA_REFORCO', due: true }),
  entrada({ id: 'fis', subjectId: 'fis', subject: 'Física', topic: 'Cinemática', status: 'APRENDENDO', due: true }),
  entrada({ id: 'bio', subjectId: 'bio', subject: 'Biologia', topic: 'Genética', status: 'DOMINADO', due: false }),
];

assert.equal(filterMastery(linhas, {}).length, 4);
assert.deepEqual(filterMastery(linhas, { subjectId: 'mat' }).map((row) => row.id), ['mat', 'mat2']);
assert.deepEqual(filterMastery(linhas, { band: 'CRITICO' }).map((row) => row.id), ['mat2']);
assert.deepEqual(filterMastery(linhas, { dueOnly: true }).map((row) => row.id), ['mat2', 'fis']);
// A busca ignora caixa, acento e olha matéria e assunto.
assert.deepEqual(filterMastery(linhas, { search: 'funcoes' }).map((row) => row.id), ['mat']);
assert.deepEqual(filterMastery(linhas, { search: 'Funções' }).map((row) => row.id), ['mat']);
assert.deepEqual(filterMastery(linhas, { search: 'fisica' }).map((row) => row.id), ['fis']);
assert.deepEqual(
  filterMastery(linhas, { subjectId: 'mat', band: 'CRITICO', dueOnly: true }).map((row) => row.id),
  ['mat2'],
);

assert.equal(hasMasteryFilters({}), false);
assert.equal(hasMasteryFilters({ search: '   ' }), false);
assert.equal(hasMasteryFilters({ band: 'CRITICO' }), true);
assert.equal(hasMasteryFilters({ dueOnly: true }), true);
assert.equal(hasMasteryFilters({ search: 'x' }), true);

// --- Agrupamento --------------------------------------------------------------
const grupos = groupMasteryBySubject(linhas);
assert.deepEqual(grupos.map((group) => group.subject), ['Matemática', 'Física', 'Biologia']);
assert.equal(grupos[0].topics.length, 2);
assert.equal(grupos[0].summary.total, 2);
assert.equal(grupos[0].summary.byBand.EM_PROGRESSO, 1);
assert.equal(grupos[0].summary.byBand.CRITICO, 1);
assert.equal(grupos[1].summary.total, 1);
assert.equal(grupos[2].summary.byBand.DOMINADO, 1);

console.log('mapa de domínio: faixas, calor, revisão, filtros e agrupamento conferidos.');
