import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';

/** Formato neutro de uma questão vinda de uma fonte externa (dataset, API,
 * arquivo, parceiro). É a "língua franca" entre os importadores e o Lumina:
 * cada importador (JSON, CSV, futuramente APIs) converte o formato específico
 * da fonte para este formato antes de normalizar/validar. */
export interface ExternalQuestion {
  sourceType: QuestionSourceType;
  sourceName: string;
  /** Identificador oficial da questão na fonte (ex: número de cadastro no
   * dataset). Quando presente, é a chave primária da deduplicação. */
  sourceId?: string;
  exam?: string;
  year?: number;
  examNumber?: number;
  subject: string;
  topic?: string;
  difficulty: QuestionDifficulty;
  stem: string;
  options: ExternalQuestionOption[];
  /** Alternativa ao `correct` por opção: letra da correta (A, B, C, D, E, F). */
  correctLetter?: string;
  /** Alternativa ao `correct` por opção: índice 0-based da correta. */
  correctOptionIndex?: number;
  explanation?: string;
  imageUrl?: string;
  sourcePdf?: { url: string; page: number };
}

export interface ExternalQuestionOption {
  text: string;
  /** Opcional quando `correctLetter`/`correctOptionIndex` estiverem preenchidos. */
  correct?: boolean;
}

/** Formato interno já normalizado (pronto para validação/deduplicação/
 * persistência). `alternatives` sempre tem exatamente uma `isCorrect`. */
export interface NormalizedQuestion {
  sourceType: QuestionSourceType;
  sourceName: string;
  sourceId: string | null;
  exam: string;
  year: number | null;
  examNumber: number | null;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  stem: string;
  alternatives: { text: string; isCorrect: boolean }[];
  explanation: string | null;
  imageUrl: string | null;
  sourcePdf?: { url: string; page: number };
}

/** Relatório de uma execução de importação — a API nunca insere questões
 * inválidas silenciosamente; tudo entra no relatório. */
export interface ImportReport {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  errors: number;
  /** Detalhe por questão quando houve problema (invalidação ou erro). */
  details: ImportIssue[];
}

export interface ImportIssue {
  index: number;
  sourceId: string | null;
  type: 'invalid' | 'duplicate' | 'error';
  message: string;
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
