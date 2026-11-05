/**
 * Ponto único de importação da base de conhecimento.
 *
 * `KNOWLEDGE_BASE` contém a edição vigente, os manuais oficiais de referência
 * e os critérios internos da Lumina. A edição de 2025 fica em
 * `ARCHIVED_KNOWLEDGE_BASE`, com ids prefixados por `2025:`; a recuperação
 * padrão nunca a mistura com a base atual.
 */
export type {
  CompetencyId,
  KnowledgeChunk,
  KnowledgeChunkSeed,
  KnowledgeDocument,
  KnowledgeDocumentStatus,
  KnowledgeScope,
  KnowledgeSource,
} from './types';
export { COMPETENCY_IDS, SCORE_LEVELS } from './types';
export { CARTILHA_2025, CARTILHA_2026, CARTILHA_REFERENCE, DEFAULT_SEARCH_DOCUMENT_IDS, KNOWLEDGE_DOCUMENTS, LUMINA_OPERATIONAL, MANUAL_C2_2019, MANUAL_C4_2019 } from './documents';
export { COMPETENCY_GRID, CURRENT_KNOWLEDGE_BASE } from './inep-cartilha-2026';
export { ARCHIVED_KNOWLEDGE_BASE } from './inep-cartilha-2025';

import { ARCHIVED_KNOWLEDGE_BASE } from './inep-cartilha-2025';
import { CURRENT_KNOWLEDGE_BASE } from './inep-cartilha-2026';

/** Base completa para auditoria: vigente + referência + interna + arquivada. */
export const KNOWLEDGE_BASE = [...CURRENT_KNOWLEDGE_BASE, ...ARCHIVED_KNOWLEDGE_BASE];
