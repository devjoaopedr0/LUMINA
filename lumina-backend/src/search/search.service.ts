import { Injectable, Logger } from '@nestjs/common';
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
} from './search-provider.interface';
import { GoogleCseSearchProvider } from './google-cse.provider';
import { DemoWebSearchProvider } from './demo-search.provider';
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
 *      · `GoogleCseSearchProvider` quando o Google CSE está configurado no .env
 *        (chaves GOOGLE_CSE_ID + GOOGLE_CSE_API_KEY);
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
    private readonly googleCseProvider: GoogleCseSearchProvider,
    private readonly demoWebSearchProvider: DemoWebSearchProvider,
    private readonly questionsService: QuestionsService,
    private readonly questionImportService: QuestionImportService,
  ) {}

  /** Provedor ativo: Google CSE quando configurado; senão demo. A escolha é
   * SEMPRE refletida no response (`provider` + `demoMode`), para o cliente
   * nunca confundir busca real com demonstração. */
  private get activeProvider(): WebSearchProvider {
    if (this.googleCseProvider.isConfigured()) {
      return this.googleCseProvider;
    }
    return this.demoWebSearchProvider;
  }

  async searchWeb(
    userId: string,
    query: SearchWebQueryDto,
  ): Promise<SearchWebResultsDto> {
    const provider = this.activeProvider;
    const demoMode = provider.name === 'demo';

    const webQuery: WebSearchQuery = {
      q: query.q.trim(),
      exam: query.exam ?? null,
      subject: query.subject ?? null,
      topic: query.topic ?? null,
      difficulty: query.difficulty ?? null,
    };
    const limit = Math.min(query.limit ?? DEFAULT_SEARCH_LIMIT, 20);
    const hits = await provider.searchWeb(webQuery, userId, Math.max(1, limit));

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
