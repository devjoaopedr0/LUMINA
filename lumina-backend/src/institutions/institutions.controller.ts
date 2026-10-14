import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserWithProfile } from '../users/users.repository';
import { CreateInstitutionDto } from './institutions.dto';
import { InstitutionsService } from './institutions.service';

@ApiTags('institutions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly service: InstitutionsService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra uma instituição e vincula quem criou como Diretor.' })
  createInstitution(@CurrentUser() user: UserWithProfile, @Body() dto: CreateInstitutionDto) {
    return this.service.createInstitution(user.id, dto);
  }

  @Get('invites/pending')
  @ApiOperation({ summary: 'Consulta (sem aceitar) o convite institucional pendente da conta autenticada.' })
  pendingInvite(@CurrentUser() user: UserWithProfile) {
    return this.service.pendingInvite(user.id);
  }

  @Post('invites/accept')
  @ApiOperation({ summary: 'Aceita o convite institucional pendente da conta autenticada.' })
  acceptInvite(@CurrentUser() user: UserWithProfile) {
    return this.service.acceptInvite(user.id);
  }
}
