import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum QuestionImportTarget {
  PERSONAL = 'PERSONAL',
  BANK = 'BANK',
}

export class ImportQuestionOptionDto {
  @ApiProperty({ description: 'Texto da alternativa.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;

  @ApiPropertyOptional({
    description: 'Alternativa ao correctLetter/correctOptionIndex: marca a correta nesta opção.',
  })
  @IsOptional()
  @IsBoolean()
  correct?: boolean;

  @ApiPropertyOptional({
    description:
      'Por que esta alternativa está errada. Exibida ao aluno só depois que ele responde (nunca antes, para não revelar o gabarito).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;
}

export class ImportQuestionDto {
  @ApiProperty({ enum: QuestionSourceType })
  @IsEnum(QuestionSourceType)
  sourceType: QuestionSourceType;

  @ApiProperty({ description: 'Nome da fonte de origem (ex: dataset, parceiro, LuminIA).' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sourceName: string;

  @ApiPropertyOptional({ description: 'Identificador oficial da questão na fonte (deduplicação).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Prova de origem (ex: ENEM).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  exam?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Número da questão na prova.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  examNumber?: number;

  @ApiProperty({ description: 'Disciplina (ex: Matemática).' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  subject: string;

  @ApiPropertyOptional({ description: 'Assunto/tópico (ex: Funções exponenciais).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  topic?: string;

  @ApiProperty({ enum: QuestionDifficulty })
  @IsEnum(QuestionDifficulty)
  difficulty: QuestionDifficulty;

  @ApiProperty({ description: 'Enunciado da questão.' })
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  stem: string;

  @ApiProperty({ type: () => [ImportQuestionOptionDto], minItems: 2, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionOptionDto)
  options: ImportQuestionOptionDto[];

  @ApiPropertyOptional({ description: 'Letra da alternativa correta (A, B, C, D, E, F).' })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  correctLetter?: string;

  @ApiPropertyOptional({ description: 'Índice 0-based da alternativa correta.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  correctOptionIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  explanation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
}

export class ImportQuestionsDto {
  @ApiPropertyOptional({ enum: QuestionImportTarget, default: QuestionImportTarget.PERSONAL })
  @IsOptional()
  @IsEnum(QuestionImportTarget)
  target?: QuestionImportTarget;

  @ApiProperty({ type: () => [ImportQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionDto)
  questions: ImportQuestionDto[];
}

export class ImportJsonQuestionsDto {
  @ApiPropertyOptional({ enum: QuestionImportTarget, default: QuestionImportTarget.PERSONAL })
  @IsOptional()
  @IsEnum(QuestionImportTarget)
  target?: QuestionImportTarget;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  questions: Record<string, unknown>[];
}

export class ImportCsvQuestionsDto {
  @ApiPropertyOptional({ enum: QuestionImportTarget, default: QuestionImportTarget.PERSONAL })
  @IsOptional()
  @IsEnum(QuestionImportTarget)
  target?: QuestionImportTarget;

  @ApiProperty({ description: 'Conteúdo integral do arquivo CSV, com cabeçalho.' })
  @IsString()
  @MinLength(1)
  content: string;
}

export class ImportReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  imported: number;

  @ApiProperty()
  duplicates: number;

  @ApiProperty()
  invalid: number;

  @ApiProperty()
  errors: number;

  @ApiProperty({ type: () => [ImportIssueDto] })
  details: ImportIssueDto[];
}

export class ImportIssueDto {
  @ApiProperty()
  index: number;

  @ApiProperty({ nullable: true })
  sourceId: string | null;

  @ApiProperty({ enum: ['invalid', 'duplicate', 'error'] })
  type: 'invalid' | 'duplicate' | 'error';

  @ApiProperty()
  message: string;
}
