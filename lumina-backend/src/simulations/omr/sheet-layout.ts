/**
 * Cartão-resposta da Lumina (layout versão 2) — gerado a partir das questões
 * do simulado e usado igual na impressão (app) e na leitura (OMR).
 *
 * Tudo é definido em milímetros numa folha A4 retrato (210 × 297) e guardado
 * também normalizado (0–1) para quem desenha em outra escala:
 * - 4 marcadores pretos quadrados nos cantos: alinhamento (homografia);
 * - faixa de 24 quadrados: código da folha (20 bits de dados + 4 de
 *   verificação), que identifica simulado e aluno — o professor escaneia a
 *   folha de qualquer aluno sem dizer de quem é;
 * - grade de bolhas: até 4 colunas, uma linha por questão, A–E.
 */

export const PAGE_MM = { width: 210, height: 297 } as const;
export const FIDUCIAL_MM = 10;
export const CODE_BITS = 24;
export const CODE_DATA_BITS = 20;
export const MAX_SHEET_CODE = 2 ** CODE_DATA_BITS - 1;
export const MAX_QUESTIONS = 180;

export interface MmPoint {
  x: number;
  y: number;
}

export interface SheetBubble {
  /** Alternativa (1 = A … 5 = E). */
  position: number;
  x: number;
  y: number;
  r: number;
}

export interface SheetQuestion {
  number: number;
  /** Onde imprimir o número da questão. */
  label: MmPoint;
  bubbles: SheetBubble[];
}

export interface SheetLayout {
  version: 2;
  page: { width: number; height: number };
  /** Centros dos marcadores, na ordem: sup. esq., sup. dir., inf. dir., inf. esq. */
  fiducials: [MmPoint, MmPoint, MmPoint, MmPoint];
  fiducialSize: number;
  /** Quadrados do código, do bit mais significativo ao menos. */
  codeCells: { x: number; y: number; size: number }[];
  questions: SheetQuestion[];
  /** Área do cabeçalho (título, nome) — impressa, não lida. */
  header: { x: number; y: number; width: number; height: number };
}

const GRID_TOP = 72;
const GRID_BOTTOM = 276;
const GRID_LEFT = 16;
const GRID_RIGHT = 194;
const BUBBLE_SPACING = 6.6;
const BUBBLE_R = 1.9;
const LABEL_WIDTH = 9;

/** Gera o layout para as questões, cada uma com 2 a 5 alternativas. */
export function buildSheetLayout(alternativesPerQuestion: number[]): SheetLayout {
  const n = alternativesPerQuestion.length;
  if (n < 1 || n > MAX_QUESTIONS) throw new Error(`O cartão comporta de 1 a ${MAX_QUESTIONS} questões.`);
  if (alternativesPerQuestion.some((a) => !Number.isInteger(a) || a < 2 || a > 5)) throw new Error('Cada questão precisa de 2 a 5 alternativas.');
  const columns = Math.min(4, Math.max(1, Math.ceil(n / 30)));
  const rows = Math.ceil(n / columns);
  const rowHeight = Math.min(8, (GRID_BOTTOM - GRID_TOP) / rows);
  const columnWidth = (GRID_RIGHT - GRID_LEFT) / columns;

  const questions: SheetQuestion[] = alternativesPerQuestion.map((count, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x0 = GRID_LEFT + column * columnWidth;
    const y = GRID_TOP + row * rowHeight + rowHeight / 2;
    return {
      number: index + 1,
      label: { x: x0 + 1, y },
      bubbles: Array.from({ length: count }, (_, i) => ({ position: i + 1, x: x0 + LABEL_WIDTH + BUBBLE_R + i * BUBBLE_SPACING, y, r: BUBBLE_R })),
    };
  });

  const half = FIDUCIAL_MM / 2;
  const margin = 7 + half;
  const codeCells = Array.from({ length: CODE_BITS }, (_, i) => ({ x: 33 + i * 6, y: 26, size: 4.4 }));
  return {
    version: 2,
    page: { ...PAGE_MM },
    fiducials: [
      { x: margin, y: margin },
      { x: PAGE_MM.width - margin, y: margin },
      { x: PAGE_MM.width - margin, y: PAGE_MM.height - margin },
      { x: margin, y: PAGE_MM.height - margin },
    ],
    fiducialSize: FIDUCIAL_MM,
    codeCells,
    questions,
    header: { x: 24, y: 34, width: 162, height: 30 },
  };
}

/** 4 bits de verificação: soma dos nibbles dos dados, módulo 16, com o tamanho embaralhado. */
function checksum(data: number): number {
  let sum = 0;
  for (let i = 0; i < CODE_DATA_BITS; i += 4) sum += (data >> i) & 0xf;
  return (sum * 7 + 3) & 0xf;
}

export function encodeSheetCode(code: number): boolean[] {
  if (!Number.isInteger(code) || code < 0 || code > MAX_SHEET_CODE) throw new Error('Código de folha fora da faixa.');
  const value = (code << 4) | checksum(code);
  return Array.from({ length: CODE_BITS }, (_, i) => ((value >> (CODE_BITS - 1 - i)) & 1) === 1);
}

/** Devolve o código, ou null se a verificação falhar (folha de cabeça para baixo, borrão…). */
export function decodeSheetCode(bits: boolean[]): number | null {
  if (bits.length !== CODE_BITS) return null;
  const value = bits.reduce((acc, bit) => (acc << 1) | (bit ? 1 : 0), 0);
  const data = value >>> 4;
  return (value & 0xf) === checksum(data) ? data : null;
}

export function isSheetLayout(value: unknown): value is SheetLayout {
  return typeof value === 'object' && value !== null && (value as { version?: unknown }).version === 2 && Array.isArray((value as SheetLayout).questions);
}
