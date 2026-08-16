import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PaginatedProgressDto,
  PerformanceResponseDto,
} from './dto/progress-response.dto';
import { QuestionPerformanceService } from './question-performance.service';

/** Desempenho do aluno: progresso por questão, favoritos e estatísticas
 * agregadas por disciplina/assunto. Fonte de dados para painéis e LuminIA. */
@ApiTags('performance')
@Controller('users/me/questions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuestionPerformanceController {
  constructor(private readonly performanceService: QuestionPerformanceService) {}

  @Get('progress')
  @ApiOperation({ summary: 'Progresso do usuário em questões (tentativas, acertos, favoritos).' })
  @ApiResponse({ status: 200, type: PaginatedProgressDto })
  getProgress(
    @CurrentUser() user: UserWithProfile,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('favorites') favorites?: string,
  ): Promise<PaginatedProgressDto> {
    return this.performanceService.getProgress(user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      favorites,
    });
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Questões favoritas do usuário.' })
  @ApiResponse({ status: 200, type: PaginatedProgressDto })
  getFavorites(
    @CurrentUser() user: UserWithProfile,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedProgressDto> {
    return this.performanceService.getFavorites(user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('performance')
  @ApiOperation({ summary: 'Estatísticas de desempenho por disciplina e assunto.' })
  @ApiResponse({ status: 200, type: PerformanceResponseDto })
  getPerformance(@CurrentUser() user: UserWithProfile): Promise<PerformanceResponseDto> {
    return this.performanceService.getPerformance(user.id);
  }
}
