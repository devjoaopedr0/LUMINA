import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Estado da marcação "revisar" de uma questão pelo aluno. */
export class QuestionReviewStateDto {
  @ApiProperty({ description: 'true quando a questão está marcada para revisar.' })
  markedForReview: boolean;
}

/** Níveis de dica: 1 = onde revisar, 2 = o que conferir no enunciado,
 * 3 = como eliminar as alternativas. A dica NUNCA revela o gabarito — nem
 * mesmo no nível máximo. */
export const MIN_HINT_LEVEL = 1;
export const MAX_HINT_LEVEL = 3;

export class QuestionHintQueryDto {
  @ApiProperty({
    minimum: MIN_HINT_LEVEL,
    maximum: MAX_HINT_LEVEL,
    default: MIN_HINT_LEVEL,
    required: false,
    description: 'Quão detalhada a dica deve ser (1 = mais leve, 3 = quase resolutiva).',
  })
  @Type(() => Number)
  @IsInt({ message: 'level deve ser um número inteiro.' })
  @Min(MIN_HINT_LEVEL, { message: `level deve ser no mínimo ${MIN_HINT_LEVEL}.` })
  @Max(MAX_HINT_LEVEL, { message: `level deve ser no máximo ${MAX_HINT_LEVEL}.` })
  level?: number;
}

export class QuestionHintDto {
  @ApiProperty({ description: 'Nível da dica entregue (1-3).' })
  level: number;

  @ApiProperty({ description: 'A dica em si. Nunca contém a alternativa correta.' })
  hint: string;

  @ApiProperty({
    description:
      'Quem gerou a dica: "rules" = guia de estudo determinística, sem chamada externa; "llm" = modelo de linguagem.',
  })
  provider: string;

  @ApiProperty({
    description: 'Nível máximo disponível; depois disso a dica para de escalar.',
  })
  maxLevel: number;
}
