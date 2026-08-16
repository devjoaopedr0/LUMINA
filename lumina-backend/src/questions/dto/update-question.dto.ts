import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateQuestionDto } from './create-question.dto';

/**
 * Atualização parcial: todo campo é opcional. Quando `alternatives` vier,
 * as alternativas existentes são substituídas pelas novas (regra validada no
 * service: pelo menos 2 e exatamente uma correta).
 */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {
  @ApiPropertyOptional({ description: 'Se presente, substitui as alternativas da questão.' })
  alternatives?: CreateQuestionDto['alternatives'];
}
