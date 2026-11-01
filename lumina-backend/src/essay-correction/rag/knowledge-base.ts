import {
  COMPETENCY_GRID,
  CompetencyId,
  KNOWLEDGE_BASE,
  KnowledgeChunk,
  KnowledgeScope,
} from '../knowledge/inep-cartilha-2025';
import { Bm25Index } from './bm25';

export interface RetrievedChunk extends KnowledgeChunk {
  score: number;
  /** Referência legível para citar ao aluno: "Cartilha Enem 2025, p. 26". */
  citation: string;
}

export function citationOf(chunk: KnowledgeChunk): string {
  return chunk.source === 'lumina'
    ? 'Critério operacional da Lumina (não consta da cartilha)'
    : `Cartilha do Participante Enem 2025 (Inep), p. ${chunk.page}`;
}

/** Busca na base da cartilha. Sem `scope`, procura em tudo. */
export class EssayKnowledgeBase {
  private readonly byId = new Map(KNOWLEDGE_BASE.map((chunk) => [chunk.id, chunk]));
  // Título entra duas vezes: é o resumo mais denso do trecho.
  private readonly index = new Bm25Index(
    KNOWLEDGE_BASE.map((chunk) => ({ id: chunk.id, text: `${chunk.title} ${chunk.title} ${chunk.text}` })),
  );

  search(query: string, options: { scope?: KnowledgeScope; limit?: number; includeGeneral?: boolean } = {}): RetrievedChunk[] {
    const limit = Math.min(Math.max(options.limit ?? 4, 1), 12);
    const filter = options.scope
      ? (id: string) => {
          const scope = this.byId.get(id)?.scope;
          return scope === options.scope || (options.includeGeneral === true && scope === 'GERAL');
        }
      : undefined;
    return this.index.search(query, limit, filter).map((hit) => {
      const chunk = this.byId.get(hit.id)!;
      return { ...chunk, score: Number(hit.score.toFixed(3)), citation: citationOf(chunk) };
    });
  }

  get(id: string): KnowledgeChunk | undefined {
    return this.byId.get(id);
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
