/**
 * Cartão-resposta da Lumina (layout versão 2) — gerado a partir das questões
 * do simulado e usado igual na impressão (app) e na leitura (OMR).
 *
 * Tudo é definido em milímetros numa folha A4 retrato (210 × 297) e guardado
 * também normalizado (0–1) para quem desenha em outra escala:
 * - 4 marcadores pretos quadrados nos cantos: alinhamento (homografia);
 * - faixa de 24 quadrados: código da folha (20 bits de dados + 4 de
 *   verificação), que identifica simulado e aluno — o professor escaneia a
 *   folha de qualquer aluno sem dizer de quem é. Marcadores e código ficam
 *   sempre no mesmo lugar: a leitura acha o código antes de saber o layout;
 * - cabeçalho no estilo do cartão do Enem (instituição, nome em quadrados,
 *   instruções, frase, cor do caderno, língua), escolhido pelo gestor;
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
  /** Posição no simulado (1…n): é o que a leitura devolve. */
  number: number;
  /** Número impresso (ex.: 91 no 2º dia do Enem). Ausente nos cartões antigos. */
  displayNumber?: number;
  /** Onde imprimir o número da questão. */
  label: MmPoint;
  bubbles: SheetBubble[];
}

/**
 * O que o gestor escolhe para o cartão. O layout se adapta: cada seção ligada
 * ocupa espaço no cabeçalho, e se a grade de bolhas não couber com folga as
 * seções menos importantes saem sozinhas (com aviso em `notes`).
 */
export interface SheetOptions {
  showInstitution: boolean;
  /** Impresso no cartão; vazio = quadrados para preencher à mão. */
  institutionName: string | null;
  /** Instruções ao aluno (vazio = sem o quadro de instruções). */
  instructions: string[];
  /** Frase para transcrever com a própria letra (nulo = sem o quadro). */
  phrase: string | null;
  /** Cores do caderno de questões (vazio = sem o quadro). */
  bookletColors: string[];
  /** Quadro da língua estrangeira (inglês/espanhol). */
  foreignLanguage: boolean;
  /** Número da primeira questão impressa. */
  firstQuestionNumber: number;
}

export const DEFAULT_INSTRUCTIONS = [
  'Confira se o cartão-resposta é do seu simulado e se está completo. Se houver problema, avise o aplicador.',
  'Escreva seu nome nos espaços indicados, uma letra por quadrado, com caneta preta ou azul escura.',
  'Marque uma única alternativa por questão, preenchendo a bolha inteira. Dupla marcação anula a questão.',
  'Não rasure, não dobre e não amasse o cartão. Não escreva perto dos quadrados pretos dos cantos.',
  'Ao terminar, entregue o cartão-resposta ao aplicador.',
];

export const DEFAULT_PHRASE = 'O conhecimento que conquisto hoje abre as portas do meu amanhã.';

/** Padrões do cartão; o 2º dia do Enem começa na questão 91 e o 1º tem a língua estrangeira. */
export function defaultSheetOptions(context: { enemDay?: number | null; institutionName?: string | null } = {}): SheetOptions {
  const enem = context.enemDay === 1 || context.enemDay === 2;
  return {
    showInstitution: true,
    institutionName: context.institutionName?.trim() || null,
    instructions: [...DEFAULT_INSTRUCTIONS],
    phrase: enem ? DEFAULT_PHRASE : null,
    bookletColors: [],
    foreignLanguage: context.enemDay === 1,
    firstQuestionNumber: context.enemDay === 2 ? 91 : 1,
  };
}

export interface SheetChoice {
  label: string;
  x: number;
  y: number;
  r: number;
}

export type SheetSection =
  | { kind: 'boxes'; key: 'institution' | 'student'; label: string; x: number; y: number; cell: number; columns: number; rows: number }
  | { kind: 'text'; key: 'institution'; label: string; text: string; x: number; y: number; width: number; height: number }
  | { kind: 'instructions'; title: string; lines: string[]; x: number; y: number; width: number; height: number; lineHeight: number }
  | { kind: 'phrase'; title: string; text: string; x: number; y: number; width: number; height: number }
  | { kind: 'choices'; key: 'booklet' | 'language'; title: string; choices: SheetChoice[]; x: number; y: number; width: number; height: number };

export interface SheetGridColumn {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Linhas separadoras entre as questões (só quando há folga para elas). */
  rowLines: number[];
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
  /** Opções usadas para gerar este layout (ausente nos cartões antigos). */
  options?: SheetOptions;
  /** Seções impressas do cabeçalho, de cima para baixo. */
  sections?: SheetSection[];
  /** Molduras das colunas da grade ("Questão / Resposta"). */
  gridColumns?: SheetGridColumn[];
  /** Ajustes que o layout fez sozinho para caber na folha. */
  notes?: string[];
}

const GRID_BOTTOM = 277;
const GRID_LEFT = 18;
const GRID_RIGHT = 192;
const CONTENT_X = 22;
const CONTENT_W = 166;
const HEADER_TOP = 34;
const SECTION_GAP = 2.5;
const COLUMN_HEADER = 5.5;
const BUBBLE_SPACING = 6.6;
const BUBBLE_R = 1.9;
const LABEL_WIDTH = 9;
const MAX_ROW = 7;
/** Abaixo disso as bolhas ficam apertadas para marcar e ler com folga. */
const COMFORT_ROW = 5.2;
/** Mínimo absoluto (com o cabeçalho mínimo, 180 questões cabem). */
const MIN_ROW = 4.4;
const BOX_CELL = 5.2;
const INSTRUCTION_LINE = 3.3;
const INSTRUCTION_CHARS = 118;

/** Quebra o texto em linhas de até `max` caracteres (a impressão só desenha). */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

type SectionKey = 'institution' | 'instructions' | 'phrase' | 'choices';

/** Seções que podem sair para a grade caber, da menos para a mais importante. */
const DROP_ORDER: { key: SectionKey; note: string }[] = [
  { key: 'instructions', note: 'O quadro de instruções saiu para as bolhas caberem com folga.' },
  { key: 'phrase', note: 'A frase para transcrever saiu para as bolhas caberem com folga.' },
  { key: 'choices', note: 'Os quadros de cor do caderno e de língua estrangeira saíram para as bolhas caberem.' },
  { key: 'institution', note: 'O campo da instituição saiu para as bolhas caberem.' },
];

function headerSections(options: SheetOptions, enabled: Set<SectionKey>): { sections: SheetSection[]; bottom: number } {
  const sections: SheetSection[] = [];
  let y = HEADER_TOP;
  const columns = Math.floor(CONTENT_W / BOX_CELL);
  if (enabled.has('institution')) {
    if (options.institutionName) {
      sections.push({ kind: 'text', key: 'institution', label: 'Instituição de ensino:', text: options.institutionName.slice(0, 90), x: CONTENT_X, y, width: CONTENT_W, height: 7 });
      y += 7;
    } else {
      sections.push({ kind: 'boxes', key: 'institution', label: 'Instituição de ensino:', x: CONTENT_X, y, cell: BOX_CELL, columns, rows: 1 });
      y += 4.5 + BOX_CELL;
    }
    y += 1.5;
  }
  sections.push({ kind: 'boxes', key: 'student', label: 'Aluno:', x: CONTENT_X, y, cell: BOX_CELL, columns, rows: 2 });
  y += 4.5 + BOX_CELL * 2 + SECTION_GAP;
  if (enabled.has('instructions')) {
    const lines = options.instructions.flatMap((item) => wrapText(item, INSTRUCTION_CHARS - 2).map((l, i) => (i === 0 ? `• ${l}` : `   ${l}`)));
    const height = 6 + lines.length * INSTRUCTION_LINE + 1.5;
    sections.push({ kind: 'instructions', title: 'INSTRUÇÕES', lines, x: CONTENT_X, y, width: CONTENT_W, height, lineHeight: INSTRUCTION_LINE });
    y += height + SECTION_GAP;
  }
  if (enabled.has('phrase')) {
    sections.push({ kind: 'phrase', title: 'TRANSCREVA A FRASE NO ESPAÇO A SEGUIR COM SUA CALIGRAFIA USUAL', text: options.phrase!.trim().slice(0, 120), x: CONTENT_X, y, width: CONTENT_W, height: 15 });
    y += 15 + SECTION_GAP;
  }
  if (enabled.has('choices')) {
    const groups: { key: 'booklet' | 'language'; title: string; labels: string[] }[] = [];
    if (options.bookletColors.length) groups.push({ key: 'booklet', title: 'MARQUE A COR DA CAPA DO SEU CADERNO', labels: options.bookletColors.slice(0, 5) });
    if (options.foreignLanguage) groups.push({ key: 'language', title: 'MARQUE A LÍNGUA ESTRANGEIRA', labels: ['INGLÊS', 'ESPANHOL'] });
    const gap = 4;
    const totalWeight = groups.reduce((s, g) => s + Math.max(2, g.labels.length), 0);
    let x = CONTENT_X;
    for (const g of groups) {
      const width = (CONTENT_W - gap * (groups.length - 1)) * (Math.max(2, g.labels.length) / totalWeight);
      const slot = width / g.labels.length;
      const choices = g.labels.map((label, i) => ({ label: label.trim().slice(0, 14).toUpperCase(), x: x + slot * i + 6, y: y + 9.3, r: 1.9 }));
      sections.push({ kind: 'choices', key: g.key, title: g.title, choices, x, y, width, height: 13 });
      x += width + gap;
    }
    y += 13 + SECTION_GAP;
  }
  return { sections, bottom: y };
}

/** Gera o layout para as questões, cada uma com 2 a 5 alternativas. */
export function buildSheetLayout(alternativesPerQuestion: number[], partial: Partial<SheetOptions> = {}): SheetLayout {
  const n = alternativesPerQuestion.length;
  if (n < 1 || n > MAX_QUESTIONS) throw new Error(`O cartão comporta de 1 a ${MAX_QUESTIONS} questões.`);
  if (alternativesPerQuestion.some((a) => !Number.isInteger(a) || a < 2 || a > 5)) throw new Error('Cada questão precisa de 2 a 5 alternativas.');
  const options: SheetOptions = { ...defaultSheetOptions(), ...partial };
  if (!Number.isInteger(options.firstQuestionNumber) || options.firstQuestionNumber < 1 || options.firstQuestionNumber + n - 1 > 999) {
    throw new Error('Número da primeira questão inválido.');
  }

  const columns = Math.min(4, Math.max(1, Math.ceil(n / 15)));
  const rows = Math.ceil(n / columns);
  const enabled = new Set<SectionKey>();
  if (options.showInstitution) enabled.add('institution');
  if (options.instructions.length) enabled.add('instructions');
  if (options.phrase?.trim()) enabled.add('phrase');
  if (options.bookletColors.length || options.foreignLanguage) enabled.add('choices');

  // Adaptativo: tira seções do cabeçalho até a grade ter linhas confortáveis.
  const notes: string[] = [];
  let header = headerSections(options, enabled);
  const rowFor = (bottom: number) => (GRID_BOTTOM - (bottom + COLUMN_HEADER)) / rows;
  for (const drop of DROP_ORDER) {
    if (rowFor(header.bottom) >= COMFORT_ROW) break;
    if (!enabled.has(drop.key)) continue;
    enabled.delete(drop.key);
    notes.push(drop.note);
    header = headerSections(options, enabled);
  }
  const gridTop = header.bottom + COLUMN_HEADER;
  const rowHeight = Math.min(MAX_ROW, rowFor(header.bottom));
  if (rowHeight < MIN_ROW) throw new Error('As questões não cabem numa folha.');
  const columnWidth = (GRID_RIGHT - GRID_LEFT) / columns;
  // Separadores só com folga: perto demais da bolha, atrapalham a medida do papel.
  const withLines = rowHeight >= 6;

  const questions: SheetQuestion[] = alternativesPerQuestion.map((count, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x0 = GRID_LEFT + column * columnWidth;
    const y = gridTop + row * rowHeight + rowHeight / 2;
    return {
      number: index + 1,
      displayNumber: options.firstQuestionNumber + index,
      label: { x: x0 + 1.5, y },
      bubbles: Array.from({ length: count }, (_, i) => ({ position: i + 1, x: x0 + LABEL_WIDTH + 1.5 + BUBBLE_R + i * BUBBLE_SPACING, y, r: BUBBLE_R })),
    };
  });
  const usedColumns = Math.ceil(n / rows);
  const gridColumns: SheetGridColumn[] = Array.from({ length: usedColumns }, (_, c) => {
    const inColumn = Math.min(rows, n - c * rows);
    return {
      x: GRID_LEFT + c * columnWidth + 0.8,
      y: gridTop - COLUMN_HEADER,
      width: columnWidth - 1.6,
      height: COLUMN_HEADER + inColumn * rowHeight,
      rowLines: withLines ? Array.from({ length: inColumn - 1 }, (_, r) => gridTop + (r + 1) * rowHeight) : [],
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
    header: { x: CONTENT_X, y: HEADER_TOP, width: CONTENT_W, height: header.bottom - HEADER_TOP },
    options,
    sections: header.sections,
    gridColumns,
    notes,
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
