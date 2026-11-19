import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import {
  ChangeMemberRoleDto,
  CreateGroupDto,
  JoinGroupByCodeDto,
  JoinGroupByLinkDto,
  TransferOwnershipDto,
  UpdateGroupDto,
  UpdateSharingDto,
} from './groups.dto';
import { GroupsService } from './groups.service';
import { AuthModule } from '../auth/auth.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { GroupRoomEvents } from './group-room-events';
import { GroupRoomsGateway } from './group-rooms.gateway';
import { GroupRoomsService } from './group-rooms.service';
import { JoinRoomDto, OpenRoomDto, UpdateParticipationDto } from './group-rooms.dto';
import { GroupEngagementService } from './group-engagement.service';
import { CreateGoalDto } from './group-engagement.dto';
import { NotificationsModule } from '../notifications/notifications.module';
import { GroupCommunicationService } from './group-communication.service';
import { AnnouncementDto, CreateReportDto, MuteMemberDto, ResolveReportDto, SendMessageDto } from './group-communication.dto';

/** Lumina Groups (Fase 2, MVP): docs/LUMINA_GROUPS.md. */
@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Grupos do aluno e pedidos de entrada pendentes.' })
  list(@CurrentUser() user: UserWithProfile) {
    return this.service.listMine(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um grupo; quem cria é o dono.' })
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateGroupDto) {
    return this.service.create(user.id, dto);
  }

  @Get('preview')
  @ApiOperation({ summary: 'Prévia do grupo pelo código ou pelo link, antes de entrar.' })
  preview(@Query('code') code?: string, @Query('token') token?: string) {
    return this.service.preview({ code, token });
  }

  @Post('join')
  @ApiOperation({ summary: 'Entra num grupo pelo código.' })
  joinByCode(@CurrentUser() user: UserWithProfile, @Body() dto: JoinGroupByCodeDto) {
    return this.service.join(user.id, { code: dto.code });
  }

  @Post('join-link')
  @ApiOperation({ summary: 'Entra num grupo pelo link de convite.' })
  joinByLink(@CurrentUser() user: UserWithProfile, @Body() dto: JoinGroupByLinkDto) {
    return this.service.join(user.id, { token: dto.token });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do grupo, com o perfil de estudo dos membros conforme a privacidade de cada um.' })
  detail(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita o grupo (dono e administradores).' })
  update(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return this.service.update(user.id, id, dto);
  }

  @Post(':id/code')
  @ApiOperation({ summary: 'Troca o código de entrada; links antigos deixam de valer.' })
  regenerateCode(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.regenerateCode(user.id, id);
  }

  @Post(':id/invite-link')
  @ApiOperation({ summary: 'Gera um link de convite válido por 7 dias.' })
  inviteLink(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.inviteLink(user.id, id);
  }

  @Patch(':id/me/sharing')
  @ApiOperation({ summary: 'O que o aluno compartilha com este grupo.' })
  sharing(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSharingDto) {
    return this.service.updateSharing(user.id, id, dto);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Sai do grupo ou cancela o pedido de entrada.' })
  leave(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.leave(user.id, id);
  }

  @Post(':id/members/:userId/approve')
  @ApiOperation({ summary: 'Aprova um pedido de entrada.' })
  approve(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) target: string) {
    return this.service.approve(user.id, id, target);
  }

  @Post(':id/members/:userId/reject')
  @ApiOperation({ summary: 'Recusa um pedido de entrada.' })
  reject(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) target: string) {
    return this.service.reject(user.id, id, target);
  }

  @Patch(':id/members/:userId/role')
  @ApiOperation({ summary: 'Promove ou rebaixa um membro.' })
  changeRole(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) target: string,
    @Body() dto: ChangeMemberRoleDto,
  ) {
    return this.service.changeRole(user.id, id, target, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove um membro (só quem está acima dele).' })
  removeMember(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) target: string) {
    return this.service.removeMember(user.id, id, target);
  }

  @Post(':id/transfer')
  @ApiOperation({ summary: 'Transfere a posse do grupo a outro membro.' })
  transfer(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferOwnershipDto) {
    return this.service.transferOwnership(user.id, id, dto.userId);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Arquiva o grupo (só o dono).' })
  archive(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.setArchived(user.id, id, true);
  }

  @Post(':id/unarchive')
  @ApiOperation({ summary: 'Reativa um grupo arquivado (só o dono).' })
  unarchive(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.setArchived(user.id, id, false);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui o grupo de vez (só o dono, depois de arquivar).' })
  remove(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.id, id);
  }
}

/** Salas coletivas (etapa 2): docs/LUMINA_GROUPS.md §2.3–§2.4. As ações
 * devolvem o estado das salas do grupo, para o app não precisar de outra ida. */
@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupRoomsController {
  constructor(private readonly rooms: GroupRoomsService) {}

  @Get('rooms/me')
  @ApiOperation({ summary: 'Minha passagem ativa numa sala (em qualquer grupo), ou null.' })
  current(@CurrentUser() user: UserWithProfile) {
    return this.rooms.current(user.id);
  }

  @Get(':id/rooms')
  @ApiOperation({ summary: 'Salas abertas do grupo, histórico, minha passagem e matérias.' })
  state(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.state(user.id, id);
  }

  @Post(':id/rooms')
  @ApiOperation({ summary: 'Abre uma sala no grupo e entra nela.' })
  open(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OpenRoomDto) {
    return this.rooms.open(user.id, id, dto);
  }

  @Post('rooms/:sessionId/join')
  @ApiOperation({ summary: 'Entra numa sala aberta, com a própria matéria.' })
  join(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: JoinRoomDto) {
    return this.rooms.join(user.id, sessionId, dto);
  }

  @Post('rooms/:sessionId/heartbeat')
  @ApiOperation({ summary: 'Sinal de vida (a cada 30 s). Sem sinal por 90 s, a passagem fecha no último sinal.' })
  heartbeat(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.heartbeat(user.id, sessionId);
  }

  @Post('rooms/:sessionId/pause')
  @ApiOperation({ summary: 'Pausa o meu cronômetro na sala.' })
  pause(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.pause(user.id, sessionId);
  }

  @Post('rooms/:sessionId/resume')
  @ApiOperation({ summary: 'Retoma o meu cronômetro na sala.' })
  resume(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.resume(user.id, sessionId);
  }

  @Patch('rooms/:sessionId/me')
  @ApiOperation({ summary: 'Troca a matéria (fecha o trecho na matéria antiga) ou o que mostro à sala.' })
  update(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: UpdateParticipationDto) {
    return this.rooms.update(user.id, sessionId, dto);
  }

  @Post('rooms/:sessionId/leave')
  @ApiOperation({ summary: 'Sai da sala; o tempo estudado vira registro no histórico pessoal.' })
  leave(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.leave(user.id, sessionId);
  }
}

/** Engajamento (etapa 3): placar opcional, metas coletivas e conquistas. */
@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupEngagementController {
  constructor(private readonly engagement: GroupEngagementService) {}

  @Get(':id/engagement')
  @ApiOperation({ summary: 'Placar (só quem participa), metas coletivas e minhas conquistas no grupo.' })
  overview(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('metric') metric?: string,
    @Query('period') period?: string,
  ) {
    const m = metric === 'hours' || metric === 'streak' ? metric : 'consistency';
    const p = period === '30' ? 30 : 7;
    return this.engagement.overview(user.id, id, { metric: m, period: p });
  }

  @Post(':id/goals')
  @ApiOperation({ summary: 'Cria uma meta coletiva (moderador ou acima).' })
  createGoal(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGoalDto) {
    return this.engagement.createGoal(user.id, id, dto);
  }

  @Delete(':id/goals/:goalId')
  @ApiOperation({ summary: 'Cancela uma meta coletiva (moderador ou acima).' })
  cancelGoal(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('goalId', ParseUUIDPipe) goalId: string) {
    return this.engagement.cancelGoal(user.id, id, goalId);
  }
}

/** Comunicação (etapa 4): chat com moderação, avisos e denúncias. */
@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupCommunicationController {
  constructor(private readonly comms: GroupCommunicationService) {}

  @Get('reports/admin')
  @ApiOperation({ summary: 'Denúncias de grupos e contra donos (só a administração da Lumina).' })
  adminReports(@CurrentUser() user: UserWithProfile) {
    return this.comms.adminReports(user.accountType);
  }

  @Post('reports/admin/:reportId/resolve')
  @ApiOperation({ summary: 'Trata uma denúncia de grupo ou contra dono (administração da Lumina).' })
  adminResolve(@CurrentUser() user: UserWithProfile, @Param('reportId', ParseUUIDPipe) reportId: string, @Body() dto: ResolveReportDto) {
    return this.comms.adminResolve(user.accountType, user.id, reportId, dto);
  }

  @Get(':id/chat')
  @ApiOperation({ summary: 'Mensagens (50 por página, `before` para as anteriores), avisos e meu estado no chat.' })
  chat(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Query('before') before?: string) {
    const at = before ? new Date(before) : undefined;
    return this.comms.chat(user.id, id, { before: at && !Number.isNaN(at.getTime()) ? at : undefined });
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Envia uma mensagem (filtro de palavras, sem telefone/e-mail, limite de envio).' })
  send(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.comms.send(user.id, id, dto.body);
  }

  @Delete(':id/chat/:messageId')
  @ApiOperation({ summary: 'Apaga a própria mensagem ou oculta a de quem está abaixo (moderação).' })
  hide(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.comms.hide(user.id, id, messageId);
  }

  @Post(':id/members/:userId/mute')
  @ApiOperation({ summary: 'Silencia um membro no chat por 1 h, 24 h ou 7 dias (0 libera).' })
  mute(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) target: string, @Body() dto: MuteMemberDto) {
    return this.comms.mute(user.id, id, target, dto.hours);
  }

  @Post(':id/announcements')
  @ApiOperation({ summary: 'Publica um aviso fixado e notifica os membros (moderação).' })
  announce(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnouncementDto) {
    return this.comms.announce(user.id, id, dto.body);
  }

  @Delete(':id/announcements/:announcementId')
  @ApiOperation({ summary: 'Remove um aviso (moderação).' })
  removeAnnouncement(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('announcementId', ParseUUIDPipe) announcementId: string) {
    return this.comms.removeAnnouncement(user.id, id, announcementId);
  }

  @Post(':id/reports')
  @ApiOperation({ summary: 'Denuncia uma mensagem, um membro ou o grupo.' })
  report(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateReportDto) {
    return this.comms.report(user.id, id, dto);
  }

  @Get(':id/reports')
  @ApiOperation({ summary: 'Denúncias abertas que eu posso tratar (moderação; denunciante anônimo).' })
  reports(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.comms.reports(user.id, id);
  }

  @Post(':id/reports/:reportId/resolve')
  @ApiOperation({ summary: 'Procede (mensagem fica oculta) ou não procede (volta se sumiu só pelas denúncias).' })
  resolve(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('reportId', ParseUUIDPipe) reportId: string, @Body() dto: ResolveReportDto) {
    return this.comms.resolveReport(user.id, id, reportId, dto);
  }
}

@Module({
  imports: [AuthModule, SchedulesModule, NotificationsModule],
  // As rotas fixas das salas (`rooms/me`) vêm antes das do grupo (`:id`).
  controllers: [GroupRoomsController, GroupEngagementController, GroupCommunicationController, GroupsController],
  providers: [GroupsService, GroupRoomsService, GroupRoomEvents, GroupRoomsGateway, GroupEngagementService, GroupCommunicationService],
})
export class GroupsModule {}
