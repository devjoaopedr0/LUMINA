import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorNotebookStatus, ErrorReason, QuestionDifficulty } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Quantos acertos seguidos depois do erro fecham a questão como dominada.
 *  Um acerto só não prova nada (pode ter sido chute depois de ver o gabarito);
 *  dois seguidos, sim. A entrada continua no histórico — a evolução é o que
 *  mostra o progresso — mas sai da fila do que precisa ser refeito. */
export const ERROR_NOTEBOOK_MASTERED_STREAK = 2;

/** Tamanho máximo da linha do tempo de tentativas ("EEAA"). Mais que isso e o
 *  registro deixa de ser uma leitura e vira ruído. */
export const ERROR_NOTEBOOK_EVOLUTION_LIMIT = 40;

/** Motivos do erro no vocabulário do item 13 do inventário, com o rótulo que
 *  a interface mostra. O valor gravado é o enum — o rótulo é apresentação. */
export const ERROR_REASON_LABELS: Record<ErrorReason, string> = {
  FALTA_CONTEUDO: 'Falta de conteúdo',
  ERRO_INTERPRETACAO: 'Erro de interpretação',
  ERRO_CALCULO: 'Erro de cálculo',
  FALTA_ATENCAO: 'Falta de atenção',
  CHUTE: 'Chute',
  TEMPO_INSUFICIENTE: 'Tempo insuficiente',
  CONFUSAO_CONCEITOS: 'Confusão entre conceitos',
  OUTRO: 'Outro motivo',
};

/** Um item do caderno, com o resumo da questão junto: o aluno não deveria
 *  precisar abrir o banco de questões para lembrar o que precisa refazer. */
export class ErrorNotebookEntryDto {
  @ApiProperty()
  questionId: string;

  @ApiProperty({ description: 'Matéria da questão (fonte única: a da questão).' })
  subject: string;

  @ApiProperty()
  topic: string;

  @ApiProperty({ enum: QuestionDifficulty })
  difficulty: QuestionDifficulty;

  @ApiProperty()
  exam: string;

  @ApiProperty({ nullable: true })
  year: number | null;

  @ApiProperty({ nullable: true, description: 'Número da questão na prova, quando houver.' })
  examNumber: number | null;

  @ApiProperty({ description: 'Enunciado truncado para a lista do caderno.' })
  stem: string;

  @ApiProperty({ enum: ErrorReason, nullable: true, description: 'Motivo do erro, quando o aluno classificou.' })
  reason: ErrorReason | null;

  @ApiProperty({ nullable: true, description: 'Observação pessoal do aluno.' })
  notes: string | null;

  @ApiProperty({ enum: ErrorNotebookStatus })
  status: ErrorNotebookStatus;

  @ApiProperty({ description: 'Quantas vezes o aluno errou desde que a questão entrou no caderno.' })
  wrongAttempts: number;

  @ApiProperty({ description: 'Acertos seguidos desde o último erro.' })
  correctStreak: number;

  @ApiProperty({ description: 'Linha do tempo: "E" = erro, "A" = acerto.' })
  evolution: string;

  @ApiProperty({ nullable: true, description: 'Data-calendário da revisão (meia-noite UTC do dia de Brasília).' })
  reviewScheduledAt: string | null;

  @ApiProperty({
    description: 'true quando a entrada está aberta e a revisão é para hoje/antes ou está sem data.',
  })
  due: boolean;

  @ApiProperty()
  firstWrongAt: string;

  @ApiProperty()
  lastWrongAt: string;

  @ApiProperty({ nullable: true, description: 'Quando a questão virou dominada.' })
  resolvedAt: string | null;
}

export class PaginatedErrorNotebookDto {
  @ApiProperty({ type: [ErrorNotebookEntryDto] })
  items: ErrorNotebookEntryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  limit: number;
}

/** Um recorte do caderno (por matéria, assunto, motivo ou dificuldade). O
 *  rótulo é o nome como o aluno vê no cartão, e a contagem é de itens
 *  abertos — é o número que ajuda a decidir o que estudar primeiro. */
export class ErrorNotebookFacetDto {
  @ApiProperty({ description: 'Matéria, assunto, motivo ou rótulo da dificuldade.' })
  label: string;

  @ApiProperty({ description: 'Valor a enviar no filtro correspondente.' })
  value: string;

  @ApiProperty()
  open: number;

  @ApiProperty()
  mastered: number;
}

export class ErrorNotebookSummaryDto {
  @ApiProperty({ description: 'Total de itens no caderno (abertos + dominados).' })
  total: number;

  @ApiProperty()
  open: number;

  @ApiProperty()
  mastered: number;

  @ApiProperty({
    description: 'Itens abertos com revisão para hoje/antes ou sem data (dívida pendente).',
  })
  dueToday: number;

  @ApiProperty({ description: 'Itens abertos sem motivo classificado ainda.' })
  withoutReason: number;

  @ApiProperty({ type: [ErrorNotebookFacetDto] })
  bySubject: ErrorNotebookFacetDto[];

  @ApiProperty({ type: [ErrorNotebookFacetDto] })
  byTopic: ErrorNotebookFacetDto[];

  @ApiProperty({ type: [ErrorNotebookFacetDto] })
  byReason: ErrorNotebookFacetDto[];
}

export class UpdateErrorNotebookEntryDto {
  @ApiPropertyOptional({ enum: ErrorReason, description: 'Motivo do erro (item 13). null limpa a classificação.' })
  @IsOptional()
  @IsEnum(ErrorReason, { message: 'Motivo do erro inválido.' })
  reason?: ErrorReason | null;

  @ApiPropertyOptional({ description: 'Observação pessoal. String vazia limpa a observação.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'A observação pode ter no máximo 1000 caracteres.' })
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Data (YYYY-MM-DD) da revisão combinada. null ou string vazia cancela a revisão.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  reviewScheduledOn?: string | null;
}
