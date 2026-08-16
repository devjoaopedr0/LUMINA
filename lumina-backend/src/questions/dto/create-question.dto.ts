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

export class AlternativeDto {
  @ApiProperty({ example: 'O conjunto dos números reais.', description: 'Texto da alternativa.' })
  @IsString({ message: 'Cada alternativa precisa de um texto.' })
  @MinLength(1, { message: 'A alternativa não pode ser vazia.' })
  @MaxLength(1000, { message: 'A alternativa deve ter no máximo 1000 caracteres.' })
  text: string;

  @ApiProperty({
    description: 'Marca se esta é a alternativa correta. Deve haver exatamente uma por questão.',
  })
  @IsBoolean({ message: 'is_correct deve ser true ou false.' })
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @ApiPropertyOptional({
    description:
      'Workspace de destino. Padrão: o workspace pessoal do usuário. Para publicar no banco central é preciso informar o ID dele e ter permissão de gerenciamento.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'workspaceId deve ser um UUID válido.' })
  workspaceId?: string;

  @ApiPropertyOptional({
    example: 'Matemática',
    description: 'Matéria da questão. Pode ser informada como texto livre ou via subjectId.',
  })
  @IsOptional()
  @IsString({ message: 'subject deve ser um texto.' })
  @MinLength(2, { message: 'subject deve ter pelo menos 2 caracteres.' })
  @MaxLength(120, { message: 'subject deve ter no máximo 120 caracteres.' })
  subject?: string;

  @ApiPropertyOptional({ example: 'Funções exponenciais', description: 'Conteúdo/tópico dentro da matéria.' })
  @IsOptional()
  @IsString({ message: 'topic deve ser um texto.' })
  @MinLength(2, { message: 'topic deve ter pelo menos 2 caracteres.' })
  @MaxLength(120, { message: 'topic deve ter no máximo 120 caracteres.' })
  topic?: string;

  @ApiPropertyOptional({
    description: 'ID de uma disciplina já cadastrada (GET /subjects). Opcional se subject for informado.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'subjectId deve ser um UUID válido.' })
  subjectId?: string;

  @ApiPropertyOptional({
    description: 'ID de um assunto já cadastrado (GET /subjects/:id/topics). Deve pertencer a subjectId quando ambos forem informados.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'topicId deve ser um UUID válido.' })
  topicId?: string;

  @ApiProperty({ enum: QuestionDifficulty, example: QuestionDifficulty.MEDIA })
  @IsEnum(QuestionDifficulty, {
    message: 'difficulty deve ser FACIL, MEDIA ou DIFICIL.',
  })
  difficulty: QuestionDifficulty;

  @ApiPropertyOptional({ example: 'ENEM', description: 'Vestibular/instituição de origem (ex: ENEM, UECE, FUVEST).' })
  @IsOptional()
  @IsString({ message: 'exam deve ser um texto.' })
  @MinLength(1, { message: 'exam não pode ser vazio.' })
  @MaxLength(60, { message: 'exam deve ter no máximo 60 caracteres.' })
  exam?: string;

  @ApiPropertyOptional({ description: 'ID de uma prova já cadastrada (GET /exams).' })
  @IsOptional()
  @IsUUID('4', { message: 'examId deve ser um UUID válido.' })
  examId?: string;

  @ApiPropertyOptional({ example: 2023, required: false, nullable: true })
  @IsOptional()
  @IsInt({ message: 'year deve ser um número inteiro.' })
  @Min(1970, { message: 'year deve ser um ano a partir de 1970.' })
  @Max(2100, { message: 'year deve ser um ano válido.' })
  year?: number | null;

  @ApiPropertyOptional({ example: 47, required: false, nullable: true, description: 'Número da questão na prova.' })
  @IsOptional()
  @IsInt({ message: 'examNumber deve ser um número inteiro.' })
  @Min(1, { message: 'examNumber deve ser maior ou igual a 1.' })
  @Max(9999, { message: 'examNumber deve ser menor ou igual a 9999.' })
  examNumber?: number | null;

  @ApiProperty({
    example: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
    description: 'Enunciado da questão.',
  })
  @IsString({ message: 'stem deve ser um texto.' })
  @MinLength(5, { message: 'stem deve ter pelo menos 5 caracteres.' })
  @MaxLength(4000, { message: 'stem deve ter no máximo 4000 caracteres.' })
  stem: string;

  @ApiPropertyOptional({ description: 'Gabarito comentado / explicação da resposta.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'explanation deve ter no máximo 4000 caracteres.' })
  explanation?: string;

  @ApiPropertyOptional({ description: 'URL de imagem de apoio (figuras, gráficos).' })
  @IsOptional()
  @IsString()
  @MaxLength(2048, { message: 'imageUrl deve ter no máximo 2048 caracteres.' })
  imageUrl?: string;

  @ApiPropertyOptional({
    enum: QuestionSourceType,
    default: QuestionSourceType.OFFICIAL,
    description: 'Origem da questão. Manual/autoral = OFFICIAL (default).',
  })
  @IsOptional()
  @IsEnum(QuestionSourceType, {
    message: 'sourceType deve ser OFFICIAL, PARTNER, GENERATED ou IMPORTED.',
  })
  sourceType?: QuestionSourceType;

  @ApiPropertyOptional({ default: 'Lumina', description: 'Nome da fonte/instituição de origem.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sourceName?: string;

  @ApiPropertyOptional({ type: () => [AlternativeDto], minItems: 2, maxItems: 6 })
  @IsArray({ message: 'alternatives deve ser uma lista.' })
  @ArrayMinSize(2, { message: 'Uma questão precisa de pelo menos 2 alternativas.' })
  @ArrayMaxSize(6, { message: 'Uma questão pode ter no máximo 6 alternativas.' })
  @ValidateNested({ each: true })
  @Type(() => AlternativeDto)
  alternatives: AlternativeDto[];
}
