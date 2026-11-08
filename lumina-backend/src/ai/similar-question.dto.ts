import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GenerateSimilarQuestionDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Questão acessível ao usuário que servirá de referência. O enunciado e o gabarito são carregados no servidor.',
  })
  @IsUUID('4', { message: 'questionId deve ser um UUID válido.' })
  questionId!: string;
}
