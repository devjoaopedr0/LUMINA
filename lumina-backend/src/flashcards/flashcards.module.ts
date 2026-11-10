import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import {
  CreateFlashcardDto,
  CreateFlashcardFromErrorDto,
  FlashcardHistoryDto,
  FlashcardResponseDto,
  FlashcardSummaryDto,
  GenerateFlashcardsDto,
  GenerateFlashcardsFromPdfDto,
  ReviewFlashcardDto,
  UpdateFlashcardDto,
} from './flashcards.dto';
import { FlashcardsService } from './flashcards.service';

@ApiTags('flashcards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('flashcards')
export class FlashcardsController {
  constructor(private readonly service: FlashcardsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os flashcards do aluno, opcionalmente só os vencidos.' })
  @ApiResponse({ status: 200, type: [FlashcardResponseDto] })
  list(
    @CurrentUser() user: UserWithProfile,
    @Query('due') due?: string,
    @Query('source') source?: string,
    @Query('subjectId') subjectId?: string,
    @Query('topicId') topicId?: string,
  ) {
    return this.service.list(user.id, { due, source, subjectId, topicId });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumo de domínio dos flashcards: vencidos, novos e retenção.' })
  @ApiResponse({ status: 200, type: FlashcardSummaryDto })
  summary(@CurrentUser() user: UserWithProfile) {
    return this.service.summary(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um flashcard manual.' })
  @ApiResponse({ status: 201, type: FlashcardResponseDto })
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateFlashcardDto) {
    return this.service.create(user.id, dto);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Gera flashcards com a LuminIA a partir de um conteúdo.' })
  @ApiResponse({ status: 201, type: [FlashcardResponseDto] })
  generate(@CurrentUser() user: UserWithProfile, @Body() dto: GenerateFlashcardsDto) {
    return this.service.generate(user.id, dto);
  }

  @Post('generate/from-pdf')
  @ApiOperation({
    summary: 'Extrai o texto de um PDF e gera flashcards com a LuminIA.',
  })
  @ApiResponse({ status: 201, type: [FlashcardResponseDto] })
  generateFromPdf(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: GenerateFlashcardsFromPdfDto,
  ) {
    return this.service.generateFromPdf(user.id, dto);
  }

  @Post('from-error/:questionId')
  @ApiOperation({
    summary: 'Cria um flashcard a partir de uma questão do caderno de erros.',
  })
  @ApiResponse({ status: 201, type: FlashcardResponseDto })
  createFromError(
    @CurrentUser() user: UserWithProfile,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: CreateFlashcardFromErrorDto,
  ) {
    return this.service.createFromError(user.id, questionId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um flashcard.' })
  @ApiResponse({ status: 200, type: FlashcardResponseDto })
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita frente, verso ou classificação de um flashcard.' })
  @ApiResponse({ status: 200, type: FlashcardResponseDto })
  update(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlashcardDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui um flashcard e o histórico de revisões.' })
  remove(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.id, id);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Registra uma revisão e agenda o próximo dia.' })
  @ApiResponse({ status: 201, type: FlashcardResponseDto })
  review(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewFlashcardDto,
  ) {
    return this.service.review(user.id, id, dto.rating);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Histórico de revisões e evolução de domínio do flashcard.' })
  @ApiResponse({ status: 200, type: FlashcardHistoryDto })
  history(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.history(user.id, id);
  }
}

@Module({
  imports: [AiModule],
  controllers: [FlashcardsController],
  providers: [FlashcardsService],
  exports: [FlashcardsService],
})
export class FlashcardsModule {}
