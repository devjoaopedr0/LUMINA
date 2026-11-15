import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { TeacherAnalyticsQueryDto, UpdatePedagogicalAlertDto } from './teacher-analytics.dto';
import { TeacherAnalyticsService } from './teacher-analytics.service';

@ApiTags('institutional-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('institutional-analytics')
export class TeacherAnalyticsController {
  constructor(private readonly service: TeacherAnalyticsService) {}

  @Get('teacher')
  @ApiOperation({
    summary: 'Painel analítico das turmas do professor, com participação, questões e sinais pedagógicos.',
  })
  teacher(
    @CurrentUser() user: UserWithProfile,
    @Query() query: TeacherAnalyticsQueryDto,
  ) {
    return this.service.teacherAnalytics(user.id, query);
  }

  @Get('teacher/alerts')
  @ApiOperation({ summary: 'Alertas pedagógicos persistidos (janela fixa de 30 dias), com histórico de acompanhamento.' })
  alerts(@CurrentUser() user: UserWithProfile) {
    return this.service.alerts(user.id);
  }

  @Patch('teacher/alerts/:id')
  @ApiOperation({ summary: 'Reconhece, resolve, dispensa ou reabre um alerta do professor, com anotação.' })
  updateAlert(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePedagogicalAlertDto,
  ) {
    return this.service.updateAlert(user.id, id, dto.status, dto.note);
  }
}
