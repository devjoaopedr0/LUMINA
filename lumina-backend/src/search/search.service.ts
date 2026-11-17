import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { QuestionSourceType } from '@prisma/client';
import {
  SearchWebQueryDto,
  SearchWebResultsDto,
  SaveWebQuestionDto,
  DEFAULT_SEARCH_LIMIT,
  WebSearchResultDto,
} from './search.dto';
import {
  WebSearchProvider,
  WebSearchQuery,
  WebSearchHitClassification,
  WebSearchHit,
} from './search-provider.interface';
import { GoogleCseSearchProvider } from './google-cse.provider';
import { DemoWebSearchProvider } from './demo-search.provider';
import { TavilySearchProvider } from './tavily.provider';
import { WebHitClassifierService } from './web-hit-classifier.service';
import { WebSearchProviderError } from './search-provider.error';
import {
  ImportQuestionDto,
  ImportReportDto,
  QuestionImportTarget,
} from '../questions/dto/import-questions.dto';
import { QuestionsService } from '../questions/questions.service';
import { QuestionImportService } from '../questions/import/question-import.service';

/** Busca de QUESTÕES PÚBLICAS na web (item 10 do inventário).
 *
 * O SearchService é o orquestrador do pipeline:
 *
 *   1. `searchWeb(userId, query)` — delega ao provedor ATIVO:
 *      · `TavilySearchProvider` quando TAVILY_API_KEY está no .env (preferido);
 *      · `GoogleCseSearchProvider` quando o Google CSE está configurado
 *        (chaves GOOGLE_CSE_ID + GOOGLE_CSE_API_KEY) — também é a reserva
 *        se a Tavily falhar;
 *      · `DemoWebSearchProvider` caso contrário (modo demonstração, SEMPRE
 *        sinalizado no response via `demoMode: true` + `provider: 'demo'`).
 *      A resposta devolve APENAS metadados públicos (título, link, trecho)
 *      + atribuição + classificação automática — nunca o conteúdo integral.
 *
 *   2. `save(userId, dto)` — transcreve a questão encontrada na web para o
 *      banco Lumina REUSANDO o pipeline real de importação (validação,
 *      deduplicação por conteúdo, atribuição de catálogo) e preservando
 *      SEMPRE a atribuição: `sourceName` (fonte) e `sourceId` (link original)
 *      com `sourceType: IMPORTED`. Direitos autorais: gravamos o que o
 *      usuário transcreve (nunca baixamos/armazenamos texto de terceiros). */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly tavilyProvider: TavilySearchProvider,
    private readonly googleCseProvider: GoogleCseSearchProvider,
    private readonly demoWebSearchProvider: DemoWebSearchProvider,
    private readonly questionsService: QuestionsService,
    private readonly questionImportService: QuestionImportService,
    private readonly classifier: WebHitClassifierService,
  ) {}

  /** Provedores reais configurados, na ordem de preferência. Vazio = demo.
   * A escolha é SEMPRE refletida no response (`provider` + `demoMode`), para
   * o cliente nunca confundir busca real com demonstração. */
  private realProviders(): WebSearchProvider[] {
    return [this.tavilyProvider, this.googleCseProvider].filter((p) => p.isConfigured());
  }

  /** Tenta cada provedor real em ordem; se todos falharem, 503 com o motivo
   * (não cai no demo, que o app apresentaria como "chaves não configuradas"). */
  private async searchWithFallback(
    webQuery: WebSearchQuery,
    userId: string,
    limit: number,
  ): Promise<{ provider: WebSearchProvider; hits: WebSearchHit[] }> {
    const providers = this.realProviders();
    if (providers.length === 0) {
      return { provider: this.demoWebSearchProvider, hits: await this.demoWebSearchProvider.searchWeb(webQuery, userId, limit) };
    }
    let lastError: WebSearchProviderError | null = null;
    for (const provider of providers) {
      try {
        return { provider, hits: await provider.searchWeb(webQuery, userId, limit) };
      } catch (error) {
        if (!(error instanceof WebSearchProviderError)) throw error;
        lastError = error;
        this.logger.warn(`searchWeb: ${provider.name} falhou (${error.code}): ${error.message}`);
      }
    }
    throw new ServiceUnavailableException(
      lastError?.code === 'RATE_LIMIT'
        ? 'A busca na web atingiu o limite de uso por agora. Tente de novo mais tarde.'
        : 'A busca na web está indisponível no momento. Tente de novo em instantes.',
    );
  }

  async searchWeb(
    userId: string,
    query: SearchWebQueryDto,
  ): Promise<SearchWebResultsDto> {
    const webQuery: WebSearchQuery = {
      q: query.q.trim(),
      exam: query.exam ?? null,
      subject: query.subject ?? null,
      topic: query.topic ?? null,
      difficulty: query.difficulty ?? null,
    };
    const limit = Math.min(query.limit ?? DEFAULT_SEARCH_LIMIT, 20);
    const found = await this.searchWithFallback(webQuery, userId, Math.max(1, limit));
    const provider = found.provider;
    const demoMode = provider.name === 'demo';
    // O demo já vem classificado pelo próprio banco; os provedores reais são
    // classificados aqui com o catálogo (disciplina, assunto, prova, ano).
    const hits = demoMode ? found.hits : await this.classifier.classifyAndRank(found.hits, webQuery);

    const items: WebSearchResultDto[] = hits.map((hit) => ({
      title: hit.title,
      link: hit.link,
      snippet: hit.snippet,
      sourceName: hit.sourceName,
      sourceId: hit.sourceId,
      classification: hit.classification,
    }));

    this.logger.debug(
      `searchWeb: provider=${provider.name} demoMode=${demoMode} ` +
        `hits=${items.length} q="${webQuery.q}"`,
    );

    return {
      provider: provider.name,
      demoMode,
      query,
      items,
      total: items.length,
    };
  }

  /** Salva uma questão transcrita conforme uma fonte web no banco Lumina via
   * pipeline REAL de importação, preservando a atribuição:
   * `sourceType=IMPORTED`, `sourceName` = nome da fonte (ex: "QConcursos"),
   * `sourceId` = URL/link original. Deduplicação por conteúdo inclusa. */
  async save(userId: string, dto: SaveWebQuestionDto): Promise<ImportReportDto> {
    const workspace = await this.questionsService.getImportWorkspace(
      userId,
      QuestionImportTarget.PERSONAL,
    );

    const questionToImport: ImportQuestionDto = {
      ...dto.question,
      sourceType: QuestionSourceType.IMPORTED,
      sourceName: dto.sourceName,
      sourceId: dto.sourceUrl,
    };

    const report = await this.questionImportService.importFromDtos(
      [questionToImport],
      workspace.id,
      userId,
    );
    return report;
  }
}
