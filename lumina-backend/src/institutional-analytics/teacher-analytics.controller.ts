import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { TeacherAnalyticsQueryDto } from './teacher-analytics.dto';
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
}
