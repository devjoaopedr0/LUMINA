import { Body, Controller, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SearchWebQueryDto, SearchWebResultsDto, SaveWebQuestionDto } from './search.dto';
import { SearchService } from './search.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserWithProfile } from '../users/users.repository';
import { ImportReportDto } from '../questions/dto/import-questions.dto';

/** Busca de QUESTÕES PÚBLICAS na web (item 10 do inventário) e salvamento
 * das questões encontradas no banco Lumina, sempre com atribuição.
 *
 *   GET /search/web   → Google CSE configurado? busca real. Sem chaves?
 *                       modo demonstração determinístico — o response sinaliza
 *                       `provider` e `demoMode` explicitamente.
 *   POST /search/save → importa a questão da web para o banco via pipeline
 *                       real de importação (validada, deduplicada por
 *                       conteúdo, atribuição de catálogo), marcando-a como
 *                       IMPORTED com sourceName (fonte) e sourceId (link
 *                       original) preservados.
 *
 * Direitos autorais: a busca devolve APENAS metadados de resultado público
 * (título, link, trecho) + atribuição. O conteúdo integral é transcrito
 * pelo usuário no momento de salvar — nunca baixamos nem armazenamos o
 * texto integral de páginas de terceiros. */
@ApiTags('Busca de questões na web')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  @Get('web')
  @ApiOperation({
    summary: 'Busca questões públicas na web (Tavily, Google CSE ou demonstração).',
    description:
      'Usa a Tavily (TAVILY_API_KEY) quando configurada; depois, ou se ela falhar, ' +
      'o Google Programmable Search Engine (GOOGLE_CSE_ID + GOOGLE_CSE_API_KEY). ' +
      'Sem nenhuma chave, entra em modo demonstração determinístico — o response ' +
      'sinaliza provider="demo" e demoMode=true. Se todos os provedores reais ' +
      'falharem, responde 503.',
  })
  @ApiOkResponse({ type: SearchWebResultsDto })
  @ApiNotFoundResponse({ description: 'Workspace pessoal não encontrado (modo demo).' })
  async searchWeb(
    @CurrentUser() user: UserWithProfile,
    @Query() query: SearchWebQueryDto,
  ): Promise<SearchWebResultsDto> {
    return this.searchService.searchWeb(user.id, query);
  }

  @Post('save')
  @ApiOperation({
    summary: 'Salva uma questão encontrada na web no banco Lumina.',
    description:
      'Reusa o pipeline de importação (validação, deduplicação e atribuição). ' +
      'A questão entra como IMPORTED com sourceName (fonte) e sourceId (link ' +
      'original) preservados. O relatório de importação é devolvido.',
  })
  @ApiCreatedResponse({ type: ImportReportDto })
  @ApiNotFoundResponse({ description: 'Workspace de destino não encontrado.' })
  async save(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: SaveWebQuestionDto,
  ): Promise<ImportReportDto> {
    return this.searchService.save(user.id, dto);
  }
}
