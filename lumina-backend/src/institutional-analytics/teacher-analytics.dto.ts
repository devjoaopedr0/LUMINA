import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class TeacherAnalyticsQueryDto {
  @ApiPropertyOptional({
    minimum: 7,
    maximum: 180,
    default: 30,
    description: 'Janela de análise em dias.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(180)
  days?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Recorta o painel para uma turma do professor.' })
  @IsOptional()
  @IsUUID('4')
  classId?: string;
}
