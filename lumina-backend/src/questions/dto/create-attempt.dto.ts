import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateAttemptDto {
  @ApiProperty({
    description: 'Posição da alternativa escolhida (1 = A, 2 = B, 3 = C, ...).',
    example: 3,
  })
  @IsInt({ message: 'selectedPosition deve ser um número inteiro.' })
  @Min(1, { message: 'selectedPosition deve ser maior ou igual a 1.' })
  @Max(6, { message: 'selectedPosition deve ser menor ou igual a 6.' })
  selectedPosition: number;

  @ApiPropertyOptional({
    description: 'Tempo gasto na resposta, em segundos. Alimenta as análises de desempenho.',
    example: 42,
  })
  @IsOptional()
  @IsInt({ message: 'timeSpent deve ser um número inteiro (segundos).' })
  @Min(0, { message: 'timeSpent deve ser maior ou igual a 0.' })
  @Max(3600, { message: 'timeSpent deve ser menor ou igual a 3600.' })
  timeSpent?: number;
}
