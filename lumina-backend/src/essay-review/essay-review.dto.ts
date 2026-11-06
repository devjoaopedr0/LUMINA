import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EssayLearningLevel, EssayReviewDecision } from '@prisma/client';

/** Níveis de nota válidos na correção do Enem (0 a 200, de 40 em 40). */
export const ESSAY_SCORE_LEVELS = [0, 40, 80, 120, 160, 200] as const;
export const ESSAY_COMPETENCIES = ['C1', 'C2', 'C3', 'C4', 'C5'] as const;

export class EssayReviewCompetencyDto {
  @ApiProperty({ enum: ESSAY_COMPETENCIES })
  @IsIn(ESSAY_COMPETENCIES)
  competency: (typeof ESSAY_COMPETENCIES)[number];

  @ApiProperty({ enum: ESSAY_SCORE_LEVELS, description: 'Nota proposta pelo avaliador na competência.' })
  @IsInt()
  @IsIn(ESSAY_SCORE_LEVELS)
  score: number;

  @ApiPropertyOptional({ enum: EssayReviewDecision })
  @IsOptional()
  @IsEnum(EssayReviewDecision)
  decision?: EssayReviewDecision;

  @ApiPropertyOptional({ description: 'Critério discutido, ex.: desenvolvimento argumentativo.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  criterion?: string;

  @ApiPropertyOptional({ description: 'Justificativa técnica do avaliador.' })
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  justification?: string;

  @ApiPropertyOptional({ type: [String], description: 'Trechos literais da redação usados como evidência.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  evidence?: string[];

  @ApiPropertyOptional({ description: 'Trecho selecionado na interface para ancorar a discussão.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  anchorText?: string;
}

export class SubmitEssayReviewDto {
  @ApiPropertyOptional({ enum: EssayReviewDecision, description: 'Se omitido, o servidor calcula pelo confronto das notas.' })
  @IsOptional()
  @IsEnum(EssayReviewDecision)
  decision?: EssayReviewDecision;

  @ApiProperty({ type: [EssayReviewCompetencyDto], description: 'As cinco competências, sem repetição.' })
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => EssayReviewCompetencyDto)
  competencies: EssayReviewCompetencyDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  generalFeedback?: string;
}

export class EssayReviewChatDto {
  @ApiProperty({ description: 'Pergunta do avaliador sobre a correção, uma competência ou um trecho.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @ApiPropertyOptional({ enum: ESSAY_COMPETENCIES })
  @IsOptional()
  @IsIn(ESSAY_COMPETENCIES)
  competency?: (typeof ESSAY_COMPETENCIES)[number];

  @ApiPropertyOptional({ description: 'Trecho da redação selecionado pelo avaliador.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  anchorText?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reviewId?: string;
}

export class ValidateEssayReviewDto {
  @ApiProperty({ enum: [EssayLearningLevel.VALIDATED, EssayLearningLevel.CONSOLIDATED] })
  @IsEnum(EssayLearningLevel)
  level: EssayLearningLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Confirma que há consentimento e que os trechos foram anonimizados. Obrigatório para consolidar.',
  })
  @IsOptional()
  @IsBoolean()
  consentConfirmed?: boolean;
}

export class CreateEssayLearningDto {
  @ApiProperty({ enum: ESSAY_COMPETENCIES })
  @IsIn(ESSAY_COMPETENCIES)
  competency: (typeof ESSAY_COMPETENCIES)[number];

  @ApiProperty({ description: 'Lição destilada pelo avaliador, em linguagem técnica.' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  learning: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  criterion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  evidence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  justification?: string;

  @ApiPropertyOptional({ description: 'Em que outros casos o aprendizado se aplica.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  applicability?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class EssayReviewQueueQueryDto {
  @ApiPropertyOptional({ enum: ['SUBMITTED', 'DISPUTED', 'ACCEPTED', 'SUPERSEDED'] })
  @IsOptional()
  @IsIn(['SUBMITTED', 'DISPUTED', 'ACCEPTED', 'SUPERSEDED'])
  status?: 'SUBMITTED' | 'DISPUTED' | 'ACCEPTED' | 'SUPERSEDED';
}
