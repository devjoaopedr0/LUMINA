import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FlashcardRating, FlashcardSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const FLASHCARD_RATINGS = [
  FlashcardRating.AGAIN,
  FlashcardRating.HARD,
  FlashcardRating.GOOD,
  FlashcardRating.EASY,
] as const;

export const FLASHCARD_SOURCES = [
  FlashcardSource.MANUAL,
  FlashcardSource.ERROR_NOTEBOOK,
  FlashcardSource.AI,
] as const;

export class CreateFlashcardDto {
  @ApiProperty({ maxLength: 2000, description: 'Pergunta ou conceito da frente do cartão.' })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000)
  front: string;

  @ApiProperty({ maxLength: 10000, description: 'Resposta ou explicação do verso do cartão.' })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(10000)
  back: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  subjectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  topicId?: string | null;
}

export class UpdateFlashcardDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000)
  front?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(10000)
  back?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  subjectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  topicId?: string | null;
}

export class CreateFlashcardFromErrorDto {
  @ApiPropertyOptional({ maxLength: 2000, description: 'Frente personalizada; sem ela, usa o enunciado.' })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000)
  front?: string;

  @ApiPropertyOptional({
    maxLength: 10000,
    description: 'Verso personalizado; sem ele, usa o gabarito e a explicação da questão.',
  })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(10000)
  back?: string;
}

export class ReviewFlashcardDto {
  @ApiProperty({ enum: FLASHCARD_RATINGS })
  @IsIn(FLASHCARD_RATINGS)
  rating: FlashcardRating;
}

export class GenerateFlashcardsDto {
  @ApiProperty({
    maxLength: 20000,
    description: 'Conteúdo de estudo a partir do qual os cartões serão gerados.',
  })
  @Transform(trim) @IsString() @MinLength(20) @MaxLength(20000)
  content: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 6 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  count?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  subjectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  topicId?: string | null;
}

export class GenerateFlashcardsFromPdfDto {
  @ApiProperty({
    description:
      'PDF em data URL (application/pdf;base64). O arquivo é lido em memória e não é armazenado.',
  })
  @IsString() @MaxLength(12_000_000)
  pdf: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 6 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  count?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  subjectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID('4')
  topicId?: string | null;
}

export class FlashcardResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FLASHCARD_SOURCES }) source: FlashcardSource;
  @ApiProperty() front: string;
  @ApiProperty() back: string;
  @ApiPropertyOptional({ nullable: true }) subjectId: string | null;
  @ApiPropertyOptional({ nullable: true }) subject: string | null;
  @ApiPropertyOptional({ nullable: true }) topicId: string | null;
  @ApiPropertyOptional({ nullable: true }) topic: string | null;
  @ApiPropertyOptional({ nullable: true }) sourceQuestionId: string | null;
  @ApiProperty() reviewCount: number;
  @ApiProperty() correctCount: number;
  @ApiPropertyOptional({ nullable: true }) accuracy: number | null;
  @ApiProperty() streak: number;
  @ApiProperty() intervalDays: number;
  @ApiProperty() easeFactor: number;
  @ApiPropertyOptional({ nullable: true }) nextReviewAt: string | null;
  @ApiPropertyOptional({ nullable: true }) lastReviewedAt: string | null;
  @ApiProperty() due: boolean;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

export class FlashcardReviewHistoryItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FLASHCARD_RATINGS }) rating: FlashcardRating;
  @ApiProperty() remembered: boolean;
  @ApiProperty() reviewedAt: string;
  @ApiProperty() intervalDays: number;
  @ApiProperty() easeFactor: number;
  @ApiPropertyOptional({ nullable: true }) nextReviewAt: string | null;
}

export class FlashcardHistoryDto {
  @ApiProperty({ type: FlashcardResponseDto }) flashcard: FlashcardResponseDto;
  @ApiProperty({ type: [FlashcardReviewHistoryItemDto] }) reviews: FlashcardReviewHistoryItemDto[];
}

export class FlashcardSummaryDto {
  @ApiProperty() total: number;
  @ApiProperty() due: number;
  @ApiProperty() newCards: number;
  @ApiProperty() totalReviews: number;
  @ApiProperty() rememberedReviews: number;
  @ApiPropertyOptional({ nullable: true, description: 'Percentual de revisões lembradas.' })
  accuracy: number | null;
  @ApiProperty() reviewedToday: number;
}
