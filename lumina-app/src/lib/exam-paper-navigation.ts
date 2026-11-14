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

// ------------------------------------------------ PDF embutido e importação

/** "ENEM · 2024 · 2º dia (Amarelo)"; sem dia, só "ENEM · 2024". */
export function paperTitle(paper: { exam?: { name: string }; year: number; metadataJson: { day?: number; bookletColor?: string | null } | null }): string {
  const parts = [paper.exam?.name ?? 'Prova', String(paper.year)];
  const day = paper.metadataJson?.day;
  if (day) parts.push(`${day}º dia${paper.metadataJson?.bookletColor ? ` (${paper.metadataJson.bookletColor})` : ''}`);
  return parts.join(' · ');
}

/** Página do PDF dentro dos limites (1..total). */
export function clampPdfPage(page: number, totalPages: number | undefined): number {
  const max = totalPages && totalPages > 0 ? totalPages : Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(page)) return 1;
  return Math.min(max, Math.max(1, Math.round(page)));
}

/** Mesmo vestibular = mesmo nome de prova (o ENEM tem um registro por ano). */
export function sameExam(a: { examId: string; exam?: { name: string } }, b: { examId: string; exam?: { name: string } }): boolean {
  if (a.examId === b.examId) return true;
  return !!a.exam && !!b.exam && a.exam.name.trim().toLowerCase() === b.exam.name.trim().toLowerCase();
}

export interface ImportLine { year: number; day: 1 | 2; provaUrl: string; gabaritoUrl: string }

/**
 * Lê o lote de importação: uma linha por caderno, "ano; dia; URL da prova;
 * URL do gabarito" (aceita ; , tab ou espaços). Linhas vazias e comentários
 * (#) são ignorados; as inválidas voltam com o número da linha.
 */
export function parseImportLines(text: string): { items: ImportLine[]; errors: string[] } {
  const items: ImportLine[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [yearRaw, dayRaw, provaUrl, gabaritoUrl] = line.split(/[;,\t]|\s+/).map((part) => part.trim()).filter(Boolean);
    const year = Number(yearRaw);
    const day = Number(dayRaw);
    const inep = (url?: string) => !!url && url.startsWith('https://download.inep.gov.br/');
    if (!Number.isInteger(year) || year < 1998 || year > 2100) errors.push(`Linha ${index + 1}: ano inválido.`);
    else if (day !== 1 && day !== 2) errors.push(`Linha ${index + 1}: o dia deve ser 1 ou 2.`);
    else if (!inep(provaUrl) || !inep(gabaritoUrl)) errors.push(`Linha ${index + 1}: as URLs da prova e do gabarito precisam ser do INEP (https://download.inep.gov.br/).`);
    else items.push({ year, day: day as 1 | 2, provaUrl: provaUrl!, gabaritoUrl: gabaritoUrl! });
  });
  return { items, errors };
}
