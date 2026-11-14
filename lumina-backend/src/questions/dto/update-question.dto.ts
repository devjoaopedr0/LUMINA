import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, Matches, ValidateIf } from 'class-validator';
import { CreateQuestionDto } from './create-question.dto';

/**
 * Atualização parcial: todo campo é opcional. Quando `alternatives` vier,
 * as alternativas existentes são substituídas pelas novas (regra validada no
 * service: pelo menos 2 e exatamente uma correta).
 */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {
  @ApiPropertyOptional({ description: 'Se presente, substitui as alternativas da questão.' })
  alternatives?: CreateQuestionDto['alternatives'];

  @ApiPropertyOptional({
    description: 'Habilidade do ENEM (ex.: MT-H17) definida ou confirmada por quem gerencia a questão; null remove.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^(LC|CH|CN|MT)-H([1-9]|[12][0-9]|30)$/, { message: 'enemSkill deve ser como MT-H17.' })
  enemSkill?: string | null;
}
