import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { QuestionsModule } from '../questions/questions.module';
import { ArchiveClassDto, ClassMemberEmailDto, CreateAcademicPeriodDto, CreateClassDto, CreateSimulationDto, JoinClassDto, SubmitSimulationDto, UpdateAcademicPeriodDto, UpdateClassDto, UpdateInstitutionMemberDto } from './simulations.dto';
import { SimulationsService } from './simulations.service';
import { AdaptiveSimulationService } from './adaptive-simulation.service';

@ApiTags('simulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('simulations')
export class SimulationsController {
  constructor(
    private readonly service: SimulationsService,
    private readonly adaptiveService: AdaptiveSimulationService,
  ) {}
  @Get('classes') classes(@CurrentUser() user: UserWithProfile, @Query('includeArchived') includeArchived?: string) { return this.service.classes(user.id, includeArchived === 'true'); }
  @Post('classes') createClass(@CurrentUser() user: UserWithProfile, @Body() dto: CreateClassDto) { return this.service.createClass(user.id, dto.name); }
  @Post('classes/join') joinClass(@CurrentUser() user: UserWithProfile, @Body() dto: JoinClassDto) { return this.service.joinClass(user.id, dto.joinCode); }
  @Get('classes/:id') classDetail(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.classDetail(user.id, id); }
  @Patch('classes/:id') updateClass(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto) { return this.service.updateClass(user.id, id, dto); }
  @Patch('classes/:id/archive') archiveClass(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ArchiveClassDto) { return this.service.setClassArchived(user.id, id, dto.archived); }
  @Post('classes/:id/teachers') addClassTeacher(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClassMemberEmailDto) { return this.service.addClassTeacher(user.id, id, dto.email); }
  @Delete('classes/:id/teachers/:teacherId') removeClassTeacher(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('teacherId', ParseUUIDPipe) teacherId: string) { return this.service.removeClassTeacher(user.id, id, teacherId); }
  @Post('classes/:id/members') addClassMember(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClassMemberEmailDto) { return this.service.addClassMember(user.id, id, dto.email); }
  @Delete('classes/:id/members/:studentId') removeClassMember(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) { return this.service.removeClassMember(user.id, id, studentId); }
  @Get('teacher/dashboard') teacherDashboard(@CurrentUser() user: UserWithProfile) { return this.service.teacherDashboard(user.id); }
  @Get('coordinator/dashboard') coordinatorDashboard(@CurrentUser() user: UserWithProfile) { return this.service.coordinatorDashboard(user.id); }
  @Get('director/dashboard') directorDashboard(@CurrentUser() user: UserWithProfile) { return this.service.directorDashboard(user.id); }
  @Patch('director/members/:memberId') updateDirectorMember(@CurrentUser() user: UserWithProfile, @Param('memberId', ParseUUIDPipe) memberId: string, @Body() dto: UpdateInstitutionMemberDto) { return this.service.updateDirectorMember(user.id, memberId, dto); }
  @Get('coordinator/periods') coordinatorPeriods(@CurrentUser() user: UserWithProfile) { return this.service.coordinatorPeriods(user.id); }
  @Post('coordinator/periods') createCoordinatorPeriod(@CurrentUser() user: UserWithProfile, @Body() dto: CreateAcademicPeriodDto) { return this.service.createCoordinatorPeriod(user.id, dto); }
  @Patch('coordinator/periods/:periodId') updateCoordinatorPeriod(@CurrentUser() user: UserWithProfile, @Param('periodId', ParseUUIDPipe) periodId: string, @Body() dto: UpdateAcademicPeriodDto) { return this.service.updateCoordinatorPeriod(user.id, periodId, dto); }
  @Get() list(@CurrentUser() user: UserWithProfile) { return this.service.list(user.id); }
  @Post() create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateSimulationDto) { return this.service.create(user.id, dto.title, dto.questionIds, dto.classId, dto.assessmentType, dto.dueAt, dto.durationMinutes, dto.isRealExam); }
  @Get(':id') get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Query('answers') answers?: string) { return this.service.get(user.id, id, answers === 'true'); }
  @Post(':id/submission') submit(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitSimulationDto) { return this.service.submit(user.id, id, dto.answers); }
  @Get(':id/submission') submission(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.submission(user.id, id); }

  // Adaptive simulation endpoints
  @Post('adaptive/start') adaptiveStart(@CurrentUser() user: UserWithProfile, @Body() dto: { examId?: string }) { return this.adaptiveService.start(user.id, dto.examId); }
  @Get('adaptive/:id/next') adaptiveNext(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.nextQuestion(id); }
  @Post('adaptive/:id/answer') adaptiveAnswer(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: { questionId: string; selectedPosition: number; timeSpentSeconds?: number }) { return this.adaptiveService.answer(id, dto.questionId, dto.selectedPosition, dto.timeSpentSeconds); }
  @Post('adaptive/:id/finish') adaptiveFinish(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.finish(id); }
  @Post('adaptive/:id/abandon') adaptiveAbandon(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.abandon(id); }
  @Get('adaptive/:id/summary') adaptiveSummary(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.summary(id); }
  @Get('adaptive') adaptiveList(@CurrentUser() user: UserWithProfile) { return this.adaptiveService.list(user.id); }
}

@Module({ imports: [QuestionsModule], controllers: [SimulationsController], providers: [SimulationsService, AdaptiveSimulationService] })
export class SimulationsModule {}
