import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { REPORT_REASONS } from './group-communication.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SendMessageDto {
  @ApiProperty({ maxLength: 1000, example: 'Alguém revisa genética comigo às 19h?' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

export class AnnouncementDto extends SendMessageDto {}

export class MuteMemberDto {
  @ApiProperty({ enum: [0, 1, 24, 168], description: 'Horas de silêncio no chat; 0 libera.' })
  @IsInt()
  @IsIn([0, 1, 24, 168])
  hours!: number;
}

export class CreateReportDto {
  @ApiProperty({ enum: ['MESSAGE', 'MEMBER', 'GROUP'] })
  @IsIn(['MESSAGE', 'MEMBER', 'GROUP'])
  targetType!: 'MESSAGE' | 'MEMBER' | 'GROUP';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  messageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: (typeof REPORT_REASONS)[number];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  details?: string;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['resolve', 'dismiss'], description: 'resolve = procede (mensagem fica oculta); dismiss = não procede.' })
  @IsIn(['resolve', 'dismiss'])
  action!: 'resolve' | 'dismiss';
}
