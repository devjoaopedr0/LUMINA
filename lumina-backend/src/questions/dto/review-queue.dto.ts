import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * De onde vem o item da central de revisões. `FLASHCARD` é a revisão espaçada
 * do cartão criado no item 32.
 */
export type ReviewQueueKind = 'TOPIC' | 'ERROR_NOTEBOOK' | 'FLASHCARD' | 'MARKED_QUESTION';

export class ReviewQueueItemDto {
  @ApiProperty({ enum: ['TOPIC', 'ERROR_NOTEBOOK', 'FLASHCARD', 'MARKED_QUESTION'] })
  kind: ReviewQueueKind;

  @ApiProperty({ description: 'Identificador estável dentro do tipo (id do domínio ou da questão).' })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  questionId: string | null;

  @ApiPropertyOptional({ nullable: true })
  subjectId: string | null;

  @ApiProperty()
  subject: string;

  @ApiPropertyOptional({ nullable: true })
  topicId: string | null;

  @ApiProperty()
  topic: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Dia de vencimento como data-calendário (meia-noite UTC do dia de Brasília).',
  })
  dueAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  masteryScore: number | null;

  @ApiPropertyOptional({ nullable: true })
  status: string | null;

  @ApiPropertyOptional({ nullable: true })
  attempts: number | null;

  @ApiPropertyOptional({ nullable: true })
  correctAttempts: number | null;

  @ApiPropertyOptional({ nullable: true })
  accuracy: number | null;

  @ApiPropertyOptional({ nullable: true })
  wrongAttempts: number | null;

  @ApiPropertyOptional({ nullable: true })
  correctStreak: number | null;

  @ApiPropertyOptional({ nullable: true })
  difficulty: string | null;

  @ApiPropertyOptional({ nullable: true })
  exam: string | null;

  @ApiPropertyOptional({ nullable: true })
  year: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Enunciado resumido para dar contexto ao item.' })
  stem: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastAttemptAt: string | null;
}

export class ReviewQueueDueDto {
  @ApiProperty({ description: 'Tópicos vencidos + questões do caderno + flashcards vencidas.' })
  total: number;

  @ApiProperty()
  topics: number;

  @ApiProperty()
  errorNotebook: number;

  @ApiProperty()
  flashcards: number;

  @ApiProperty({ type: [ReviewQueueItemDto] })
  items: ReviewQueueItemDto[];

  @ApiProperty({ description: 'Há mais itens vencidos do que o limite devolvido.' })
  truncated: boolean;
}

export class ReviewQueueManualDto {
  @ApiProperty({ description: 'Questões marcadas para revisar que ainda não estão no caderno de erros.' })
  total: number;

  @ApiProperty({ type: [ReviewQueueItemDto] })
  items: ReviewQueueItemDto[];

  @ApiProperty()
  truncated: boolean;
}

export class ReviewQueueResponseDto {
  @ApiProperty()
  generatedAt: string;

  @ApiProperty({ type: ReviewQueueDueDto })
  due: ReviewQueueDueDto;

  @ApiProperty({ type: ReviewQueueManualDto })
  manual: ReviewQueueManualDto;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Próxima revisão futura conhecida, para a tela não ficar sem orientação quando nada venceu.',
  })
  nextReviewAt: string | null;
}
