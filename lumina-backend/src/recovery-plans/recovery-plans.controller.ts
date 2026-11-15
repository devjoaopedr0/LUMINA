import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { CreateRecoveryPlanDto, ListRecoveryPlansQueryDto } from './recovery-plans.dto';
import { RecoveryPlansService } from './recovery-plans.service';

@ApiTags('recovery-plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recovery-plans')
export class RecoveryPlansController {
  constructor(private readonly service: RecoveryPlansService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um plano de recuperação (o próprio aluno, ou um professor para aluno da sua turma). Sem assunto, usa o mais fraco.' })
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateRecoveryPlanDto) {
    return this.service.create(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Planos de recuperação do aluno autenticado, com progresso.' })
  mine(@CurrentUser() user: UserWithProfile) {
    return this.service.listMine(user.id);
  }

  @Get('teacher')
  @ApiOperation({ summary: 'Planos dos alunos das turmas do professor.' })
  teacher(@CurrentUser() user: UserWithProfile, @Query() query: ListRecoveryPlansQueryDto) {
    return this.service.listForTeacher(user.id, query.studentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Um plano com o progresso de cada etapa.' })
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id, user.id);
  }

  @Post(':id/video')
  @ApiOperation({ summary: 'O aluno marca a videoaula do plano como assistida.' })
  video(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markVideo(id, user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela o plano (aluno ou quem criou).' })
  cancel(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(id, user.id);
  }
}
