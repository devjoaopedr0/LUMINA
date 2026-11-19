import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClassDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;
}

export class JoinClassDto {
  @IsString() @IsNotEmpty() @MaxLength(12)
  joinCode!: string;
}

export class AcceptClassInviteDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  token!: string;
}

export class CreateSimulationDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  title!: string;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsIn(['ACTIVITY', 'LIST', 'TEST', 'SIMULATION'])
  assessmentType?: 'ACTIVITY' | 'LIST' | 'TEST' | 'SIMULATION';

  @IsOptional() @IsDateString()
  dueAt?: string;

  /** Duração em minutos (opcional). Se informado, o cronômetro roda na resolução
   *  e o envio automático ocorre no fim do tempo. */
  @IsOptional() @IsInt() @Min(1) @Max(600)
  durationMinutes?: number;

  /** Modo "prova real": cronômetro obrigatório, sem dicas, resultado só ao final. */
  @IsOptional() @IsBoolean()
  isRealExam?: boolean;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(90) @IsUUID('4', { each: true })
  questionIds!: string[];

  /** Gera automaticamente um cartão-resposta (AnswerSheetTemplate) para
   *  impressão e leitura posterior. Opcional e restrito a quem tem vínculo
   *  de instituição além de aluno (professor, coordenador, diretor) — o
   *  service ignora silenciosamente se quem pediu não tem esse papel. */
  @IsOptional() @IsBoolean()
  generateAnswerSheet?: boolean;
}

export class SimulationAnswerDto {
  @IsInt() @Min(1) @Max(90)
  position!: number;
  /** 0 = em branco. Só o simulado modelo ENEM aceita; os outros recusam no serviço. */
  @IsInt() @Min(0) @Max(5)
  selectedPosition!: number;
}

export class CreateEnemSimulationDto {
  /** Dia de prova: 1 = Linguagens e Humanas; 2 = Natureza e Matemática. */
  @IsInt() @IsIn([1, 2])
  day!: 1 | 2;
}

export class SubmitSimulationDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(90) @ValidateNested({ each: true }) @Type(() => SimulationAnswerDto)
  answers!: SimulationAnswerDto[];
}


export class CreateAcademicPeriodDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;
  @IsDateString()
  startsAt!: string;
  @IsDateString()
  endsAt!: string;
}

export class UpdateAcademicPeriodDto {
  @IsOptional() @IsBoolean()
  active?: boolean;
}


export class UpdateInstitutionMemberDto {
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
  @IsOptional() @IsIn(['TEACHER', 'COORDINATOR'])
  accountType?: 'TEACHER' | 'COORDINATOR';
  @IsOptional() @IsString() @MaxLength(120)
  subject?: string;
}


export class UpdateClassDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500)
  maxStudents?: number | null;
  @IsOptional() @IsUUID()
  subjectId?: string | null;
  @IsOptional() @IsUUID()
  academicPeriodId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(12)
  gradeYear?: number | null;
}

export class ArchiveClassDto {
  @IsBoolean()
  archived!: boolean;
}

export class ClassMemberEmailDto {
  @IsString() @IsNotEmpty() @MaxLength(254)
  email!: string;
}

// =============================================================================
// Answer Sheet Scanner (item 17 do inventário)
// =============================================================================

export class CreateAnswerSheetTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkerDto)
  markers!: MarkerDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BubbleLayoutDto)
  layout!: BubbleLayoutDto[];

  @IsOptional() @IsInt() @Min(100) @Max(5000)
  expectedWidth?: number;

  @IsOptional() @IsInt() @Min(100) @Max(5000)
  expectedHeight?: number;
}

export class MarkerDto {
  @IsString() @IsIn(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'])
  name!: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

export class BubbleLayoutDto {
  @IsInt() @Min(1) @Max(200)
  questionNumber!: number;

  @IsArray() @ValidateNested({ each: true }) @Type(() => BubbleDto)
  bubbles!: BubbleDto[];
}

export class BubbleDto {
  @IsInt() @Min(1) @Max(10)
  position!: number;

  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;

  @IsNumber() @Min(1)
  radius!: number;
}

export class AnswerSheetTemplateResponseDto {
  id: string;
  name: string;
  description: string | null;
  markersJson: any;
  layoutJson: any;
  expectedWidth: number | null;
  expectedHeight: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PresignedUploadUrlDto {
  @IsUUID()
  templateId!: string;

  @IsOptional() @IsUUID()
  simulationId?: string;

  @IsString() @IsIn(['image/jpeg', 'image/png', 'application/pdf'])
  contentType!: string;
}

export class PresignedUploadUrlResponseDto {
  uploadUrl: string;
  uploadId: string;
  key: string;
  expiresIn: number;
}

export class AnswerSheetUploadResponseDto {
  id: string;
  templateId: string;
  simulationId: string | null;
  studentId: string;
  fileUrl: string;
  metaJson: any;
  status: string;
  createdAt: Date;
}

export class AnswerSheetProcessingResponseDto {
  id: string;
  uploadId: string;
  detectedAnswers: Record<string, number>;
  confidenceJson: Record<string, number>;
  warningsJson: any[];
  totalQuestions: number;
  answeredCount: number;
  lowConfidenceCount: number;
  status: string;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export class AnswerSheetSubmissionResponseDto {
  id: string;
  processingId: string;
  simulationId: string;
  studentId: string;
  finalAnswers: Record<string, number>;
  correct: number;
  total: number;
  submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

export class ReviewAnswerSheetDto {
  @IsObject()
  finalAnswers!: Record<string, number>;

  @IsOptional() @IsUUID()
  reviewedBy?: string;
}

// =============================================================================
// Question Scanner (item 18 do inventário)
// =============================================================================

export class QuestionScanUploadUrlDto {
  @IsString() @IsIn(['image/jpeg', 'image/png', 'application/pdf'])
  contentType!: string;
}

export class QuestionScanUploadUrlResponseDto {
  uploadUrl: string;
  uploadId: string;
  key: string;
  expiresIn: number;
}

export class QuestionScanUploadResponseDto {
  id: string;
  userId: string;
  fileUrl: string;
  metaJson: any;
  status: string;
  createdAt: Date;
}

export class QuestionScanProcessingResponseDto {
  id: string;
  uploadId: string;
  stemText: string | null;
  alternativesJson: any;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  explanationJson: any;
  confidence: number | null;
  warningsJson: any;
  status: string;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export class QuestionScanResultResponseDto {
  id: string;
  processingId: string;
  userId: string;
  questionId: string | null;
  errorNotebookEntryId: string | null;
  finalStem: string;
  finalAlternatives: any;
  finalSubject: string;
  finalTopic: string;
  finalDifficulty: string;
  finalExplanation: any;
  savedAt: Date;
}

export class SaveQuestionScanAsQuestionDto {
  @IsString() @IsNotEmpty() @MaxLength(5000)
  finalStem!: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => AlternativeInputDto)
  finalAlternatives!: AlternativeInputDto[];

  @IsString() @IsNotEmpty() @MaxLength(120)
  finalSubject!: string;

  @IsString() @IsNotEmpty() @MaxLength(120)
  finalTopic!: string;

  @IsString() @IsIn(['FACIL', 'MEDIA', 'DIFICIL'])
  finalDifficulty!: 'FACIL' | 'MEDIA' | 'DIFICIL';

  @IsOptional() @IsString() @MaxLength(80)
  exam?: string;

  @IsOptional() @IsObject()
  finalExplanation?: Record<number, string>;
}

export class SaveQuestionScanToErrorNotebookDto {
  @IsString() @IsNotEmpty() @MaxLength(5000)
  finalStem!: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => AlternativeInputDto)
  finalAlternatives!: AlternativeInputDto[];

  @IsString() @IsNotEmpty() @MaxLength(120)
  finalSubject!: string;

  @IsString() @IsNotEmpty() @MaxLength(120)
  finalTopic!: string;

  @IsString() @IsIn(['FACIL', 'MEDIA', 'DIFICIL'])
  finalDifficulty!: 'FACIL' | 'MEDIA' | 'DIFICIL';

  @IsOptional() @IsObject()
  finalExplanation?: Record<number, string>;

  @IsOptional() @IsIn(['FALTA_CONTEUDO', 'ERRO_INTERPRETACAO', 'ERRO_CALCULO', 'FALTA_ATENCAO', 'CHUTE', 'TEMPO_INSUFICIENTE', 'CONFUSAO_CONCEITOS', 'OUTRO'])
  reason?: 'FALTA_CONTEUDO' | 'ERRO_INTERPRETACAO' | 'ERRO_CALCULO' | 'FALTA_ATENCAO' | 'CHUTE' | 'TEMPO_INSUFICIENTE' | 'CONFUSAO_CONCEITOS' | 'OUTRO';

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class AlternativeInputDto {
  @IsInt() @Min(1) @Max(10)
  position!: number;

  @IsString() @IsNotEmpty() @MaxLength(500)
  text!: string;

  @IsOptional() @IsBoolean()
  isCorrect?: boolean;
}

/** Gerador de listas (item 37): critérios da prévia. */
export class GenerateListDto {
  @ApiProperty({ minimum: 5, maximum: 60, example: 15 })
  @Type(() => Number) @IsInt() @Min(5) @Max(60)
  count!: number;

  @ApiProperty({ enum: ['filters', 'weaknesses'], description: 'weaknesses = assuntos mais fracos do aluno (ou da turma, se classId).' })
  @IsIn(['filters', 'weaknesses'])
  basis!: 'filters' | 'weaknesses';

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ enum: ['FACIL', 'MEDIA', 'DIFICIL'] }) @IsOptional() @IsIn(['FACIL', 'MEDIA', 'DIFICIL'])
  difficulty?: 'FACIL' | 'MEDIA' | 'DIFICIL';

  @ApiPropertyOptional({ example: 'ENEM' }) @IsOptional() @IsString() @MaxLength(60)
  exam?: string;

  @ApiPropertyOptional({ example: 2023 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1990) @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Professor: gerar para esta turma.' }) @IsOptional() @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ description: 'Não repetir questões acertadas nos últimos 90 dias.' }) @IsOptional() @IsBoolean()
  skipMastered?: boolean;
}
