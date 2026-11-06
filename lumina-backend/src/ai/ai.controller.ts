import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QuestionsService } from '../questions/questions.service';
import { ScheduleInsightsService } from '../schedules/schedule-insights.service';
import { ScoreEstimateService } from '../schedules/score-estimate.service';
import { UserWithProfile } from '../users/users.repository';
import { AiChatRequestDto, AiChatResponseDto } from './ai.dto';
import { AiService } from './ai.service';
import { TaskLesson, TopicLessonsService } from './topic-lessons.service';
import { fallbackWeeklyComment, weeklySummaryContext } from '../schedules/schedule-weekly-summary';
import { luminiaSystemPrompt } from './luminia-persona';
import { SOCRATIC_GENERAL_CONTEXT, socraticTurnContext } from './socratic-tutor';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly scheduleInsights: ScheduleInsightsService,
    private readonly lessons: TopicLessonsService,
    private readonly scoreEstimates: ScoreEstimateService,
    private readonly questionsService: QuestionsService,
  ) {}

  @Post('chat')
  async chat(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: AiChatRequestDto,
  ): Promise<AiChatResponseDto> {
    const socratic = dto.mode === 'SOCRATIC';
    // Tarefa de outro aluno (ou inexistente) e questão inacessível simplesmente
    // não viram contexto: a conversa continua, sem revelar que o item existe.
    const [explanation, questionContext] = await Promise.all([
      dto.scheduleTaskId
        ? this.scheduleInsights.explainTask(user.id, dto.scheduleTaskId)
        : Promise.resolve(null),
      dto.questionId
        ? this.questionsService.tutorContext(
            user.id,
            dto.questionId,
            socratic ? 'SOCRATIC' : 'DIRECT',
          )
        : Promise.resolve(null),
    ]);
    const context = [
      explanation?.context,
      questionContext,
      socratic && !questionContext && !explanation?.context
        ? SOCRATIC_GENERAL_CONTEXT
        : null,
      socratic ? socraticTurnContext(dto.history) : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join('\n\n');
    return this.aiService.sendMessage(
      dto,
      context || undefined,
      user.profile?.firstName,
    );
  }

  /** Resumo de teoria do tópico da tarefa (gerado na primeira abertura). */
  @Get('lessons/task/:taskId')
  async taskLesson(
    @CurrentUser() user: UserWithProfile,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<TaskLesson> {
    const lesson = await this.lessons.lessonForTask(user.id, taskId);
    if (!lesson) throw new NotFoundException('Essa tarefa não tem um tópico com resumo.');
    return lesson;
  }

  /**
   * Comentário da LuminIA sobre a semana de estudos. Os fatos vêm do resumo
   * montado no servidor; sem provedor de IA (ou com ele fora do ar) sai um
   * comentário fixo com os mesmos fatos, para a tela nunca ficar vazia.
   */
  @Get('weekly-comment')
  async weeklyComment(
    @CurrentUser() user: UserWithProfile,
    @Query('date') date?: string,
  ): Promise<{ comment: string; source: 'AI' | 'FALLBACK' }> {
    const summary = await this.scheduleInsights.weeklySummary(user.id, date ? new Date(date) : new Date());
    if (!summary) throw new NotFoundException('Você ainda não tem um cronograma.');
    const estimate = await this.scoreEstimates.forUser(user.id);
    try {
      const comment = await this.aiService.generateText({
        system: `${luminiaSystemPrompt(user.profile?.firstName)}\n\n${weeklySummaryContext(summary, estimate.average ? estimate.message : null)}`,
        prompt: 'Como foi a minha semana de estudos?',
      });
      if (comment) return { comment, source: 'AI' };
    } catch {
      // Cai no comentário fixo abaixo.
    }
    return { comment: fallbackWeeklyComment(summary), source: 'FALLBACK' };
  }
}
