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
import {
  CreateStudyScheduleDto,
  CreateStudyTaskDto,
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
  constructor(private readonly service: SchedulesService) {}

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
    return this.service.updateSchedule(user.id, id, {
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      studyDays: dto.studyDays,
      dailyMinutes: dto.dailyMinutes,
      objective: dto.objective,
    });
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
    return { summary, evolution };
  }

  @Post("study/reschedule-missed")
  async rescheduleMissed(@CurrentUser() user: UserWithProfile, @Body("date") date: string) {
    return this.service.rescheduleMissed(user.id, userDate(date));
  }
}
