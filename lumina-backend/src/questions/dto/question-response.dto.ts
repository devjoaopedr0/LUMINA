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

  @ApiPropertyOptional({
    description:
      'Apenas na visão de autor (?includeAnswer=true) e no resultado da tentativa: por que esta alternativa está errada. Nunca sai na visão de responder, porque revelaria o gabarito.',
  })
  explanation?: string | null;
}

/** Progresso do aluno em uma questão — o que ele já fez nela. Vai junto da
 * listagem para a interface mostrar o estado real (respondida, favorita,
 * marcada para revisão) sem uma segunda chamada por questão. */
export class QuestionUserProgressDto {
  @ApiProperty({ description: 'Quantas vezes o aluno respondeu a esta questão.' })
  attempts: number;

  @ApiProperty({ description: 'Respostas corretas do aluno.' })
  correctAttempts: number;

  @ApiProperty({ description: 'Respostas erradas do aluno.' })
  incorrectAttempts: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastAttemptAt: Date | null;

  @ApiProperty()
  isFavorite: boolean;

  @ApiProperty({ description: 'O aluno marcou esta questão para revisar.' })
  markedForReview: boolean;
}

export class QuestionStatsDto {
  @ApiProperty({ description: 'Total de respostas registradas na questão.' })
  attempts: number;

  @ApiProperty({ description: 'Respostas corretas.' })
  correct: number;

  @ApiProperty({ description: 'Percentual de acerto arredondado (0-100).' })
  accuracyPercent: number;
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

  @ApiPropertyOptional({
    type: () => QuestionStatsDto,
    description: 'Estatísticas agregadas de acerto da questão (null enquanto não houver respostas).',
  })
  stats?: QuestionStatsDto | null;

  @ApiPropertyOptional({ description: 'URL de imagem de apoio.' })
  imageUrl?: string | null;

  @ApiPropertyOptional({ description: 'PDF e página oficiais de origem quando identificados na importação.' })
  sourcePdf?: { url: string; page: number } | null;

  @ApiPropertyOptional({
    description:
      'true se o usuário autenticado pode editar/excluir esta questão (dono do workspace pessoal ou admin do banco).',
  })
  canManage?: boolean;

  @ApiProperty({ type: () => [QuestionAlternativeDto] })
  alternatives: QuestionAlternativeDto[];

  @ApiPropertyOptional({
    type: () => QuestionUserProgressDto,
    description: 'Progresso do aluno autenticado nesta questão (null se ele ainda não interagiu com ela).',
  })
  progress?: QuestionUserProgressDto | null;

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

  @ApiPropertyOptional({
    type: () => [AlternativeFeedbackDto],
    description:
      'Explicação por alternativa, quando o autor da questão as escreveu. Só existe depois de responder: é aqui que o aluno descobre por que cada alternativa errada está errada.',
  })
  explanations?: AlternativeFeedbackDto[];

  @ApiPropertyOptional({
    type: () => QuestionStatsDto,
    description: 'Estatísticas agregadas de acerto da questão, já contando esta tentativa.',
  })
  stats?: QuestionStatsDto | null;
}

/** Explicação de uma alternativa, entregue só depois da resposta. */
export class AlternativeFeedbackDto {
  @ApiProperty({ description: 'Posição da alternativa (1 = A, 2 = B, ...).' })
  position: number;

  @ApiProperty()
  text: string;

  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty({ description: 'true se foi a alternativa escolhida pelo aluno.' })
  selected: boolean;

  @ApiProperty({ description: 'Por que esta alternativa está errada (texto do autor da questão).' })
  explanation: string;
}

export class SimilarQuestionsDto {
  @ApiProperty({ type: () => [QuestionResponseDto] })
  items: QuestionResponseDto[];

  @ApiProperty({ example: 5, description: 'Limite efetivo aplicado.' })
  limit: number;
}
