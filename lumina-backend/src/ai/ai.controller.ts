import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScheduleInsightsService } from '../schedules/schedule-insights.service';
import { UserWithProfile } from '../users/users.repository';
import { AiChatRequestDto, AiChatResponseDto } from './ai.dto';
import { AiService } from './ai.service';
import { TaskLesson, TopicLessonsService } from './topic-lessons.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly scheduleInsights: ScheduleInsightsService,
    private readonly lessons: TopicLessonsService,
  ) {}

  @Post('chat')
  async chat(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: AiChatRequestDto,
  ): Promise<AiChatResponseDto> {
    // Tarefa de outro aluno (ou inexistente) simplesmente não vira contexto.
    const explanation = dto.scheduleTaskId
      ? await this.scheduleInsights.explainTask(user.id, dto.scheduleTaskId)
      : null;
    return this.aiService.sendMessage(dto, explanation?.context, user.profile?.firstName);
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
}
