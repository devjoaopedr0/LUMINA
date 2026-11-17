import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { previousMonthWindow, rollingWindow } from './report-build';
import { CreateSnapshotDto, ReportPeriodQueryDto, SubjectReportQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const windowOf = (q: ReportPeriodQueryDto) => (q.month ? previousMonthWindow(new Date()) : rollingWindow(q.days ?? 30, new Date()));

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('scope')
  @ApiOperation({ summary: 'Turmas e instituição sobre as quais o usuário pode gerar relatórios.' })
  async scope(@CurrentUser() user: UserWithProfile) {
    const s = await this.service.scope(user.id);
    return { teacherClasses: s.teacherClasses, institution: s.institution, institutionClasses: s.institutionClasses };
  }

  @Get('class/:id')
  @ApiOperation({ summary: 'Relatório de turma (professor da turma, coordenação ou direção da escola).' })
  classReport(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReportPeriodQueryDto) {
    return this.service.classReport(user.id, id, windowOf(q));
  }

  @Get('subject')
  @ApiOperation({ summary: 'Relatório de uma matéria, por turma.' })
  subjectReport(@CurrentUser() user: UserWithProfile, @Query() q: SubjectReportQueryDto) {
    return this.service.subjectReport(user.id, q.subject, windowOf(q), q.classId);
  }

  @Get('institution')
  @ApiOperation({ summary: 'Relatório institucional (coordenação e direção).' })
  institutionReport(@CurrentUser() user: UserWithProfile, @Query() q: ReportPeriodQueryDto) {
    return this.service.institutionReport(user.id, windowOf(q));
  }

  @Get('student/:id')
  @ApiOperation({ summary: 'Relatório individual ("me" = o próprio aluno; professor e escola: alunos das suas turmas).' })
  studentReport(@CurrentUser() user: UserWithProfile, @Param('id') id: string, @Query() q: ReportPeriodQueryDto) {
    if (id !== 'me' && !UUID.test(id)) throw new BadRequestException('Aluno inválido.');
    return this.service.studentReport(user.id, id === 'me' ? user.id : id, windowOf(q));
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'Relatórios salvos (gera os mensais automáticos que faltarem).' })
  snapshots(@CurrentUser() user: UserWithProfile) {
    return this.service.listSnapshots(user.id);
  }

  @Post('snapshots')
  @ApiOperation({ summary: 'Salva o relatório do período.' })
  createSnapshot(@CurrentUser() user: UserWithProfile, @Body() dto: CreateSnapshotDto) {
    return this.service.createSnapshot(user.id, dto);
  }

  @Get('snapshots/:id')
  @ApiOperation({ summary: 'Um relatório salvo.' })
  snapshot(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSnapshot(user.id, id);
  }
}
