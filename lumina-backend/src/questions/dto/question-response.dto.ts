import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';

/**
 * Formato público de uma questão. As alternativas vêm SEM marcar a correta
 * (isCorrect nunca é exposto aqui) — quem responde só descobre a correta ao
 * enviar uma tentativa (POST /questions/:id/attempt). Quem edita (autor) usa
 * ?includeAnswer=true, que inclui isCorrect nas alternativas.
 */
export class QuestionAlternativeDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  text: string;

  @ApiProperty({ description: 'Posição da alternativa (1 = A, 2 = B, ...).' })
  position: number;

  @ApiPropertyOptional({
    description: 'Apenas na visão de autor (?includeAnswer=true): marca a alternativa correta.',
  })
  isCorrect?: boolean;
}

export class QuestionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: QuestionSourceType })
  sourceType: QuestionSourceType;

  @ApiProperty()
  sourceName: string;

  @ApiPropertyOptional({ description: 'Identificador oficial da questão na fonte.' })
  sourceId?: string | null;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  topic: string;

  @ApiPropertyOptional({ description: 'UUID da disciplina (quando classificada).' })
  subjectId?: string | null;

  @ApiPropertyOptional({ description: 'UUID do assunto (quando classificado).' })
  topicId?: string | null;

  @ApiPropertyOptional({ description: 'UUID da prova (quando associada).' })
  examId?: string | null;

  @ApiProperty({ enum: QuestionDifficulty })
  difficulty: QuestionDifficulty;

  @ApiProperty()
  exam: string;

  @ApiProperty({ nullable: true })
  year: number | null;

  @ApiProperty({ nullable: true })
  examNumber: number | null;

  @ApiProperty()
  stem: string;

  @ApiPropertyOptional({ description: 'Gabarito comentado / explicação.' })
  explanation?: string | null;

  @ApiPropertyOptional({ description: 'URL de imagem de apoio.' })
  imageUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'true se o usuário autenticado pode editar/excluir esta questão (dono do workspace pessoal ou admin do banco).',
  })
  canManage?: boolean;

  @ApiProperty({ type: () => [QuestionAlternativeDto] })
  alternatives: QuestionAlternativeDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedQuestionsDto {
  @ApiProperty({ type: () => [QuestionResponseDto] })
  items: QuestionResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  limit: number;

  @ApiPropertyOptional({
    description:
      'true se o usuário autenticado pode gerenciar o banco de questões central (ex: admin interno).',
  })
  canManageBank?: boolean;
}

export class AttemptResultDto {
  @ApiProperty({ description: 'true se a alternativa escolhida é a correta.' })
  isCorrect: boolean;

  @ApiProperty({ description: 'Posição da alternativa escolhida.' })
  selectedPosition: number;

  @ApiProperty({ description: 'Posição da alternativa correta.' })
  correctPosition: number;
}
