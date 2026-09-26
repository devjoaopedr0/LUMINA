import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QuestionProgressDto {
  @ApiProperty()
  questionId: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  topic: string;

  @ApiProperty()
  exam: string;

  @ApiProperty({ nullable: true })
  year: number | null;

  @ApiProperty({ description: 'Enunciado (truncado para listagem).' })
  stem: string;

  @ApiProperty()
  attempts: number;

  @ApiProperty()
  correctAttempts: number;

  @ApiProperty()
  incorrectAttempts: number;

  @ApiProperty({ nullable: true })
  lastAttemptAt: Date | null;

  @ApiProperty()
  isFavorite: boolean;

  @ApiProperty({ description: 'O usuário marcou esta questão para revisar.' })
  markedForReview: boolean;

  @ApiProperty({ description: 'Taxa de acerto em percentual (0-100).' })
  accuracy: number;
}

export class PaginatedProgressDto {
  @ApiProperty({ type: () => [QuestionProgressDto] })
  items: QuestionProgressDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  limit: number;
}

export class SubjectPerformanceDto {
  @ApiProperty({ nullable: true })
  subjectId: string | null;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  totalAttempts: number;

  @ApiProperty()
  correct: number;

  @ApiProperty({ description: 'Taxa de acerto em percentual (0-100).' })
  accuracy: number;
}

export class TopicPerformanceDto {
  @ApiProperty({ nullable: true })
  topicId: string | null;

  @ApiProperty()
  topic: string;

  @ApiProperty()
  totalAttempts: number;

  @ApiProperty()
  correct: number;

  @ApiProperty({ description: 'Taxa de acerto em percentual (0-100).' })
  accuracy: number;
}

export class PerformanceResponseDto {
  @ApiProperty({ description: 'Totais gerais.' })
  summary: {
    totalAttempts: number;
    correct: number;
    accuracy: number;
  };

  @ApiProperty({ type: () => [SubjectPerformanceDto] })
  bySubject: SubjectPerformanceDto[];

  @ApiProperty({ type: () => [TopicPerformanceDto] })
  byTopic: TopicPerformanceDto[];
}

export class FavoriteToggleResultDto {
  @ApiProperty()
  isFavorite: boolean;
}
