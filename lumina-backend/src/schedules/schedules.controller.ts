import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SchedulesService } from "./schedules.service";
import { ScheduleInsightsService } from "./schedule-insights.service";
import {
  CreateStudyScheduleDto,
  CreateStudyTaskDto,
  ReplanTaskDto,
  RescheduleTaskDto,
  SetVestibularDto,
  SubjectTimeLogDto,
  TimeLogDto,
  UpdateStudyScheduleDto,
  UpdateStudyTaskDto,
} from "./dto/create-study-schedule.dto";
import type { UserWithProfile } from "../users/users.repository";

function userDate(date?: string): Date {
  return date ? new Date(date) : new Date();
}

@ApiTags("study")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SchedulesController {
  constructor(
    private readonly service: SchedulesService,
    private readonly insights: ScheduleInsightsService,
  ) {}

  @Get("study/subjects")
  async getSubjects() {
    const subjects = await this.service.findStudySubjects();
    return subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      displayOrder: s.displayOrder,
    }));
  }

  @Get("user/vestibular")
  async getUserVestibular(@CurrentUser() user: UserWithProfile) {
    const vestibular = await this.service.getUserVestibular(user.id);
    return vestibular ?? null;
  }

  @Post("user/vestibular")
  async setVestibular(@CurrentUser() user: UserWithProfile, @Body() dto: SetVestibularDto) {
    return this.service.setVestibular(user.id, {
      examId: dto.examId ?? null,
      customName: dto.customName ?? null,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
    });
  }

  @Get("study/schedule")
  async getSchedule(@CurrentUser() user: UserWithProfile) {
    return this.service.getSchedule(user.id);
  }

  @Post("study/schedule")
  async createSchedule(@CurrentUser() user: UserWithProfile, @Body() dto: CreateStudyScheduleDto) {
    await this.service.createSchedule(user.id, dto);
    return { ok: true };
  }

  @Patch("study/schedule/:id")
  async updateSchedule(
    @CurrentUser() user: UserWithProfile,
    @Param("id") id: string,
    @Body() dto: UpdateStudyScheduleDto,
  ) {
    return this.service.updateSchedule(user.id, id, dto);
  }

  @Delete("study/schedule/:id")
  async deleteSchedule(@CurrentUser() user: UserWithProfile, @Param("id") id: string) {
    await this.service.deleteSchedule(user.id, id);
    return { ok: true };
  }

  @Get("study/daily")
  async getDailySession(
    @CurrentUser() user: UserWithProfile,
    @Query("date") date?: string,
  ) {
    return this.service.getDailySession(user.id, userDate(date));
  }

  @Post("study/daily/refresh")
  @ApiOperation({
    summary: "Refaz o plano de um dia com o domínio atual",
    description: "Troca só as tarefas geradas que o aluno ainda não tocou.",
  })
  async refreshDay(@CurrentUser() user: UserWithProfile, @Body("date") date?: string) {
    return this.service.refreshDay(user.id, userDate(date));
  }

  @Get("study/week")
  @ApiOperation({
    summary: "Resumo de sete dias a partir de `start`",
    description: "Tarefas planejadas e concluídas por dia. Não gera tarefas.",
  })
  async getWeek(
    @CurrentUser() user: UserWithProfile,
    @Query("start") start?: string,
  ) {
    return this.service.getWeek(user.id, userDate(start));
  }

  @Get("study/diagnostic")
  @ApiOperation({
    summary: "Diagnóstico inicial do onboarding",
    description:
      "Até 5 questões por área do ENEM, das matérias do cronograma. As respostas " +
      "vão pelo endpoint normal de tentativa e alimentam o domínio por tópico.",
  })
  async getDiagnostic(@CurrentUser() user: UserWithProfile) {
    return this.insights.diagnostic(user.id);
  }

  @Get("study/tasks")
  async getTasks(
    @CurrentUser() user: UserWithProfile,
    @Query("status") status?: string,
    @Query("subjectId") subjectId?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.service.getTasks(user.id, { status, subjectId, page: page ?? 1, limit: limit ?? 20 });
  }

  @Post("study/tasks")
  async createTask(@CurrentUser() user: UserWithProfile, @Body() dto: CreateStudyTaskDto) {
    return this.service.createTask(user.id, dto);
  }

  @Patch("study/tasks/:id")
  async updateTask(
    @CurrentUser() user: UserWithProfile,
    @Param("id") id: string,
    @Body() dto: UpdateStudyTaskDto,
  ) {
    return this.service.updateTask(
      user.id,
      id,
      dto as Parameters<typeof this.service.updateTask>[2],
    );
  }

  @Delete("study/tasks/:id")
  async deleteTask(@CurrentUser() user: UserWithProfile, @Param("id") id: string) {
    return this.service.deleteTask(user.id, id);
  }

  @Patch("study/tasks/:id/reschedule")
  async rescheduleTask(
    @CurrentUser() user: UserWithProfile,
    @Param("id") id: string,
    @Body() dto: RescheduleTaskDto,
  ) {
    return this.service.rescheduleTask(user.id, id, dto.sessionId);
  }

  @Post("study/tasks/:id/replan")
  @ApiOperation({
    summary: "Replaneja uma tarefa não feita",
    description: "O aluno escolhe: próximo dia, sábado, redistribuir ou não fazer.",
  })
  async replanTask(
    @CurrentUser() user: UserWithProfile,
    @Param("id") id: string,
    @Body() dto: ReplanTaskDto,
  ) {
    const result = await this.service.replanTask(user.id, id, dto);
    if (!result) throw new NotFoundException("Tarefa não encontrada.");
    return result;
  }

  @Get("study/tasks/:id/explain")
  @ApiOperation({ summary: "Por que esta tarefa está no cronograma" })
  async explainTask(@CurrentUser() user: UserWithProfile, @Param("id") id: string) {
    const explanation = await this.insights.explainTask(user.id, id);
    if (!explanation) throw new NotFoundException("Tarefa não encontrada.");
    // `context` é o texto que vai para a LuminIA; a tela usa só os motivos.
    const { context: _context, ...rest } = explanation;
    return rest;
  }

  @Patch("study/tasks/:id/complete")
  async completeTask(@CurrentUser() user: UserWithProfile, @Param("id") id: string) {
    return this.service.completeTask(user.id, id);
  }

  @Post("study/tasks/:id/timer")
  async logTime(@CurrentUser() user: UserWithProfile, @Param("id") id: string, @Body() dto: TimeLogDto) {
    return this.service.stopTimer(user.id, id, dto.durationMinutes);
  }

  @Post("study/timer")
  @ApiOperation({
    summary: "Registra tempo de estudo por matéria",
    description:
      "Usado pelo cronômetro: o aluno informa a disciplina e os minutos, sem " +
      "depender de subtópico ou de tarefa do dia.",
  })
  async logSubjectTime(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: SubjectTimeLogDto,
  ) {
    const result = await this.service.logSubjectTime(
      user.id,
      dto.subjectId,
      dto.durationMinutes,
    );
    if (!result) {
      throw new NotFoundException(
        "Matéria fora do seu cronograma. Escolha uma disciplina planejada.",
      );
    }
    return result;
  }

  @Get("study/progress")
  async getProgress(@CurrentUser() user: UserWithProfile) {
    const summary = await this.service.getProgress(user.id);
    const evolution = await this.service.getProgressEvolution(user.id, 30);
    const mastery = await this.insights.masterySummary(user.id);
    return { summary, evolution, mastery };
  }

  @Post("study/reschedule-missed")
  async rescheduleMissed(@CurrentUser() user: UserWithProfile, @Body("date") date: string) {
    return this.service.rescheduleMissed(user.id, userDate(date));
  }
}
