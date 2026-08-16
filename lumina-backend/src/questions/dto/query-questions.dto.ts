import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Filtros de ordenação aceitos em GET /questions. */
export const QUESTION_SORTS = ['newest', 'oldest', 'year_desc', 'year_asc'] as const;
export type QuestionSort = (typeof QUESTION_SORTS)[number];

/** Query de listagem: filtros combináveis (AND) + ordenação + paginação.
 * Filtros de texto (subject, topic, exam) fazem busca parcial sem diferenciar
 * maiúsculas, estilo QConcursos. */
export class QueryQuestionsDto {
  @ApiPropertyOptional({ description: 'Filtra por matéria (busca parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @ApiPropertyOptional({ description: 'Filtra por conteúdo/tópico (busca parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  topic?: string;

  @ApiPropertyOptional({ description: 'Filtra por disciplina cadastrada (UUID de /subjects).' })
  @IsOptional()
  @IsUUID('4', { message: 'subjectId deve ser um UUID válido.' })
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Filtra por assunto cadastrado (UUID de /subjects/:id/topics).' })
  @IsOptional()
  @IsUUID('4', { message: 'topicId deve ser um UUID válido.' })
  topicId?: string;

  @ApiPropertyOptional({ enum: QuestionDifficulty, description: 'Filtra por dificuldade.' })
  @IsOptional()
  @IsEnum(QuestionDifficulty, { message: 'difficulty deve ser FACIL, MEDIA ou DIFICIL.' })
  difficulty?: QuestionDifficulty;

  @ApiPropertyOptional({ description: 'Filtra por exame/vestibular (busca parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  exam?: string;

  @ApiPropertyOptional({ description: 'Filtra por prova cadastrada (UUID de /exams).' })
  @IsOptional()
  @IsUUID('4', { message: 'examId deve ser um UUID válido.' })
  examId?: string;

  @ApiPropertyOptional({ description: 'Filtra por ano da prova.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ enum: QuestionSourceType, description: 'Filtra pela origem da questão.' })
  @IsOptional()
  @IsEnum(QuestionSourceType, {
    message: 'sourceType deve ser OFFICIAL, PARTNER, GENERATED ou IMPORTED.',
  })
  sourceType?: QuestionSourceType;

  @ApiPropertyOptional({
    enum: QUESTION_SORTS,
    default: 'newest',
    description: 'Ordenação: newest/oldest por criação, year_desc/year_asc por ano da prova.',
  })
  @IsOptional()
  @IsEnum(QUESTION_SORTS, { message: 'sort inválido.' })
  sort?: QuestionSort;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
