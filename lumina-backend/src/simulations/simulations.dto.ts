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
}

export class SimulationAnswerDto {
  @IsInt() @Min(1) @Max(90)
  position!: number;
  @IsInt() @Min(1) @Max(5)
  selectedPosition!: number;
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
