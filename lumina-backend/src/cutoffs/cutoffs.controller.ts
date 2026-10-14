import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserWithProfile } from '../users/users.repository';
import { CutoffsService } from './cutoffs.service';

@ApiTags('cutoffs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cutoffs')
export class CutoffsController {
  constructor(private readonly service: CutoffsService) {}

  @Get('target')
  @ApiOperation({
    summary: 'Meta de nota do aluno pela nota de corte do Sisu',
    description:
      'Usa o curso desejado, a universidade-alvo e a modalidade do perfil. ' +
      'Devolve a média da nota de corte nas últimas três edições.',
  })
  target(@CurrentUser() user: UserWithProfile) {
    return this.service.targetForUser(user.id);
  }
}
