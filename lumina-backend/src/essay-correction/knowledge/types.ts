/**
 * Tipos compartilhados da base de conhecimento da correção.
 *
 * A base é versionada: cada trecho aponta para o documento oficial de onde
 * veio, com edição, data de publicação e URL. Assim a correção pode registrar
 * exatamente qual versão usou e versões antigas continuam auditáveis.
 */

export type CompetencyId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
export type KnowledgeScope = CompetencyId | 'GERAL';

export type KnowledgeSource =
  | 'inep-cartilha-2025'
  | 'inep-cartilha-2026'
  | 'inep-manual-c2-2019'
  | 'inep-manual-c4-2019'
  | 'lumina';

export type KnowledgeDocumentStatus = 'current' | 'archived' | 'reference' | 'internal';

export interface KnowledgeDocument {
  id: string;
  title: string;
  publisher: string;
  /** Edição/versão do documento (ex.: "2026"). */
  version: string;
  /** Data de publicação oficial (ISO 8601). */
  publishedAt: string;
  /** Data em que a Lumina importou/revisou o documento (ISO 8601). */
  updatedAt: string;
  sourceUrl: string;
  competencies: KnowledgeScope[];
  status: KnowledgeDocumentStatus;
  notes?: string;
}

/** Trecho antes de receber os metadados do documento. */
export interface KnowledgeChunkSeed {
  id: string;
  scope: KnowledgeScope;
  title: string;
  text: string;
  /** Página impressa no documento; null para critério operacional da Lumina. */
  page: number | null;
  source: KnowledgeSource;
  kind: 'criterio' | 'grade' | 'orientacao' | 'exemplo';
}

/** Trecho já vinculado ao documento e à versão que o fundamentam. */
export interface KnowledgeChunk extends KnowledgeChunkSeed {
  documentId: string;
  documentVersion: string;
  publishedAt: string;
  sourceUrl: string;
  competencies: KnowledgeScope[];
}

export function attachDocument(seed: KnowledgeChunkSeed, document: KnowledgeDocument): KnowledgeChunk {
  return {
    ...seed,
    documentId: document.id,
    documentVersion: document.version,
    publishedAt: document.publishedAt,
    sourceUrl: document.sourceUrl,
    competencies: document.competencies,
  };
}

export const COMPETENCY_IDS: CompetencyId[] = ['C1', 'C2', 'C3', 'C4', 'C5'];
export const SCORE_LEVELS = [0, 40, 80, 120, 160, 200] as const;
