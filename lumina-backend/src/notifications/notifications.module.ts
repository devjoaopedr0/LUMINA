import { Body, Controller, Get, Global, Module, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { NotificationsService } from './notifications.service';
import { NotificationBroadcastService } from './notification-broadcast.service';
import { NotificationSchedulerService } from './notification-scheduler.service';

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'Ids a marcar como lidas; vazio = todas.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids?: string[];
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class BroadcastDto {
  @ApiProperty({ enum: ['class', 'institution'] })
  @IsIn(['class', 'institution'])
  scope!: 'class' | 'institution';

  @ApiPropertyOptional({ description: 'Obrigatório quando scope = class.' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiProperty({ maxLength: 120, example: 'Simulado geral no sábado' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  body?: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly broadcasts: NotificationBroadcastService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Últimas notificações e quantas não foram lidas.' })
  list(@CurrentUser() user: UserWithProfile) {
    return this.service.list(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Quantas notificações não foram lidas (para o sino).' })
  async unread(@CurrentUser() user: UserWithProfile) {
    return { unread: await this.service.unreadCount(user.id) };
  }

  @Get('broadcast-targets')
  @ApiOperation({ summary: 'Turmas e instituição para as quais posso mandar aviso.' })
  targets(@CurrentUser() user: UserWithProfile) {
    return this.broadcasts.targets(user.id);
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Aviso do professor para a turma, ou da coordenação/direção para a instituição.' })
  broadcast(@CurrentUser() user: UserWithProfile, @Body() dto: BroadcastDto) {
    return this.broadcasts.send(user.id, dto);
  }

  @Post('read')
  @ApiOperation({ summary: 'Marca notificações como lidas (todas, se não vier lista).' })
  read(@CurrentUser() user: UserWithProfile, @Body() dto: MarkReadDto) {
    return this.service.markRead(user.id, dto.ids ?? []);
  }
}

/** Global: qualquer módulo injeta o NotificationsService para avisar alguém. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationBroadcastService, NotificationSchedulerService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
