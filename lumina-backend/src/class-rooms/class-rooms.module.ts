import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SchedulesModule } from '../schedules/schedules.module';
import { UserWithProfile } from '../users/users.repository';
import { ClassRoomEvents } from './class-room-events';
import { ClassRoomsGateway } from './class-rooms.gateway';
import { ClassRoomsService } from './class-rooms.service';

export class OpenClassRoomDto {
  @ApiPropertyOptional({ maxLength: 80, nullable: true, example: 'Aula de revisão: funções' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(80)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Atividade da turma (lista ou simulado) ligada à sessão.' })
  @IsOptional()
  @IsUUID()
  simulationId?: string | null;
}

export class SetActivityDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  simulationId?: string | null;
}

export class JoinClassRoomDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;
}

/** Sala de estudo da turma (Fase 3, item 47). */
@ApiTags('class-rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('class-rooms')
export class ClassRoomsController {
  constructor(private readonly rooms: ClassRoomsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Minha passagem ativa numa sala de turma, ou null.' })
  current(@CurrentUser() user: UserWithProfile) {
    return this.rooms.current(user.id);
  }

  @Get('class/:classId')
  @ApiOperation({ summary: 'Sala da turma: sessão aberta, participantes (detalhes só para o professor) e histórico.' })
  state(@CurrentUser() user: UserWithProfile, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.rooms.state(user.id, classId);
  }

  @Post('class/:classId/open')
  @ApiOperation({ summary: 'Professor abre a sala (avisa os alunos), opcionalmente com uma atividade.' })
  open(@CurrentUser() user: UserWithProfile, @Param('classId', ParseUUIDPipe) classId: string, @Body() dto: OpenClassRoomDto) {
    return this.rooms.open(user.id, classId, dto);
  }

  @Patch('sessions/:sessionId/activity')
  @ApiOperation({ summary: 'Professor troca a atividade ligada à sessão.' })
  activity(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: SetActivityDto) {
    return this.rooms.setActivity(user.id, sessionId, dto.simulationId ?? null);
  }

  @Post('sessions/:sessionId/close')
  @ApiOperation({ summary: 'Professor encerra a sala; o tempo de cada aluno vai para o histórico dele.' })
  close(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.close(user.id, sessionId);
  }

  @Post('sessions/:sessionId/join')
  @ApiOperation({ summary: 'Aluno entra na sala da turma.' })
  join(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: JoinClassRoomDto) {
    return this.rooms.join(user.id, sessionId, dto);
  }

  @Post('sessions/:sessionId/heartbeat')
  @ApiOperation({ summary: 'Sinal de vida (a cada 30 s).' })
  heartbeat(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.heartbeat(user.id, sessionId);
  }

  @Post('sessions/:sessionId/pause')
  pause(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.pause(user.id, sessionId);
  }

  @Post('sessions/:sessionId/resume')
  resume(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.resume(user.id, sessionId);
  }

  @Post('sessions/:sessionId/leave')
  @ApiOperation({ summary: 'Aluno sai; o tempo estudado vai para o histórico pessoal.' })
  leave(@CurrentUser() user: UserWithProfile, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.rooms.leave(user.id, sessionId);
  }
}

@Module({
  imports: [AuthModule, SchedulesModule],
  controllers: [ClassRoomsController],
  providers: [ClassRoomsService, ClassRoomEvents, ClassRoomsGateway],
})
export class ClassRoomsModule {}
