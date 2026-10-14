import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ExamIdParamsDto,
  PaginatedExamsDto,
  SubjectIdParamsDto,
  SubjectResponseDto,
  SubjectWithTopicsDto,
} from './dto/catalog-response.dto';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { PaginatedQuestionsDto } from './dto/question-response.dto';
import { QuestionCatalogService } from './question-catalog.service';

/** Catálogo de classificação do banco de questões (disciplinas, assuntos e
 * provas). Qualquer usuário autenticado pode navegar; o acesso ao conteúdo das
 * questões é validado no service. */
@ApiTags('catalog')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuestionCatalogController {
  constructor(private readonly catalogService: QuestionCatalogService) {}

  @Get('subjects')
  @ApiOperation({ summary: 'Lista todas as disciplinas cadastradas.' })
  @ApiResponse({ status: 200, type: [SubjectResponseDto] })
  listSubjects(@CurrentUser() user: UserWithProfile): Promise<SubjectResponseDto[]> {
    return this.catalogService.listSubjects(user.id);
  }

  @Get('subjects/:id/topics')
  @ApiOperation({ summary: 'Lista os assuntos de uma disciplina.' })
  @ApiResponse({ status: 200, type: SubjectWithTopicsDto })
  @ApiResponse({ status: 404, description: 'Disciplina não encontrada.' })
  listSubjectTopics(
    @CurrentUser() user: UserWithProfile,
    @Param() params: SubjectIdParamsDto,
  ): Promise<SubjectWithTopicsDto> {
    return this.catalogService.listSubjectTopics(user.id, params.id);
  }

  @Get('exams')
  @ApiOperation({ summary: 'Lista as provas/vestibulares cadastrados.' })
  @ApiResponse({ status: 200, type: PaginatedExamsDto })
  listExams(
    @CurrentUser() user: UserWithProfile,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ): Promise<PaginatedExamsDto> {
    return this.catalogService.listExams(user.id, page, limit);
  }

  @Get('exams/:id/questions')
  @ApiOperation({ summary: 'Lista as questões de uma prova específica.' })
  @ApiResponse({ status: 200, type: PaginatedQuestionsDto })
  @ApiResponse({ status: 404, description: 'Prova não encontrada.' })
  listExamQuestions(
    @CurrentUser() user: UserWithProfile,
    @Param() params: ExamIdParamsDto,
    @Query() query: QueryQuestionsDto,
  ): Promise<PaginatedQuestionsDto> {
    return this.catalogService.listExamQuestions(user.id, params.id, query);
  }

  @Get('exam-papers')
  @ApiOperation({ summary: 'Lista as provas antigas publicadas (PDF, páginas, gabarito).' })
  listExamPapers(@CurrentUser() user: UserWithProfile) {
    return this.catalogService.listExamPapers(user.id);
  }

  @Get('exam-papers/compare')
  @ApiOperation({ summary: 'Compara duas edições do mesmo vestibular e mede a repetição de questões.' })
  @ApiResponse({ status: 400, description: 'Edições de vestibulares diferentes ou a mesma edição duas vezes.' })
  @ApiResponse({ status: 404, description: 'Prova não encontrada ou não publicada.' })
  compareExamPapers(
    @CurrentUser() user: UserWithProfile,
    @Query('baseId', ParseUUIDPipe) baseId: string,
    @Query('compareId', ParseUUIDPipe) compareId: string,
  ) {
    return this.catalogService.compareExamPapers(user.id, baseId, compareId);
  }

  @Get('exam-papers/:id')
  @ApiOperation({ summary: 'Detalhe de uma prova antiga publicada.' })
  @ApiResponse({ status: 404, description: 'Prova não encontrada ou não publicada.' })
  getExamPaper(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getExamPaper(user.id, id);
  }

  @Get('exam-papers/:id/pages')
  @ApiOperation({ summary: 'Lista as páginas de uma prova antiga.' })
  @ApiResponse({ status: 404, description: 'Prova não encontrada ou não publicada.' })
  getExamPaperPages(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getExamPaperPages(user.id, id);
  }

  @Get('exam-papers/:id/questions')
  @ApiOperation({ summary: 'Lista as questões mapeadas de uma prova antiga.' })
  @ApiResponse({ status: 404, description: 'Prova não encontrada ou não publicada.' })
  getExamPaperQuestions(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getExamPaperQuestions(user.id, id);
  }

  /** Mantém o ParseUUIDPipe registrado no Swagger como exemplo de rota. */
  @Get('subjects/:id')
  @ApiOperation({ summary: 'Detalhe de uma disciplina.' })
  @ApiResponse({ status: 200, type: SubjectResponseDto })
  getSubject(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubjectResponseDto> {
    return this.catalogService.getSubject(user.id, id);
  }
}
