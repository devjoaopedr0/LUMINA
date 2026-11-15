import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { GROUP_LIMITS, GroupRole } from './group-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t.length ? t : null;
};

export class CreateGroupDto {
  @ApiProperty({ example: 'ENEM 2027 — foco total' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ example: 'Medicina' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  purpose?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rules?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Pedidos de entrada precisam de aprovação.' })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ default: GROUP_LIMITS.defaultMaxMembers })
  @IsOptional()
  @IsInt()
  @Min(GROUP_LIMITS.minMaxMembers)
  @Max(GROUP_LIMITS.maxMaxMembers)
  maxMembers?: number;
}

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  purpose?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rules?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(GROUP_LIMITS.minMaxMembers)
  @Max(GROUP_LIMITS.maxMaxMembers)
  maxMembers?: number;
}

export class JoinGroupByCodeDto {
  @ApiProperty({ example: 'K7M2QX9P' })
  @Transform(trim)
  @IsString()
  @MinLength(4)
  @MaxLength(16)
  code!: string;
}

export class JoinGroupByLinkDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  token!: string;
}

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: ['ADMIN', 'MODERATOR', 'MEMBER'] })
  @IsIn(['ADMIN', 'MODERATOR', 'MEMBER'])
  role!: Exclude<GroupRole, 'OWNER'>;
}

export class TransferOwnershipDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}

export class UpdateSharingDto {
  @ApiPropertyOptional({ description: 'Tempo estudado hoje, na semana e no total.' })
  @IsOptional()
  @IsBoolean()
  shareStudyTime?: boolean;

  @ApiPropertyOptional({ description: 'Matérias estudadas nos últimos 7 dias.' })
  @IsOptional()
  @IsBoolean()
  shareSubjects?: boolean;

  @ApiPropertyOptional({ description: 'Sequência de dias com estudo.' })
  @IsOptional()
  @IsBoolean()
  shareStreak?: boolean;

  @ApiPropertyOptional({ description: 'Data da última atividade de estudo.' })
  @IsOptional()
  @IsBoolean()
  shareLastActivity?: boolean;
}
