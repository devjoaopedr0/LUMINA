import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { QuestionsModule } from '../questions/questions.module';
import { CreateAcademicPeriodDto, CreateClassDto, CreateSimulationDto, JoinClassDto, SubmitSimulationDto, UpdateAcademicPeriodDto, UpdateInstitutionMemberDto } from './simulations.dto';
import { SimulationsService } from './simulations.service';

@ApiTags('simulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('simulations')
export class SimulationsController {
  constructor(private readonly service: SimulationsService) {}
  @Get('classes') classes(@CurrentUser() user: UserWithProfile) { return this.service.classes(user.id); }
  @Post('classes') createClass(@CurrentUser() user: UserWithProfile, @Body() dto: CreateClassDto) { return this.service.createClass(user.id, dto.name); }
  @Post('classes/join') joinClass(@CurrentUser() user: UserWithProfile, @Body() dto: JoinClassDto) { return this.service.joinClass(user.id, dto.joinCode); }
  @Get('teacher/dashboard') teacherDashboard(@CurrentUser() user: UserWithProfile) { return this.service.teacherDashboard(user.id); }
  @Get('coordinator/dashboard') coordinatorDashboard(@CurrentUser() user: UserWithProfile) { return this.service.coordinatorDashboard(user.id); }
  @Get('director/dashboard') directorDashboard(@CurrentUser() user: UserWithProfile) { return this.service.directorDashboard(user.id); }
  @Patch('director/members/:memberId') updateDirectorMember(@CurrentUser() user: UserWithProfile, @Param('memberId', ParseUUIDPipe) memberId: string, @Body() dto: UpdateInstitutionMemberDto) { return this.service.updateDirectorMember(user.id, memberId, dto); }
  @Get('coordinator/periods') coordinatorPeriods(@CurrentUser() user: UserWithProfile) { return this.service.coordinatorPeriods(user.id); }
  @Post('coordinator/periods') createCoordinatorPeriod(@CurrentUser() user: UserWithProfile, @Body() dto: CreateAcademicPeriodDto) { return this.service.createCoordinatorPeriod(user.id, dto); }
  @Patch('coordinator/periods/:periodId') updateCoordinatorPeriod(@CurrentUser() user: UserWithProfile, @Param('periodId', ParseUUIDPipe) periodId: string, @Body() dto: UpdateAcademicPeriodDto) { return this.service.updateCoordinatorPeriod(user.id, periodId, dto); }
  @Get() list(@CurrentUser() user: UserWithProfile) { return this.service.list(user.id); }
  @Post() create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateSimulationDto) { return this.service.create(user.id, dto.title, dto.questionIds, dto.classId, dto.assessmentType, dto.dueAt); }
  @Get(':id') get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Query('answers') answers?: string) { return this.service.get(user.id, id, answers === 'true'); }
  @Post(':id/submission') submit(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitSimulationDto) { return this.service.submit(user.id, id, dto.answers); }
  @Get(':id/submission') submission(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.submission(user.id, id); }
}

@Module({ imports: [QuestionsModule], controllers: [SimulationsController], providers: [SimulationsService] })
export class SimulationsModule {}
