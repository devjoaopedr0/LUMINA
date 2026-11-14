import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserWithProfile } from '../users/users.repository';
import { TopicMasteryService } from './topic-mastery.service';

/**
 * Domínio do aluno por tópico (cronograma adaptativo, fase 1 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md). Atualizado automaticamente em
 * `POST /questions/:id/attempt` e em `POST /simulations/:id/submission`;
 * aqui só a leitura, para o painel "o que você já domina".
 */
@ApiTags('topic-mastery')
@Controller('users/me/topic-mastery')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TopicMasteryController {
  constructor(private readonly topicMasteryService: TopicMasteryService) {}

  @Get()
  @ApiOperation({ summary: 'Domínio do aluno por tópico, com status, streak e próxima revisão.' })
  list(@CurrentUser() user: UserWithProfile) {
    return this.topicMasteryService.listForUser(user.id);
  }

  @Get('evolution')
  @ApiOperation({ summary: 'Evolução do domínio nas últimas semanas: geral, por matéria e o que subiu ou caiu na semana.' })
  evolution(@CurrentUser() user: UserWithProfile, @Query('weeks') weeks?: string) {
    return this.topicMasteryService.evolutionForUser(user.id, Number(weeks) || 8);
  }
}
