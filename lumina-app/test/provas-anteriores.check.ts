import assert from 'node:assert/strict';
import {
  adjacentPage,
  pageByNumber,
  pagePosition,
  questionsOnPage,
} from '../src/lib/exam-paper-navigation.ts';
import type { ExamPaperPage, ExamPaperQuestion } from '../src/lib/api.ts';

const page = (pageNumber: number): ExamPaperPage => ({
  id: `page-${pageNumber}`,
  paperId: 'paper-1',
  pageNumber,
  imageUrl: `/pages/${pageNumber}.svg`,
  dimensionsJson: { width: 794, height: 1123 },
  textContent: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const question = (number: number, pageNumber: number): ExamPaperQuestion => ({
  id: `question-${number}`,
  number,
  pageNumber,
  boundsJson: null,
  area: 'Matemática',
  subject: 'Matemática',
});

const pages = [page(1), page(2), page(3), page(4)];
const questions = [
  question(1, 1),
  question(2, 1),
  question(3, 3),
  question(4, 4),
];

assert.equal(pageByNumber(pages, 2)?.id, 'page-2');
assert.equal(pageByNumber(pages, 99), null);

assert.equal(adjacentPage(pages, 1, -1), null);
assert.equal(adjacentPage(pages, 1, 1)?.pageNumber, 2);
assert.equal(adjacentPage(pages, 3, -1)?.pageNumber, 2);
assert.equal(adjacentPage(pages, 3, 1)?.pageNumber, 4);
assert.equal(adjacentPage(pages, 4, 1), null);
assert.equal(adjacentPage(pages, 99, 1), null);

assert.deepEqual(pagePosition(pages, 1), { index: 1, total: 4 });
assert.deepEqual(pagePosition(pages, 4), { index: 4, total: 4 });
assert.equal(pagePosition(pages, 99), null);
assert.deepEqual(pagePosition([], 1), null);

assert.deepEqual(questionsOnPage(questions, 1).map((item) => item.number), [1, 2]);
assert.deepEqual(questionsOnPage(questions, 2), []);
assert.deepEqual(questionsOnPage(questions, 4).map((item) => item.number), [4]);
assert.deepEqual(questionsOnPage([], 1), []);

console.log('Provas anteriores: navegação por páginas e vínculo questão → página conferidos.');

// ---- PDF embutido, título com a edição e importação em lote (13/11/2026)
import { clampPdfPage, paperTitle, parseImportLines, sameExam } from '../src/lib/exam-paper-navigation.ts';

assert.equal(paperTitle({ exam: { name: 'ENEM' }, year: 2024, metadataJson: { day: 2, bookletColor: 'Amarelo' } }), 'ENEM · 2024 · 2º dia (Amarelo)');
assert.equal(paperTitle({ exam: { name: 'FUVEST' }, year: 2023, metadataJson: null }), 'FUVEST · 2023');

assert.equal(clampPdfPage(0, 32), 1);
assert.equal(clampPdfPage(40, 32), 32);
assert.equal(clampPdfPage(7.4, 32), 7);
assert.equal(clampPdfPage(Number.NaN, 32), 1);
assert.equal(clampPdfPage(500, undefined), 500);

// ENEM 2023 e 2024 são registros diferentes de Exam, mas o mesmo vestibular.
assert.equal(sameExam({ examId: 'a', exam: { name: 'ENEM' } }, { examId: 'b', exam: { name: 'enem ' } }), true);
assert.equal(sameExam({ examId: 'a', exam: { name: 'ENEM' } }, { examId: 'b', exam: { name: 'FUVEST' } }), false);

const inep = 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_PV_impresso_D2_CD7.pdf';
const gab = 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_GB_impresso_D2_CD7.pdf';
const parsed = parseImportLines(`# lote\n2024; 2; ${inep}; ${gab}\n\n2023\t1\t${inep}\t${gab}\n2024; 3; ${inep}; ${gab}\n2024; 1; https://exemplo.com/p.pdf; ${gab}`);
assert.equal(parsed.items.length, 2);
assert.deepEqual(parsed.items[0], { year: 2024, day: 2, provaUrl: inep, gabaritoUrl: gab });
assert.deepEqual(parsed.errors, ['Linha 5: o dia deve ser 1 ou 2.', 'Linha 6: as URLs da prova e do gabarito precisam ser do INEP (https://download.inep.gov.br/).']);

console.log('provas anteriores (PDF e importação): ok');
