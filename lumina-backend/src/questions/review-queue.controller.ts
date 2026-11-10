import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserWithProfile } from '../users/users.repository';
import { ReviewQueueResponseDto } from './dto/review-queue.dto';
import { ReviewQueueService } from './review-queue.service';

/**
 * Fila diária de revisões do aluno. Lê as quatro fontes (domínio por tópico,
 * caderno de erros, flashcards e marcação manual) em uma resposta só, para a
 * central de revisões e o aviso do painel não precisarem repetir a regra de
 * vencimento em cada tela.
 */
@ApiTags('review-queue')
@Controller('users/me/review-queue')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReviewQueueController {
  constructor(private readonly reviewQueueService: ReviewQueueService) {}

  @Get()
  @ApiOperation({
    summary: 'Fila unificada de revisões: tópicos vencidos, caderno de erros e questões marcadas.',
  })
  @ApiResponse({ status: 200, type: ReviewQueueResponseDto })
  getQueue(
    @CurrentUser() user: UserWithProfile,
    @Query('limit') limit?: string,
  ): Promise<ReviewQueueResponseDto> {
    return this.reviewQueueService.getQueue(user.id, {
      limit: limit ? Number(limit) : undefined,
    });
  }
}
