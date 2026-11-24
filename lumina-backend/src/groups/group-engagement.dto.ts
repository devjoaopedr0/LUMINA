import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ENGAGEMENT_RULES } from './engagement-rules';

/** Meta coletiva. `target` está na unidade da métrica: minutos ou dias. */
export class CreateGoalDto {
  @ApiProperty({ maxLength: 80, example: 'Desafio da semana: 20 h juntos' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title!: string;

  @ApiProperty({ enum: ['GROUP_MINUTES', 'GROUP_STUDY_DAYS'] })
  @IsIn(['GROUP_MINUTES', 'GROUP_STUDY_DAYS'])
  metric!: 'GROUP_MINUTES' | 'GROUP_STUDY_DAYS';

  @ApiProperty({ description: 'Minutos (GROUP_MINUTES) ou dias com estudo somados (GROUP_STUDY_DAYS).', example: 1200 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  target!: number;

  @ApiProperty({ minimum: ENGAGEMENT_RULES.goalMinDays, maximum: ENGAGEMENT_RULES.goalMaxDays, example: 7 })
  @IsInt()
  @Min(ENGAGEMENT_RULES.goalMinDays)
  @Max(ENGAGEMENT_RULES.goalMaxDays)
  days!: number;

  @ApiPropertyOptional({ description: 'Primeiro dia (AAAA-MM-DD, Brasília). Padrão: hoje.', example: '2026-11-18' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;
}
