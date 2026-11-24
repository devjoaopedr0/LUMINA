import { Body, Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { NotificationsService } from './notifications.service';

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'Ids a marcar como lidas; vazio = todas.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids?: string[];
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

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

  @Post('read')
  @ApiOperation({ summary: 'Marca notificações como lidas (todas, se não vier lista).' })
  read(@CurrentUser() user: UserWithProfile, @Body() dto: MarkReadDto) {
    return this.service.markRead(user.id, dto.ids ?? []);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
