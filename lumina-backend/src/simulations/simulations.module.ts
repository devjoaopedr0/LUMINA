import { ListGeneratorService } from './list-generator.service';
import { Body, Controller, Delete, ForbiddenException, Get, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { QuestionsModule } from '../questions/questions.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { AcceptClassInviteDto, ArchiveClassDto, ClassMemberEmailDto, CreateAcademicPeriodDto, CreateClassDto, CreateEnemSimulationDto, CreateSimulationDto, GenerateListDto, JoinClassDto, SubmitSimulationDto, UpdateAcademicPeriodDto, UpdateClassDto, UpdateInstitutionMemberDto } from './simulations.dto';
import { SimulationsService } from './simulations.service';
import { AdaptiveSimulationService } from './adaptive-simulation.service';
import { AnswerSheetScanService } from './omr/answer-sheet-scan.service';
import { AnswerSheetController } from './omr/answer-sheet.controller';
import { QuestionScanService } from './question-scan.service';
import { QuestionScanCompleteDto } from './question-scan.dto';
import { AiModule } from '../ai/ai.module';
import { TaskSimulationService } from './task-simulation.service';
import { EnemSimulationService } from './enem-simulation.service';
import { PlanUsageService } from '../plans/plan-usage.service';

const isStudent = (user: UserWithProfile) => user.accountType === 'STUDENT_INDEPENDENT' || user.accountType === 'STUDENT_INSTITUTION';

@ApiTags('simulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('simulations')
export class SimulationsController {
  constructor(
    private readonly service: SimulationsService,
    private readonly lists: ListGeneratorService,
    private readonly adaptiveService: AdaptiveSimulationService,
    private readonly questionScanService: QuestionScanService,
    private readonly taskSimulation: TaskSimulationService,
    private readonly enem: EnemSimulationService,
    private readonly planUsage: PlanUsageService,
  ) {}

  /** Simulado criado pelo próprio aluno conta no limite do plano; o do professor, não. */
  private studentQuota<T>(user: UserWithProfile, run: () => Promise<T>): Promise<T> {
    return isStudent(user) ? this.planUsage.withQuota(user.id, 'SIMULATION', run) : run();
  }
  @Get('classes') classes(@CurrentUser() user: UserWithProfile, @Query('includeArchived') includeArchived?: string) { return this.service.classes(user.id, includeArchived === 'true'); }
  @Post('classes') createClass(@CurrentUser() user: UserWithProfile, @Body() dto: CreateClassDto) { return this.service.createClass(user.id, dto.name); }
  // Aluno independente não entra por código: só pelo link de convite de quem gerencia a turma.
  @Post('classes/join') joinClass(@CurrentUser() user: UserWithProfile, @Body() dto: JoinClassDto) {
    if (user.accountType === 'STUDENT_INDEPENDENT') throw new ForbiddenException('Aluno independente entra em turma só pelo link de convite do professor.');
    return this.service.joinClass(user.id, dto.joinCode);
  }
  @Post('classes/invite/accept') acceptClassInvite(@CurrentUser() user: UserWithProfile, @Body() dto: AcceptClassInviteDto) { return this.service.acceptClassInvite(user.id, dto.token); }
  @Get('classes/:id/invite-link') classInviteLink(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.classInviteLink(user.id, id); }
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
  @Post('lists/generate') generateList(@CurrentUser() user: UserWithProfile, @Body() dto: GenerateListDto) { return this.lists.generate(user.id, dto); }
  @Get() list(@CurrentUser() user: UserWithProfile) { return this.service.list(user.id); }
  @Post() create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateSimulationDto) { return this.studentQuota(user, () => this.service.create(user.id, dto.title, dto.questionIds, dto.classId, dto.assessmentType, dto.dueAt, dto.durationMinutes, dto.isRealExam, user.accountType, dto.generateAnswerSheet)); }
  @Get(':id') get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Query('answers') answers?: string) { return this.service.get(user.id, id, answers === 'true'); }
  @Post(':id/submission') async submit(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitSimulationDto) {
    const result = await this.service.submit(user.id, id, dto.answers);
    // Simulado que nasceu de uma tarefa do cronograma conclui a tarefa com a nota.
    await this.taskSimulation.completeFromSubmission(user.id, id, result.correct, result.total);
    return { ...result, tri: await this.enem.triForSubmission(user.id, id) };
  }
  /** Simulado modelo ENEM: um dia de prova, 90 questões (45 por área), com o tempo oficial. */
  @Post('enem') createEnem(@CurrentUser() user: UserWithProfile, @Body() dto: CreateEnemSimulationDto) { return this.studentQuota(user, () => this.enem.create(user.id, dto.day)); }
  /** Simulado da tarefa de "Simulado" do cronograma: cria na primeira vez, depois devolve o mesmo. */
  @Post('from-task/:taskId') async fromTask(@CurrentUser() user: UserWithProfile, @Param('taskId', ParseUUIDPipe) taskId: string) {
    const started = await this.taskSimulation.startForTask(user.id, taskId);
    if (!started) throw new NotFoundException('Tarefa não encontrada.');
    return started;
  }
  @Get(':id/submission') async submission(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.service.submission(user.id, id);
    // Nota estilo TRI por área (e a média, no modelo ENEM).
    return { ...result, tri: await this.enem.triForSubmission(user.id, id) };
  }

  // Adaptive simulation endpoints
  @Post('adaptive/start') adaptiveStart(@CurrentUser() user: UserWithProfile, @Body() dto: { examId?: string }) { return this.studentQuota(user, () => this.adaptiveService.start(user.id, dto.examId)); }
  @Get('adaptive/:id/next') adaptiveNext(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.nextQuestion(id); }
  @Post('adaptive/:id/answer') adaptiveAnswer(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: { questionId: string; selectedPosition: number; timeSpentSeconds?: number }) { return this.adaptiveService.answer(id, dto.questionId, dto.selectedPosition, dto.timeSpentSeconds); }
  @Post('adaptive/:id/finish') adaptiveFinish(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.finish(id); }
  @Post('adaptive/:id/abandon') adaptiveAbandon(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.abandon(id); }
  @Get('adaptive/:id/summary') adaptiveSummary(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.adaptiveService.summary(id); }
  @Get('adaptive') adaptiveList(@CurrentUser() user: UserWithProfile) { return this.adaptiveService.list(user.id); }

  // Scanner de cartão-resposta (item 17): ver omr/answer-sheet.controller.ts (rota /answer-sheets).

  // Question Scanner endpoints (item 18)
  @Post('question-scans/upload-url') questionScanPresignedUpload(@CurrentUser() user: UserWithProfile, @Body() dto: { contentType: string }) { return this.questionScanService.createPresignedUpload(user.id, dto); }
  @Post('question-scans/upload/:id/complete') questionScanCompleteUpload(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionScanCompleteDto) { return this.questionScanService.completeUpload(user.id, id, dto); }
  @Get('question-scans/uploads') listQuestionScanUploads(@CurrentUser() user: UserWithProfile) { return this.questionScanService.listUploads(user.id); }
  @Get('question-scans/processing/:id') getQuestionScanProcessing(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.questionScanService.getProcessing(user.id, id); }
  @Get('question-scans/stats') questionScanStats(@CurrentUser() user: UserWithProfile) { return this.questionScanService.getStats(user.id); }

  // Salvar resultado do scanner
  @Post('question-scans/processing/:id/save-question') saveQuestionScanAsQuestion(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) { return this.questionScanService.saveAsQuestion(user.id, id, dto); }
  @Post('question-scans/processing/:id/save-error-notebook') saveQuestionScanToErrorNotebook(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) { return this.questionScanService.saveToErrorNotebook(user.id, id, dto); }
}
@Module({ imports: [QuestionsModule, SchedulesModule, AiModule], controllers: [SimulationsController, AnswerSheetController], providers: [SimulationsService, ListGeneratorService, AdaptiveSimulationService, AnswerSheetScanService, QuestionScanService, TaskSimulationService, EnemSimulationService] })
export class SimulationsModule {}
