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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserWithProfile } from '../users/users.repository';
import {
  ErrorNotebookEntryDto,
  ErrorNotebookSummaryDto,
  PaginatedErrorNotebookDto,
  UpdateErrorNotebookEntryDto,
} from './dto/error-notebook.dto';
import { ErrorNotebookService } from './error-notebook.service';

/**
 * Caderno de erros do aluno (item 12 do inventário) com a classificação do
 * motivo (item 13). Tudo em `/users/me`: o caderno é do usuário, ninguém mais
 * escreve nele.
 *
 * A criação automática acontece em `POST /questions/:id/attempt` — errar já
 * registra. Aqui ficam as ações do aluno: incluir à mão, dizer por que errou,
 * anotar observação, marcar a revisão e tirar do caderno.
 */
@ApiTags('error-notebook')
@Controller('users/me/error-notebook')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ErrorNotebookController {
  constructor(private readonly errorNotebookService: ErrorNotebookService) {}

  @Get()
  @ApiOperation({
    summary: 'Caderno de erros do aluno, com filtros por situação, matéria, assunto, motivo e dificuldade.',
  })
  @ApiResponse({ status: 200, type: PaginatedErrorNotebookDto })
  list(
    @CurrentUser() user: UserWithProfile,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('subject') subject?: string,
    @Query('topic') topic?: string,
    @Query('reason') reason?: string,
    @Query('difficulty') difficulty?: string,
    @Query('due') due?: string,
  ): Promise<PaginatedErrorNotebookDto> {
    return this.errorNotebookService.list(user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      subject,
      topic,
      reason,
      difficulty,
      due,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totais e recortes do caderno (por matéria, assunto e motivo).' })
  @ApiResponse({ status: 200, type: ErrorNotebookSummaryDto })
  summary(@CurrentUser() user: UserWithProfile): Promise<ErrorNotebookSummaryDto> {
    return this.errorNotebookService.summary(user.id);
  }

  @Post(':questionId')
  @ApiOperation({ summary: 'Inclui a questão no caderno manualmente.' })
  @ApiResponse({ status: 201, type: ErrorNotebookEntryDto })
  add(
    @CurrentUser() user: UserWithProfile,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<ErrorNotebookEntryDto> {
    return this.errorNotebookService.add(user.id, questionId);
  }

  @Patch(':questionId')
  @ApiOperation({ summary: 'Motivo do erro, observação pessoal e revisão combinada.' })
  @ApiResponse({ status: 200, type: ErrorNotebookEntryDto })
  update(
    @CurrentUser() user: UserWithProfile,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: UpdateErrorNotebookEntryDto,
  ): Promise<ErrorNotebookEntryDto> {
    return this.errorNotebookService.update(user.id, questionId, dto);
  }

  @Delete(':questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tira a questão do caderno.' })
  @ApiResponse({ status: 204 })
  remove(
    @CurrentUser() user: UserWithProfile,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ): Promise<void> {
    return this.errorNotebookService.remove(user.id, questionId);
  }
}
