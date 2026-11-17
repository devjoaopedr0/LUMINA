import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class ReportPeriodQueryDto {
  @ApiPropertyOptional({ minimum: 7, maximum: 365, default: 30, description: 'Janela em dias até hoje.' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'true = mês civil anterior, em vez da janela em dias.' })
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  month?: boolean;
}

export class SubjectReportQueryDto extends ReportPeriodQueryDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120)
  subject!: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID()
  classId?: string;
}

export class CreateSnapshotDto {
  @ApiProperty({ enum: ['STUDENT', 'CLASS', 'SUBJECT', 'INSTITUTION'] })
  @IsIn(['STUDENT', 'CLASS', 'SUBJECT', 'INSTITUTION'])
  type!: 'STUDENT' | 'CLASS' | 'SUBJECT' | 'INSTITUTION';

  @ApiProperty({ description: 'Turma, aluno ("me" = o próprio), "all" (matéria em todas as turmas) ou a instituição.' })
  @IsString() @MaxLength(60)
  scopeId!: string;

  @ApiPropertyOptional() @ValidateIf((o: CreateSnapshotDto) => o.type === 'SUBJECT') @IsString() @MinLength(2) @MaxLength(120)
  subject?: string;

  @ApiPropertyOptional({ minimum: 7, maximum: 365 }) @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(365)
  days?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  month?: boolean;
}
