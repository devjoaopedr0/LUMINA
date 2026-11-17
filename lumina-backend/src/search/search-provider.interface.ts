import { QuestionDifficulty } from '@prisma/client';

/** Contrato dos PROVEDORES de busca de questões na web (item 10).
 * Tanto o Google CSE real quanto o provedor demonstração implementam esta
 * interface; a SearchService escolhe o ativo conforme a configuração. */
export interface WebSearchProvider {
  /** Nome estável para o response (tavily | google-cse | demo) — o cliente sempre
   * sabe a origem, nunca confunde demo com resultado real. */
  readonly name: 'tavily' | 'google-cse' | 'demo';
  /** true quando o provedor tem tudo que precisa para operar de verdade. */
  isConfigured(): boolean;
  searchWeb(
    query: WebSearchQuery,
    userId: string,
    limit: number,
  ): Promise<WebSearchHit[]>;
}

export interface WebSearchQuery {
  q: string;
  exam?: string | null;
  subject?: string | null;
  topic?: string | null;
  difficulty?: QuestionDifficulty | null;
}

/** Classificação anexada a um hit (heurística + catálogo, nunca IA externa). */
export interface WebSearchHitClassification {
  subject?: string | null;
  subjectId?: string | null;
  topic?: string | null;
  topicId?: string | null;
  exam?: string | null;
  examId?: string | null;
  year?: number | null;
  difficulty?: QuestionDifficulty | null;
}

/** UM resultado da busca web — SOMENTE METADADOS PÚBLICOS do hit (título,
 * link, trecho) mais atribuição de fonte (sourceName/sourceId). O conteúdo
 * integral é transcrito pelo usuário no momento de salvar; guardamos sempre
 * o link/atribuição, respeitando direitos autorais e condições de uso. */
export interface WebSearchHit {
  title: string;
  link: string;
  snippet: string;
  sourceName?: string;
  sourceId?: string;
  classification?: WebSearchHitClassification | null;
}
