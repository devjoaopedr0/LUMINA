import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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

export class UpdatePedagogicalAlertDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'] })
  @IsIn(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'])
  status!: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

  @ApiPropertyOptional({ description: 'Anotação do professor (o que foi feito).' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
