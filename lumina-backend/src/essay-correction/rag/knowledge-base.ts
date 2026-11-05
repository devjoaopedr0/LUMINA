import {
  COMPETENCY_GRID,
  CompetencyId,
  DEFAULT_SEARCH_DOCUMENT_IDS,
  KNOWLEDGE_BASE,
  KNOWLEDGE_DOCUMENTS,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeScope,
} from '../knowledge';
import { Bm25Index } from './bm25';

export interface RetrievedChunk extends KnowledgeChunk {
  score: number;
  /** Referência legível para citar ao aluno: "Cartilha Enem 2026, p. 27". */
  citation: string;
}

export interface SearchOptions {
  scope?: KnowledgeScope;
  limit?: number;
  includeGeneral?: boolean;
  /** Restringe a um documento específico (ex.: "inep-cartilha-2025"). */
  documentId?: string;
  /** Inclui documentos arquivados na busca. Padrão: false. */
  includeArchived?: boolean;
}

export function citationOf(chunk: KnowledgeChunk): string {
  if (chunk.source === 'lumina') return 'Critério operacional da Lumina (não consta da cartilha)';
  const document = KNOWLEDGE_DOCUMENTS.find((d) => d.id === chunk.documentId);
  const title = document?.title ?? `Documento ${chunk.documentId}`;
  const year = chunk.documentVersion;
  return `${title} (Inep), ${year}, p. ${chunk.page}`;
}

/** Documentos que podem ser citados como base da correção. */
export function knowledgeDocumentsForAudit(): KnowledgeDocument[] {
  return KNOWLEDGE_DOCUMENTS.filter((document) => document.status !== 'archived');
}

/** Busca na base versionada. Sem `documentId`, usa a edição vigente + referências. */
export class EssayKnowledgeBase {
  private readonly byId = new Map(KNOWLEDGE_BASE.map((chunk) => [chunk.id, chunk]));
  private readonly documentsById = new Map(KNOWLEDGE_DOCUMENTS.map((document) => [document.id, document]));
  // Título entra duas vezes: é o resumo mais denso do trecho.
  private readonly index = new Bm25Index(
    KNOWLEDGE_BASE.map((chunk) => ({ id: chunk.id, text: `${chunk.title} ${chunk.title} ${chunk.text}` })),
  );

  search(query: string, options: SearchOptions = {}): RetrievedChunk[] {
    const limit = Math.min(Math.max(options.limit ?? 4, 1), 12);
    const filter = (id: string) => {
      const chunk = this.byId.get(id);
      if (!chunk) return false;
      if (options.documentId && chunk.documentId !== options.documentId) return false;
      if (!options.documentId && !options.includeArchived && !DEFAULT_SEARCH_DOCUMENT_IDS.has(chunk.documentId)) return false;
      return !options.scope || chunk.scope === options.scope || (options.includeGeneral === true && chunk.scope === 'GERAL');
    };
    return this.index.search(query, limit, filter).map((hit) => {
      const chunk = this.byId.get(hit.id)!;
      return { ...chunk, score: Number(hit.score.toFixed(3)), citation: citationOf(chunk) };
    });
  }

  get(id: string): KnowledgeChunk | undefined {
    return this.byId.get(id);
  }

  documents(): KnowledgeDocument[] {
    return [...KNOWLEDGE_DOCUMENTS];
  }

  currentDocument(): KnowledgeDocument {
    return this.documentsById.get('inep-cartilha-2026')!;
  }

  grid(competency: CompetencyId) {
    return COMPETENCY_GRID[competency];
  }

  /**
   * Contexto de uma competência para o corretor: a grade oficial sempre entra
   * (é o critério de nota), mais os trechos mais próximos da consulta — que é
   * montada a partir dos problemas que a análise do texto encontrou.
   */
  contextFor(competency: CompetencyId, query: string, limit = 3): RetrievedChunk[] {
    const grade = this.get(`${competency.toLowerCase()}-niveis`)!;
    const hits = this.search(query, { scope: competency, limit: limit + 1 }).filter((hit) => hit.id !== grade.id).slice(0, limit);
    return [{ ...grade, score: Infinity, citation: citationOf(grade) }, ...hits];
  }
}
