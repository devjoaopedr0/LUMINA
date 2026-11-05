import type { KnowledgeDocument } from './types';

/**
 * Catálogo dos documentos oficiais usados na correção.
 *
 * Regra de precedência:
 * - `current`: versão mais recente da cartilha; é a base padrão do RAG.
 * - `reference`: material oficial de aprofundamento (manuais de correção do
 *   Inep) usado apenas nos critérios detalhados da competência a que pertence.
 * - `archived`: versão anterior, preservada para auditoria; não entra na
 *   recuperação padrão.
 * - `internal`: critério operacional da Lumina, nunca apresentado como Inep.
 */

const IMPORTED_AT = '2026-11-04';

export const CARTILHA_2026: KnowledgeDocument = {
  id: 'inep-cartilha-2026',
  title: 'A redação no Enem 2026 — Cartilha do Participante',
  publisher: 'Inep/MEC',
  version: '2026',
  publishedAt: '2026-09-21',
  updatedAt: IMPORTED_AT,
  sourceUrl: 'https://download.inep.gov.br/publicacoes/institucionais/avaliacoes_e_exames_da_educacao_basica/cartilha_enem_2026.pdf',
  competencies: ['GERAL', 'C1', 'C2', 'C3', 'C4', 'C5'],
  status: 'current',
  notes: 'Publicada on-line em setembro de 2026. Edição vigente para a correção.',
};

export const CARTILHA_2025: KnowledgeDocument = {
  id: 'inep-cartilha-2025',
  title: 'A redação no Enem 2025 — Cartilha do Participante',
  publisher: 'Inep/MEC',
  version: '2025',
  publishedAt: '2025-10-03',
  updatedAt: IMPORTED_AT,
  sourceUrl: 'https://download.inep.gov.br/publicacoes/institucionais/avaliacoes_e_exames_da_educacao_basica/cartilha_enem_2025.pdf',
  competencies: ['GERAL', 'C1', 'C2', 'C3', 'C4', 'C5'],
  status: 'archived',
  notes: 'Mantida para auditoria e comparação; não é usada na recuperação padrão.',
};

export const MANUAL_C2_2019: KnowledgeDocument = {
  id: 'inep-manual-c2-2019',
  title: 'Competência II — Material de leitura (Módulo 04)',
  publisher: 'Inep/MEC',
  version: '2019',
  publishedAt: '2019-07-17',
  updatedAt: IMPORTED_AT,
  sourceUrl: 'https://download.inep.gov.br/educacao_basica/enem/downloads/2020/Competencia_2.pdf',
  competencies: ['C2'],
  status: 'reference',
  notes: 'Material oficial de capacitação de corretores; detalha tema, tipo textual e repertório. Não substitui a cartilha vigente.',
};

export const MANUAL_C4_2019: KnowledgeDocument = {
  id: 'inep-manual-c4-2019',
  title: 'Competência IV — Material de leitura (Módulo 06)',
  publisher: 'Inep/MEC',
  version: '2019',
  publishedAt: '2019-07-17',
  updatedAt: IMPORTED_AT,
  sourceUrl: 'https://download.inep.gov.br/educacao_basica/enem/downloads/2020/Competencia_4.pdf',
  competencies: ['C4'],
  status: 'reference',
  notes: 'Material oficial de capacitação de corretores; detalha coesão, referenciação e repetição. Não substitui a cartilha vigente.',
};

export const LUMINA_OPERATIONAL: KnowledgeDocument = {
  id: 'lumina-operacional',
  title: 'Critérios operacionais da Lumina',
  publisher: 'Lumina',
  version: '2026.11',
  publishedAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  sourceUrl: 'https://lumina.local/docs/correcao-redacao',
  competencies: ['GERAL', 'C1', 'C2', 'C3', 'C4', 'C5'],
  status: 'internal',
  notes: 'Não é documento do Inep. Serve para tornar a avaliação reprodutível e nunca deve ser citado como cartilha.',
};

export const KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  CARTILHA_2026,
  CARTILHA_2025,
  MANUAL_C2_2019,
  MANUAL_C4_2019,
  LUMINA_OPERATIONAL,
];

/** Documentos que entram na recuperação padrão (vigente + referência + Lumina). */
export const DEFAULT_SEARCH_DOCUMENT_IDS = new Set(
  KNOWLEDGE_DOCUMENTS.filter((document) => document.status !== 'archived').map((document) => document.id),
);

/** Compatibilidade: a referência pública agora aponta para a edição vigente. */
export const CARTILHA_REFERENCE = {
  ...CARTILHA_2026,
  url: CARTILHA_2026.sourceUrl,
} as const;
