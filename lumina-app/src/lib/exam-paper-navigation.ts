import type { ExamPaperPage, ExamPaperQuestion } from './api';

/**
 * Navegação da prova por páginas.
 *
 * As funções são puras para que a ordem das páginas e o vínculo
 * questão → página não dependam do estado do componente. O backend já
 * devolve as páginas em ordem crescente; aqui só andamos nessa lista.
 */

export function pageByNumber(
  pages: ExamPaperPage[],
  pageNumber: number,
): ExamPaperPage | null {
  return pages.find((page) => page.pageNumber === pageNumber) ?? null;
}

export function adjacentPage(
  pages: ExamPaperPage[],
  currentPageNumber: number,
  direction: -1 | 1,
): ExamPaperPage | null {
  const index = pages.findIndex((page) => page.pageNumber === currentPageNumber);
  if (index < 0) return null;
  return pages[index + direction] ?? null;
}

/** Posição legível ("2 de 4"), em base 1, ou null se a página não existe. */
export function pagePosition(
  pages: ExamPaperPage[],
  pageNumber: number,
): { index: number; total: number } | null {
  const index = pages.findIndex((page) => page.pageNumber === pageNumber);
  if (index < 0) return null;
  return { index: index + 1, total: pages.length };
}

/** Questões mapeadas na página, preservando a ordem por número da questão. */
export function questionsOnPage(
  questions: ExamPaperQuestion[],
  pageNumber: number,
): ExamPaperQuestion[] {
  return questions.filter((question) => question.pageNumber === pageNumber);
}
