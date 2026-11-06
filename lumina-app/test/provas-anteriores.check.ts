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
