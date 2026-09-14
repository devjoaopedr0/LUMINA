import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAttemptDto } from './dto/create-attempt.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ImportEnemDto } from './dto/import-enem.dto';
import {
  ImportCsvQuestionsDto,
  ImportJsonQuestionsDto,
  ImportQuestionsDto,
  ImportReportDto,
  QuestionImportTarget,
} from './dto/import-questions.dto';
import {
  AttemptResultDto,
  PaginatedQuestionsDto,
  QuestionResponseDto,
} from './dto/question-response.dto';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { EnemImportService } from './import/enem/enem-import.service';
import { QuestionImportService } from './import/question-import.service';
import { QuestionsService } from './questions.service';

/** Controller só recebe a requisição e delega ao QuestionsService — nenhuma
 * regra de negócio vive aqui. Todas as rotas exigem autenticação e operam
 * sempre no workspace pessoal do usuário autenticado. */
@ApiTags('questions')
@Controller('questions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly questionImportService: QuestionImportService,
    private readonly enemImportService: EnemImportService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria uma questão de múltipla escolha no banco de questões.' })
  @ApiResponse({ status: 201, type: QuestionResponseDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos (ex: nenhuma alternativa marcada como correta).' })
  create(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: CreateQuestionDto,
  ): Promise<QuestionResponseDto> {
    return this.questionsService.create(user.id, dto);
  }

  @Post('import')
  @ApiOperation({
    summary:
      'Importa um lote de questões (pipeline de normalização, validação e deduplicação).',
  })
  @ApiResponse({ status: 201, type: ImportReportDto })
  async import(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: ImportQuestionsDto,
  ): Promise<ImportReportDto> {
    const workspace = await this.questionsService.getImportWorkspace(
      user.id,
      dto.target ?? QuestionImportTarget.PERSONAL,
    );
    return this.questionImportService.importFromDtos(dto.questions, workspace.id, user.id);
  }

  @Post('import/json')
  @ApiOperation({ summary: 'Importa questões de um arquivo JSON já convertido em objetos.' })
  @ApiResponse({ status: 201, type: ImportReportDto })
  async importJson(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: ImportJsonQuestionsDto,
  ): Promise<ImportReportDto> {
    const workspace = await this.questionsService.getImportWorkspace(
      user.id,
      dto.target ?? QuestionImportTarget.PERSONAL,
    );
    return this.questionImportService.importFromJson(dto.questions, workspace.id, user.id);
  }

  @Post('import/csv')
  @ApiOperation({ summary: 'Importa questões a partir do conteúdo de um arquivo CSV.' })
  @ApiResponse({ status: 201, type: ImportReportDto })
  async importCsv(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: ImportCsvQuestionsDto,
  ): Promise<ImportReportDto> {
    const workspace = await this.questionsService.getImportWorkspace(
      user.id,
      dto.target ?? QuestionImportTarget.PERSONAL,
    );
    return this.questionImportService.importFromCsv(dto.content, workspace.id, user.id);
  }

  @Post('import/enem')
  @ApiOperation({
    summary:
      'Baixa um caderno oficial do ENEM (PDFs públicos do INEP) e importa as questões dele.',
  })
  @ApiResponse({ status: 201, type: ImportReportDto })
  @ApiResponse({ status: 400, description: 'URL de PDF fora do domínio do INEP, ou PDF inacessível.' })
  @ApiResponse({ status: 403, description: 'Sem permissão para gerenciar questões no destino informado.' })
  async importEnem(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: ImportEnemDto,
  ): Promise<ImportReportDto> {
    const workspace = await this.questionsService.getImportWorkspace(
      user.id,
      dto.target ?? QuestionImportTarget.BANK,
    );
    const { questions, skipped } = await this.enemImportService.fetchExam({
      year: dto.year,
      day: dto.day,
      provaUrl: dto.provaUrl,
      gabaritoUrl: dto.gabaritoUrl,
    });
    return this.questionImportService.importScrapedQuestions(
      questions,
      skipped,
      workspace.id,
      user.id,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista as questões com filtros combináveis (matéria, conteúdo, dificuldade, exame, ano) e paginação.',
  })
  @ApiResponse({ status: 200, type: PaginatedQuestionsDto })
  findAll(
    @CurrentUser() user: UserWithProfile,
    @Query() query: QueryQuestionsDto,
  ): Promise<PaginatedQuestionsDto> {
    return this.questionsService.findAll(user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Retorna uma questão. Por padrão as alternativas não marcam a correta (modo responder); use ?includeAnswer=true para vê-la (modo autor/edição).',
  })
  @ApiResponse({ status: 200, type: QuestionResponseDto })
  @ApiResponse({ status: 404, description: 'Questão não encontrada.' })
  findById(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeAnswer') includeAnswer?: string,
  ): Promise<QuestionResponseDto> {
    return this.questionsService.findById(user.id, id, includeAnswer === 'true');
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza uma questão de forma parcial.' })
  @ApiResponse({ status: 200, type: QuestionResponseDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos (ex: mais de uma alternativa correta).' })
  @ApiResponse({ status: 404, description: 'Questão não encontrada.' })
  update(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ): Promise<QuestionResponseDto> {
    return this.questionsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma questão (junto com alternativas e tentativas).' })
  @ApiResponse({ status: 204, description: 'Questão excluída.' })
  @ApiResponse({ status: 404, description: 'Questão não encontrada.' })
  async remove(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.questionsService.remove(user.id, id);
  }

  @Post(':id/attempt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registra a resposta do usuário a uma questão e retorna se acertou e qual era a alternativa correta.',
  })
  @ApiResponse({ status: 200, type: AttemptResultDto })
  @ApiResponse({ status: 400, description: 'Alternativa inválida para esta questão.' })
  @ApiResponse({ status: 404, description: 'Questão não encontrada.' })
  answer(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttemptDto,
  ): Promise<AttemptResultDto> {
    return this.questionsService.answer(user.id, id, dto);
  }

  @Post(':id/favorite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca a questão como favorita.' })
  @ApiResponse({ status: 200, description: 'Novo estado de favorito.' })
  favorite(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ isFavorite: boolean }> {
    return this.questionsService.toggleFavorite(user.id, id, true);
  }

  @Delete(':id/favorite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a questão dos favoritos.' })
  @ApiResponse({ status: 200, description: 'Novo estado de favorito.' })
  unfavorite(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ isFavorite: boolean }> {
    return this.questionsService.toggleFavorite(user.id, id, false);
  }
}
