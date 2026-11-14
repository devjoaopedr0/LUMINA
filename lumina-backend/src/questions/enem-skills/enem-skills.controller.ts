import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserWithProfile } from '../../users/users.repository';
import { ENEM_AREAS, ENEM_MATRIX, ENEM_MATRIX_SOURCE } from './enem-matrix';
import { SkillMasteryService } from './skill-mastery.service';

@ApiTags('enem-skills')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EnemSkillsController {
  constructor(private readonly skillMastery: SkillMasteryService) {}

  @Get('enem-matrix')
  @ApiOperation({ summary: 'Matriz de Referência do ENEM (competências e habilidades H1–H30 por área, texto oficial do Inep).' })
  matrix() {
    return { source: ENEM_MATRIX_SOURCE, areas: ENEM_AREAS.map((area) => ENEM_MATRIX[area]) };
  }

  @Get('users/me/skill-mastery')
  @ApiOperation({ summary: 'Acerto do aluno por habilidade do ENEM (respostas avulsas e simulados). Percentual de acerto, nunca nota TRI.' })
  mine(@CurrentUser() user: UserWithProfile) {
    return this.skillMastery.forUser(user.id);
  }
}
