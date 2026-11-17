import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WebSearchHit, WebSearchQuery } from './search-provider.interface';
import { ClassifierCatalog, classifyWebHit, relevanceToQuery } from './web-hit-classifier';

/** O catálogo muda pouco; recarrega no máximo a cada 10 minutos. */
export const CATALOG_TTL_MS = 10 * 60 * 1000;

/** Classifica e ordena resultados de provedores reais (Tavily, Google CSE)
 * com o catálogo da Lumina. Se o catálogo não carregar, os resultados seguem
 * sem classificação — a busca nunca quebra por causa disso. */
@Injectable()
export class WebHitClassifierService {
  private readonly logger = new Logger(WebHitClassifierService.name);
  private cache: { catalog: ClassifierCatalog; loadedAt: number } | null = null;
  private loading: Promise<ClassifierCatalog> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async loadCatalog(): Promise<ClassifierCatalog> {
    const [subjects, exams] = await Promise.all([
      this.prisma.subject.findMany({
        select: { id: true, name: true, topics: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.exam.findMany({ select: { id: true, name: true, year: true } }),
    ]);
    return { subjects, exams };
  }

  async catalog(now = Date.now()): Promise<ClassifierCatalog> {
    if (this.cache && now - this.cache.loadedAt < CATALOG_TTL_MS) return this.cache.catalog;
    this.loading ??= this.loadCatalog().finally(() => (this.loading = null));
    const catalog = await this.loading;
    this.cache = { catalog, loadedAt: now };
    return catalog;
  }

  /** Classifica cada hit sem classificação e sobe os que batem com os
   * filtros pedidos (ordem estável entre empatados). */
  async classifyAndRank(hits: WebSearchHit[], query: WebSearchQuery): Promise<WebSearchHit[]> {
    let catalog: ClassifierCatalog;
    try {
      catalog = await this.catalog();
    } catch (error) {
      this.logger.warn(`Catálogo indisponível; resultados sem classificação: ${(error as Error).message}`);
      return hits;
    }
    return hits
      .map((hit, index) => {
        const classification = hit.classification ?? classifyWebHit(hit, query, catalog);
        return { hit: { ...hit, classification }, index, score: relevanceToQuery(classification, query) };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ hit }) => hit);
  }
}
